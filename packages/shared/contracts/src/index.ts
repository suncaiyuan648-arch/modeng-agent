import { z } from 'zod';

/** Stable bootstrap identity and the only schema major supported by this package. */
export const SHARED_CONTRACTS_MODULE = 'shared-contracts' as const;
export const SCHEMA_VERSION = 1 as const;

export const MAX_TALK_INPUT_LENGTH = 4_000;
export const MAX_TALK_OUTPUT_DELTA_LENGTH = 4_000;
export const MAX_EXECUTION_GRAPH_NODES = 16;
export const MAX_TASK_ATTEMPT = 1_000;
export const MAX_EVENT_SEQUENCE = 1_000_000_000;

const schemaVersionSchema = z.literal(SCHEMA_VERSION);
const identifierPart = '[A-Za-z0-9][A-Za-z0-9_-]{0,63}';

function identifierSchema(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}_${identifierPart}$`), {
    message: `identifier must use the ${prefix}_ prefix`,
  });
}

export const BrandIdSchema = identifierSchema('brand').brand<'BrandId'>();
export const ProjectIdSchema = identifierSchema('project').brand<'ProjectId'>();
export const OperationIdSchema = identifierSchema('operation').brand<'OperationId'>();
export const ExecutionGraphIdSchema = identifierSchema('graph').brand<'ExecutionGraphId'>();
export const ExecutionNodeIdSchema = identifierSchema('node').brand<'ExecutionNodeId'>();
export const TaskRunIdSchema = identifierSchema('task').brand<'TaskRunId'>();
export const ArtifactIdSchema = identifierSchema('artifact').brand<'ArtifactId'>();
export const CommandIdSchema = identifierSchema('command').brand<'CommandId'>();
export const EventIdSchema = identifierSchema('event').brand<'EventId'>();

export type BrandId = z.infer<typeof BrandIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type OperationId = z.infer<typeof OperationIdSchema>;
export type ExecutionGraphId = z.infer<typeof ExecutionGraphIdSchema>;
export type ExecutionNodeId = z.infer<typeof ExecutionNodeIdSchema>;
export type TaskRunId = z.infer<typeof TaskRunIdSchema>;
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;
export type CommandId = z.infer<typeof CommandIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;

const isoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'must be an ISO-8601 timestamp with a timezone',
  })
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'must be a valid timestamp',
  });

const safeTextSchema = z.string().min(1).max(MAX_TALK_INPUT_LENGTH);
const eventTextSchema = z.string().min(1).max(MAX_TALK_OUTPUT_DELTA_LENGTH);

export const ProjectRefSchema = z
  .object({
    projectId: ProjectIdSchema,
    brandId: BrandIdSchema,
    domain: z.literal('TALK'),
  })
  .strict();
export type ProjectRef = z.infer<typeof ProjectRefSchema>;

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
    message: 'idempotencyKey contains unsupported characters',
  });

export const TalkSubmitCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    commandId: CommandIdSchema,
    idempotencyKey: idempotencyKeySchema,
    type: z.literal('talk.submit'),
    project: ProjectRefSchema,
    input: z.object({ text: safeTextSchema }).strict(),
  })
  .strict();
export type TalkSubmitCommand = z.infer<typeof TalkSubmitCommandSchema>;

export const OperationStatusSchema = z.enum([
  'accepted',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

export const OperationRefSchema = z
  .object({
    operationId: OperationIdSchema,
    project: ProjectRefSchema,
    status: OperationStatusSchema,
    executionGraphId: ExecutionGraphIdSchema,
    createdAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
  })
  .strict();
export type OperationRef = z.infer<typeof OperationRefSchema>;

export const ExecutionNodeSchema = z
  .object({
    nodeId: ExecutionNodeIdSchema,
    kind: z.literal('talk'),
    dependsOn: z.array(ExecutionNodeIdSchema).max(MAX_EXECUTION_GRAPH_NODES - 1),
  })
  .strict();
export type ExecutionNode = z.infer<typeof ExecutionNodeSchema>;

export const ExecutionGraphRefSchema = z
  .object({
    executionGraphId: ExecutionGraphIdSchema,
    operationId: OperationIdSchema,
    rootNodeId: ExecutionNodeIdSchema,
    nodes: z.array(ExecutionNodeSchema).min(1).max(MAX_EXECUTION_GRAPH_NODES),
  })
  .strict()
  .superRefine((graph, context) => {
    const nodeById = new Map<string, ExecutionNode>();
    const duplicateIds = new Set<string>();

    for (const node of graph.nodes) {
      if (nodeById.has(node.nodeId)) {
        duplicateIds.add(node.nodeId);
      }
      nodeById.set(node.nodeId, node);
    }

    for (const [index, node] of graph.nodes.entries()) {
      const dependencyIds = new Set<string>();
      for (const dependencyId of node.dependsOn) {
        if (!nodeById.has(dependencyId)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index, 'dependsOn'],
            message: `unknown dependency: ${dependencyId}`,
          });
        }
        if (dependencyId === node.nodeId) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index, 'dependsOn'],
            message: 'a node cannot depend on itself',
          });
        }
        if (dependencyIds.has(dependencyId)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index, 'dependsOn'],
            message: 'duplicate dependency',
          });
        }
        dependencyIds.add(dependencyId);
      }
    }

    for (const duplicateId of duplicateIds) {
      context.addIssue({
        code: 'custom',
        path: ['nodes'],
        message: `duplicate node id: ${duplicateId}`,
      });
    }

    const rootNodes = graph.nodes.filter((node) => node.dependsOn.length === 0);
    if (rootNodes.length !== 1 || rootNodes[0]?.nodeId !== graph.rootNodeId) {
      context.addIssue({
        code: 'custom',
        path: ['rootNodeId'],
        message: 'the graph must have exactly one root matching rootNodeId',
      });
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (nodeId: string): void => {
      if (visiting.has(nodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: 'execution graph contains a cycle',
        });
        return;
      }
      if (visited.has(nodeId)) {
        return;
      }

      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      visiting.add(nodeId);
      for (const dependencyId of node.dependsOn) {
        visit(dependencyId);
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    for (const node of graph.nodes) {
      visit(node.nodeId);
    }
  });
export type ExecutionGraphRef = z.infer<typeof ExecutionGraphRefSchema>;

export const TaskRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type TaskRunStatus = z.infer<typeof TaskRunStatusSchema>;

export const TaskRunRefSchema = z
  .object({
    taskRunId: TaskRunIdSchema,
    operationId: OperationIdSchema,
    nodeId: ExecutionNodeIdSchema,
    attempt: z.number().int().min(1).max(MAX_TASK_ATTEMPT),
    status: TaskRunStatusSchema,
  })
  .strict();
export type TaskRunRef = z.infer<typeof TaskRunRefSchema>;

export const ArtifactStatusSchema = z.enum(['draft', 'ready', 'failed']);
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;

export const ArtifactBaseSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    operationId: OperationIdSchema,
    kind: z.literal('text'),
    status: ArtifactStatusSchema,
    schemaVersion: schemaVersionSchema,
    createdAt: isoTimestampSchema,
  })
  .strict();
export type ArtifactBase = z.infer<typeof ArtifactBaseSchema>;

export const PLATFORM_ERROR_CODES = [
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'TIMEOUT',
  'CANCELLED',
  'INTERNAL_ERROR',
] as const;
export const PlatformErrorCodeSchema = z.enum(PLATFORM_ERROR_CODES);
export type PlatformErrorCode = z.infer<typeof PlatformErrorCodeSchema>;

const unsafeDetailKeySchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9_]{0,31}$/, {
    message: 'detail keys must be short lower-camel-case names',
  })
  .refine(
    (key) =>
      !/(secret|credential|token|password|authorization|provider|raw|prompt|reasoning|stack|database|sql|prisma|internal)/i.test(
        key,
      ),
    { message: 'detail key is not safe for a platform error' },
  );

const safeDetailsSchema = z
  .record(
    unsafeDetailKeySchema,
    z
      .string()
      .max(256)
      .regex(/^[^\r\n]*$/, {
        message: 'detail values must be a single safe line',
      })
      .refine(
        (value) =>
          !/(?:bearer\s+[A-Za-z0-9._~+/=-]+|(?:api[_ -]?key|secret|password)\s*[:=]|raw[-_ ]?(?:provider|response)|provider\s+(?:response|data|payload)|system\s+prompt|hidden\s+reasoning|stack\s+trace|\bprisma\b|\bselect\s+.+\s+from\b)/i.test(
            value,
          ),
        { message: 'detail value contains unsafe internal or credential material' },
      ),
  )
  .refine((details) => Object.keys(details).length <= 8, {
    message: 'details may contain at most 8 entries',
  });

const safePlatformMessageSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\r\n]*$/, {
    message: 'message must be a single safe line',
  })
  .refine(
    (message) =>
      !/(?:bearer\s+[A-Za-z0-9._~+/=-]+|(?:api[_ -]?key|secret|password)\s*[:=]|raw\s+provider|provider\s+response|system\s+prompt|hidden\s+reasoning|stack\s+trace|\bprisma\b|\bselect\s+.+\s+from\b)/i.test(
        message,
      ),
    { message: 'message contains unsafe internal or credential material' },
  );

export const PlatformErrorSchema = z
  .object({
    code: PlatformErrorCodeSchema,
    message: safePlatformMessageSchema,
    retryable: z.boolean(),
    details: safeDetailsSchema.optional(),
  })
  .strict();
export type PlatformError = z.infer<typeof PlatformErrorSchema>;

export const OperationAcceptedPayloadSchema = z
  .object({
    operation: OperationRefSchema,
    executionGraph: ExecutionGraphRefSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.operation.operationId !== payload.executionGraph.operationId) {
      context.addIssue({
        code: 'custom',
        path: ['executionGraph', 'operationId'],
        message: 'operation and executionGraph must belong to the same operation',
      });
    }
    if (payload.operation.executionGraphId !== payload.executionGraph.executionGraphId) {
      context.addIssue({
        code: 'custom',
        path: ['executionGraph', 'executionGraphId'],
        message: 'operation must reference the supplied executionGraph',
      });
    }
    if (payload.operation.status !== 'accepted') {
      context.addIssue({
        code: 'custom',
        path: ['operation', 'status'],
        message: 'operation.accepted requires accepted status',
      });
    }
  });
export type OperationAcceptedPayload = z.infer<typeof OperationAcceptedPayloadSchema>;

export const TalkOutputDeltaPayloadSchema = z.object({ text: eventTextSchema }).strict();
export type TalkOutputDeltaPayload = z.infer<typeof TalkOutputDeltaPayloadSchema>;

export const OperationCompletedPayloadSchema = z
  .object({
    operation: OperationRefSchema,
    artifact: ArtifactBaseSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.operation.status !== 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['operation', 'status'],
        message: 'operation.completed requires completed status',
      });
    }
    if (payload.operation.operationId !== payload.artifact.operationId) {
      context.addIssue({
        code: 'custom',
        path: ['artifact', 'operationId'],
        message: 'artifact must belong to the completed operation',
      });
    }
    if (payload.artifact.status !== 'ready') {
      context.addIssue({
        code: 'custom',
        path: ['artifact', 'status'],
        message: 'completed operation requires a ready artifact',
      });
    }
  });
export type OperationCompletedPayload = z.infer<typeof OperationCompletedPayloadSchema>;

export const OperationFailedPayloadSchema = z
  .object({
    operation: OperationRefSchema,
    error: PlatformErrorSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.operation.status !== 'failed') {
      context.addIssue({
        code: 'custom',
        path: ['operation', 'status'],
        message: 'operation.failed requires failed status',
      });
    }
  });
export type OperationFailedPayload = z.infer<typeof OperationFailedPayloadSchema>;

const eventEnvelopeFields = {
  schemaVersion: schemaVersionSchema,
  eventId: EventIdSchema,
  operationId: OperationIdSchema,
  sequence: z.number().int().min(1).max(MAX_EVENT_SEQUENCE),
  occurredAt: isoTimestampSchema,
} as const;

export const OperationAcceptedEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.literal('operation.accepted'),
    payload: OperationAcceptedPayloadSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.payload.operation.operationId !== event.operationId) {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'operation', 'operationId'],
        message: 'payload operation must match event operationId',
      });
    }
  });
export const TalkOutputDeltaEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.literal('talk.output.delta'),
    payload: TalkOutputDeltaPayloadSchema,
  })
  .strict();
export const OperationCompletedEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.literal('operation.completed'),
    payload: OperationCompletedPayloadSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.payload.operation.operationId !== event.operationId) {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'operation', 'operationId'],
        message: 'payload operation must match event operationId',
      });
    }
  });
export const OperationFailedEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.literal('operation.failed'),
    payload: OperationFailedPayloadSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.payload.operation.operationId !== event.operationId) {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'operation', 'operationId'],
        message: 'payload operation must match event operationId',
      });
    }
  });

const knownEventTypes = new Set([
  'operation.accepted',
  'talk.output.delta',
  'operation.completed',
  'operation.failed',
]);

export const UnknownNonCriticalEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z
      .string()
      .min(1)
      .max(128)
      .refine((type) => !knownEventTypes.has(type) && !/^critical(?:$|[.:_-])/u.test(type), {
        message: 'unknown critical events must fail closed',
      }),
    payload: z.unknown(),
  })
  .strict();

export const EventEnvelopeSchema = z.union([
  OperationAcceptedEventSchema,
  TalkOutputDeltaEventSchema,
  OperationCompletedEventSchema,
  OperationFailedEventSchema,
  UnknownNonCriticalEventSchema,
]);
export type KnownEventEnvelope =
  | z.infer<typeof OperationAcceptedEventSchema>
  | z.infer<typeof TalkOutputDeltaEventSchema>
  | z.infer<typeof OperationCompletedEventSchema>
  | z.infer<typeof OperationFailedEventSchema>;
export type UnknownNonCriticalEvent = z.infer<typeof UnknownNonCriticalEventSchema>;
export type EventEnvelope = KnownEventEnvelope | UnknownNonCriticalEvent;

export class ContractValidationError extends Error {
  readonly code = 'CONTRACT_VALIDATION_FAILED' as const;
  readonly issues: z.ZodError['issues'];

  constructor(message: string, issues: z.ZodError['issues'] = []) {
    super(message);
    this.name = 'ContractValidationError';
    this.issues = issues;
  }
}

function parseContract<T extends z.ZodType>(schema: T, input: unknown, name: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ContractValidationError(`${name} validation failed`, result.error.issues);
  }
  return result.data;
}

export function parseProjectRef(input: unknown): ProjectRef {
  return parseContract(ProjectRefSchema, input, 'ProjectRef');
}

export function parseTalkSubmitCommand(input: unknown): TalkSubmitCommand {
  return parseContract(TalkSubmitCommandSchema, input, 'TalkSubmitCommand');
}

export function parseOperationRef(input: unknown): OperationRef {
  return parseContract(OperationRefSchema, input, 'OperationRef');
}

export function parseExecutionGraphRef(input: unknown): ExecutionGraphRef {
  return parseContract(ExecutionGraphRefSchema, input, 'ExecutionGraphRef');
}

export function parseTaskRunRef(input: unknown): TaskRunRef {
  return parseContract(TaskRunRefSchema, input, 'TaskRunRef');
}

export function parseArtifactBase(input: unknown): ArtifactBase {
  return parseContract(ArtifactBaseSchema, input, 'ArtifactBase');
}

export function parsePlatformError(input: unknown): PlatformError {
  return parseContract(PlatformErrorSchema, input, 'PlatformError');
}

export function parseEventEnvelope(input: unknown): EventEnvelope {
  return parseContract(EventEnvelopeSchema, input, 'EventEnvelope');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

/** The command identity excludes commandId so a retried request can use a new envelope id. */
export function getTalkSubmitFingerprint(command: TalkSubmitCommand): string {
  return canonicalize({
    schemaVersion: command.schemaVersion,
    type: command.type,
    project: command.project,
    input: command.input,
  });
}

export interface TalkSubmitIdempotencyGuard {
  accept(command: TalkSubmitCommand): void;
  has(key: string): boolean;
}

export function createTalkSubmitIdempotencyGuard(): TalkSubmitIdempotencyGuard {
  const fingerprints = new Map<string, string>();

  return {
    accept(command) {
      const fingerprint = getTalkSubmitFingerprint(command);
      const previousFingerprint = fingerprints.get(command.idempotencyKey);
      if (previousFingerprint !== undefined && previousFingerprint !== fingerprint) {
        throw new ContractValidationError(
          'idempotencyKey was previously used for a different command payload',
        );
      }
      fingerprints.set(command.idempotencyKey, fingerprint);
    },
    has(key) {
      return fingerprints.has(key);
    },
  };
}

export function isTerminalOperationStatus(status: OperationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

const allowedOperationTransitions: Record<OperationStatus, readonly OperationStatus[]> = {
  accepted: ['accepted', 'running', 'completed', 'failed', 'cancelled'],
  running: ['running', 'completed', 'failed', 'cancelled'],
  completed: ['completed'],
  failed: ['failed'],
  cancelled: ['cancelled'],
};

export function validateOperationStateTransition(
  current: OperationStatus,
  next: OperationStatus,
): void {
  if (!allowedOperationTransitions[current].includes(next)) {
    throw new ContractValidationError(`invalid operation transition: ${current} -> ${next}`);
  }
}

export function validateOperationStatusHistory(statuses: readonly OperationStatus[]): void {
  for (let index = 1; index < statuses.length; index += 1) {
    const current = statuses[index - 1];
    const next = statuses[index];
    if (current === undefined || next === undefined) {
      continue;
    }
    validateOperationStateTransition(current, next);
  }
}

export function validateEventSequence(events: readonly EventEnvelope[]): void {
  if (events.length === 0) {
    return;
  }

  const first = events[0];
  if (!first) {
    return;
  }
  let previousSequence = 0;
  for (const event of events) {
    if (event.operationId !== first.operationId) {
      throw new ContractValidationError('event stream contains multiple operations');
    }
    if (event.sequence <= previousSequence) {
      throw new ContractValidationError('event sequence must increase strictly per operation');
    }
    previousSequence = event.sequence;
  }
}

export function validateOperationEventStream(events: readonly EventEnvelope[]): void {
  validateEventSequence(events);

  let accepted = false;
  let terminal = false;
  for (const event of events) {
    if (event.type === 'operation.accepted') {
      const acceptedEvent = parseContract(
        OperationAcceptedEventSchema,
        event,
        'operation.accepted event',
      );
      if (accepted || terminal) {
        throw new ContractValidationError('operation.accepted cannot be repeated');
      }
      if (acceptedEvent.payload.operation.operationId !== acceptedEvent.operationId) {
        throw new ContractValidationError('accepted operation does not match event operationId');
      }
      accepted = true;
    } else if (event.type === 'talk.output.delta') {
      if (!accepted || terminal) {
        throw new ContractValidationError('output delta must occur during an active operation');
      }
    } else if (event.type === 'operation.completed') {
      const completedEvent = parseContract(
        OperationCompletedEventSchema,
        event,
        'operation.completed event',
      );
      if (!accepted || terminal) {
        throw new ContractValidationError('operation.completed is not a valid state transition');
      }
      if (completedEvent.payload.operation.operationId !== completedEvent.operationId) {
        throw new ContractValidationError('completed operation does not match event operationId');
      }
      terminal = true;
    } else if (event.type === 'operation.failed') {
      const failedEvent = parseContract(
        OperationFailedEventSchema,
        event,
        'operation.failed event',
      );
      if (!accepted || terminal) {
        throw new ContractValidationError('operation.failed is not a valid state transition');
      }
      if (failedEvent.payload.operation.operationId !== failedEvent.operationId) {
        throw new ContractValidationError('failed operation does not match event operationId');
      }
      terminal = true;
    }
    // Unknown non-critical events are retained in the stream and ignored here.
  }
}
