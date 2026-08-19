import { ContractValidationError, parseEventEnvelope } from '@modern-agent/shared-contracts';
import type { EventEnvelope, OperationId } from '@modern-agent/shared-contracts';

export interface SseFrame {
  readonly id?: string;
  readonly event?: string;
  readonly data: string;
}

export class SseProtocolError extends Error {
  readonly code = 'SSE_PROTOCOL_ERROR' as const;
}

export class SseFrameParser {
  private buffer = '';
  private dataLines: string[] = [];
  private id: string | undefined;
  private event: string | undefined;

  feed(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    while (true) {
      const lineFeedIndex = this.buffer.indexOf('\n');
      const carriageReturnIndex = this.buffer.indexOf('\r');
      const newlineIndex =
        lineFeedIndex < 0
          ? carriageReturnIndex
          : carriageReturnIndex < 0
            ? lineFeedIndex
            : Math.min(lineFeedIndex, carriageReturnIndex);
      if (newlineIndex < 0) break;

      const terminator = this.buffer[newlineIndex];
      if (terminator === '\r' && newlineIndex === this.buffer.length - 1) break;

      const line = this.buffer.slice(0, newlineIndex);
      const terminatorLength =
        terminator === '\r' && this.buffer[newlineIndex + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(newlineIndex + terminatorLength);
      if (line === '') {
        const frame = this.flushFrame();
        if (frame !== undefined) frames.push(frame);
      } else if (!line.startsWith(':')) {
        const separator = line.indexOf(':');
        const field = separator < 0 ? line : line.slice(0, separator);
        const rawValue = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /u, '');
        if (field === 'id') this.id = rawValue;
        else if (field === 'event') this.event = rawValue;
        else if (field === 'data') this.dataLines.push(rawValue);
      }
    }
    return frames;
  }

  finish(): SseFrame[] {
    if (this.buffer !== '') {
      const frames = this.feed('\n\n');
      const frame = this.flushFrame();
      return frame === undefined ? frames : [...frames, frame];
    }
    const frame = this.flushFrame();
    return frame === undefined ? [] : [frame];
  }

  private flushFrame(): SseFrame | undefined {
    if (this.dataLines.length === 0) {
      this.id = undefined;
      this.event = undefined;
      return undefined;
    }
    const frame: SseFrame = {
      ...(this.id === undefined ? {} : { id: this.id }),
      ...(this.event === undefined ? {} : { event: this.event }),
      data: this.dataLines.join('\n'),
    };
    this.id = undefined;
    this.event = undefined;
    this.dataLines = [];
    return frame;
  }
}

export function parseSseEventData(input: string): EventEnvelope {
  let json: unknown;
  try {
    json = JSON.parse(input) as unknown;
  } catch {
    throw new SseProtocolError('SSE data was not valid JSON');
  }
  try {
    return parseEventEnvelope(json);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new SseProtocolError('SSE data failed EventEnvelope validation');
    throw error;
  }
}

export function parseTransportEvent(input: unknown): EventEnvelope {
  try {
    return parseEventEnvelope(input);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new SseProtocolError('Transport event failed EventEnvelope validation');
    throw error;
  }
}

export function buildEventStreamUrl(
  baseUrl: string,
  operationId: OperationId,
  afterSequence: number,
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`talk/operations/${encodeURIComponent(operationId)}/events`, normalizedBase);
  url.searchParams.set('afterSequence', String(afterSequence));
  return url.toString();
}

export interface ConsumeEventStreamOptions {
  readonly url: string;
  readonly afterSequence: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly onEvent: (event: EventEnvelope) => void;
}

export async function consumeEventStream(
  options: ConsumeEventStreamOptions,
): Promise<{ readonly lastSequence: number; readonly terminal: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestInit: RequestInit =
    options.signal === undefined
      ? { headers: { Accept: 'text/event-stream' } }
      : { headers: { Accept: 'text/event-stream' }, signal: options.signal };
  const response = await fetchImpl(options.url, requestInit);
  if (!response.ok) throw new SseProtocolError(`SSE request failed with status ${response.status}`);
  if (response.body === null) throw new SseProtocolError('SSE response had no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();
  let lastSequence = options.afterSequence;
  let terminal = false;
  const consumeFrames = (frames: readonly SseFrame[]): void => {
    for (const frame of frames) {
      const event = parseSseEventData(frame.data);
      if (event.sequence <= lastSequence) continue;
      lastSequence = event.sequence;
      options.onEvent(event);
      terminal = event.type === 'operation.completed' || event.type === 'operation.failed';
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    consumeFrames(parser.feed(decoder.decode(chunk.value, { stream: true })));
  }
  consumeFrames(parser.feed(decoder.decode()));
  consumeFrames(parser.finish());
  return { lastSequence, terminal };
}

export interface EventStreamSessionOptions extends Omit<
  ConsumeEventStreamOptions,
  'url' | 'afterSequence' | 'onEvent'
> {
  readonly baseUrl: string;
  readonly operationId: OperationId;
  readonly afterSequence?: number;
  readonly onEvent: (event: EventEnvelope) => void;
  readonly onError?: (error: unknown) => void;
  readonly reconnectDelayMs?: number;
}

export function createEventStreamSession(options: EventStreamSessionOptions) {
  let closed = false;
  let started = false;
  let cursor = options.afterSequence ?? 0;
  let promise: Promise<void> | undefined;
  const controller = new AbortController();
  const start = (): Promise<void> => {
    if (promise !== undefined) return promise;
    started = true;
    promise = (async () => {
      while (!closed) {
        try {
          const result = await consumeEventStream({
            ...options,
            url: buildEventStreamUrl(options.baseUrl, options.operationId, cursor),
            afterSequence: cursor,
            signal: controller.signal,
            onEvent: (event) => {
              options.onEvent(event);
              cursor = event.sequence;
            },
          });
          cursor = result.lastSequence;
          if (result.terminal) return;
          if (!closed)
            await new Promise<void>((resolve) =>
              setTimeout(resolve, options.reconnectDelayMs ?? 50),
            );
        } catch (error) {
          if (closed) return;
          options.onError?.(error);
          await new Promise<void>((resolve) => setTimeout(resolve, options.reconnectDelayMs ?? 50));
        }
      }
    })();
    return promise;
  };
  return {
    start,
    close() {
      closed = true;
      controller.abort();
    },
    get afterSequence() {
      return cursor;
    },
    get isStarted() {
      return started;
    },
  };
}

export interface EventStreamRegistryOptions {
  readonly onEvent: (event: EventEnvelope) => void;
  readonly onError?: (error: unknown) => void;
}

export function createEventStreamRegistry(options: EventStreamRegistryOptions) {
  const sessions = new Map<string, ReturnType<typeof createEventStreamSession>>();

  return {
    start(sessionOptions: Omit<EventStreamSessionOptions, 'onEvent' | 'onError'>): void {
      const session = createEventStreamSession({
        ...sessionOptions,
        onEvent: options.onEvent,
        ...(options.onError === undefined ? {} : { onError: options.onError }),
      });
      sessions.set(sessionOptions.operationId, session);
      void session.start();
    },
    close(operationId: OperationId): void {
      sessions.get(operationId)?.close();
      sessions.delete(operationId);
    },
  };
}

/** Stable bootstrap identity; not a business contract. */
export const FRONTEND_REALTIME_MODULE = 'frontend-realtime' as const;
