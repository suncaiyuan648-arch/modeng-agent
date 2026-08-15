import { createAgentRuntime } from '@modern-agent/backend-agent-runtime';
import { createTalkCapability } from '@modern-agent/backend-capability-talk';
import { createInMemoryEventStream } from '@modern-agent/backend-event-realtime';
import { createFakeModelExecutionPort } from '@modern-agent/backend-model-supply';
import { createInMemoryTaskEngine } from '@modern-agent/backend-task-engine';
import type { FakeModelFailureMode } from '@modern-agent/backend-model-supply';
import type { AgentRuntime } from '@modern-agent/backend-agent-runtime';
import type { InMemoryEventStream } from '@modern-agent/backend-event-realtime';

export interface TalkComposition {
  readonly runtime: AgentRuntime;
  readonly eventStream: InMemoryEventStream;
}

export const TALK_COMPOSITION_TOKEN = Symbol('TALK_COMPOSITION');

export interface TalkCompositionOptions {
  readonly failureMode?: FakeModelFailureMode;
}

export function createTalkComposition(options: TalkCompositionOptions = {}): TalkComposition {
  const eventStream = createInMemoryEventStream();
  const model = createFakeModelExecutionPort({ failureMode: options.failureMode ?? 'never' });
  return {
    eventStream,
    runtime: createAgentRuntime({
      taskEngine: createInMemoryTaskEngine(),
      eventStream,
      talkCapability: createTalkCapability(model),
    }),
  };
}
