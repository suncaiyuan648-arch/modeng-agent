import { createAgentRuntime } from '@modern-agent/backend-agent-runtime';
import { createTalkCapability } from '@modern-agent/backend-capability-talk';
import { createInMemoryEventStream } from '@modern-agent/backend-event-realtime';
import { createInMemoryTaskEngine } from '@modern-agent/backend-task-engine';
import type { AgentRuntime } from '@modern-agent/backend-agent-runtime';
import type { InMemoryEventStream } from '@modern-agent/backend-event-realtime';
import type { ModelSupplyComposition } from '@modern-agent/backend-model-supply';

export interface TalkComposition {
  readonly runtime: AgentRuntime;
  readonly eventStream: InMemoryEventStream;
}

export const TALK_COMPOSITION_TOKEN = Symbol('TALK_COMPOSITION');

export function createTalkComposition(modelSupply: ModelSupplyComposition): TalkComposition {
  const eventStream = createInMemoryEventStream();
  return {
    eventStream,
    runtime: createAgentRuntime({
      taskEngine: createInMemoryTaskEngine(),
      eventStream,
      talkCapability: createTalkCapability({
        resolvePlan: modelSupply.resolveTalkExecutionPlan,
        modelExecution: modelSupply.executionPort,
      }),
    }),
  };
}
