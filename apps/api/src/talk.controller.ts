import {
  Body,
  Controller,
  Inject,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import {
  ContractValidationError,
  OperationIdSchema,
  parseEventEnvelope,
} from '@modern-agent/shared-contracts';
import type { EventEnvelope, PlatformError } from '@modern-agent/shared-contracts';

import { TALK_COMPOSITION_TOKEN } from './talk.composition.js';
import type { TalkComposition } from './talk.composition.js';

interface ServerSentEvent {
  readonly id: string;
  readonly data: EventEnvelope;
}

function platformError(
  code: PlatformError['code'],
  message: string,
  retryable: boolean,
): PlatformError {
  return { code, message, retryable };
}

function httpError(error: unknown): HttpException {
  if (error instanceof ContractValidationError) {
    return new HttpException(
      { error: platformError('INVALID_INPUT', 'The request is invalid.', false) },
      HttpStatus.BAD_REQUEST,
    );
  }
  return new HttpException(
    { error: platformError('INTERNAL_ERROR', 'The request could not be completed.', false) },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

@Controller('talk')
export class TalkController {
  constructor(@Inject(TALK_COMPOSITION_TOKEN) private readonly composition: TalkComposition) {}

  @Post('submit')
  submit(@Body() body: unknown): EventEnvelope {
    try {
      return this.composition.runtime.submit(body).acceptedEvent;
    } catch (error) {
      throw httpError(error);
    }
  }

  @Sse('operations/:operationId/events')
  events(
    @Param('operationId') operationIdInput: string,
    @Query('afterSequence') afterSequenceInput?: string,
  ): Observable<ServerSentEvent> {
    const operationResult = OperationIdSchema.safeParse(operationIdInput);
    if (!operationResult.success || !this.composition.runtime.hasOperation(operationResult.data)) {
      throw new HttpException(
        { error: platformError('NOT_FOUND', 'The operation was not found.', false) },
        HttpStatus.NOT_FOUND,
      );
    }

    const afterSequence =
      afterSequenceInput === undefined ? 0 : Number.parseInt(afterSequenceInput, 10);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new HttpException(
        { error: platformError('INVALID_INPUT', 'The replay cursor is invalid.', false) },
        HttpStatus.BAD_REQUEST,
      );
    }

    return new Observable<ServerSentEvent>((subscriber) => {
      let closed = false;
      void (async () => {
        try {
          for await (const event of this.composition.eventStream.subscribe(
            operationResult.data,
            afterSequence,
          )) {
            if (closed) return;
            subscriber.next({ id: String(event.sequence), data: parseEventEnvelope(event) });
          }
          if (!closed) subscriber.complete();
        } catch {
          if (!closed) subscriber.error(httpError(new Error('stream failure')));
        }
      })();
      return () => {
        closed = true;
      };
    });
  }
}
