import {
  ContractValidationError,
  parseEventEnvelope,
  validateOperationEventStream,
} from '@modern-agent/shared-contracts';
import type { EventEnvelope, OperationId } from '@modern-agent/shared-contracts';

export interface InMemoryEventStream {
  append(input: unknown): EventEnvelope;
  replay(operationId: OperationId, afterSequence?: number): readonly EventEnvelope[];
  subscribe(operationId: OperationId, afterSequence?: number): AsyncIterable<EventEnvelope>;
  hasOperation(operationId: OperationId): boolean;
  list(operationId: OperationId): readonly EventEnvelope[];
}

function isTerminal(event: EventEnvelope): boolean {
  return event.type === 'operation.completed' || event.type === 'operation.failed';
}

export function createInMemoryEventStream(): InMemoryEventStream {
  const eventsByOperation = new Map<OperationId, EventEnvelope[]>();
  const waitersByOperation = new Map<OperationId, Set<() => void>>();

  const listEvents = (operationId: OperationId): readonly EventEnvelope[] => [
    ...(eventsByOperation.get(operationId) ?? []),
  ];
  const replayEvents = (operationId: OperationId, afterSequence = 0): readonly EventEnvelope[] => {
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new ContractValidationError('afterSequence must be a non-negative integer');
    }
    return listEvents(operationId).filter((event) => event.sequence > afterSequence);
  };

  const notify = (operationId: OperationId): void => {
    const waiters = waitersByOperation.get(operationId);
    if (waiters === undefined) return;
    for (const waiter of waiters) waiter();
    waiters.clear();
  };

  return {
    append(input) {
      const event = parseEventEnvelope(input);
      const events = eventsByOperation.get(event.operationId) ?? [];
      const existing = events.find((candidate) => candidate.eventId === event.eventId);
      if (existing !== undefined) return existing;
      validateOperationEventStream([...events, event]);
      events.push(event);
      eventsByOperation.set(event.operationId, events);
      notify(event.operationId);
      return event;
    },
    replay(operationId, afterSequence = 0) {
      return replayEvents(operationId, afterSequence);
    },
    subscribe(operationId, afterSequence = 0): AsyncIterable<EventEnvelope> {
      return (async function* (): AsyncIterable<EventEnvelope> {
        let cursor = afterSequence;
        while (true) {
          const next = replayEvents(operationId, cursor)[0];
          if (next !== undefined) {
            cursor = next.sequence;
            yield next;
            if (isTerminal(next)) return;
            continue;
          }

          const events = listEvents(operationId);
          if (events.at(-1) !== undefined && isTerminal(events.at(-1)!)) return;
          await new Promise<void>((resolve) => {
            const waiters = waitersByOperation.get(operationId) ?? new Set<() => void>();
            waiters.add(resolve);
            waitersByOperation.set(operationId, waiters);
          });
        }
      })();
    },
    hasOperation(operationId) {
      return eventsByOperation.has(operationId);
    },
    list(operationId) {
      return listEvents(operationId);
    },
  };
}

/** Stable bootstrap identity; not a business contract. */
export const BACKEND_EVENT_REALTIME_MODULE = 'backend-event-realtime' as const;
