import { SCHEMA_VERSION } from '@modern-agent/shared-contracts';
import type { ModelExecutionPlanRefV1 } from '../index.js';
import { DEEPSEEK_OFFICIAL_CHANNEL, findModelRelease, TALK_MODEL_SLOT } from './model-catalog.js';
import type { ModelRelease, ProviderChannel } from './model-catalog.js';

export interface InternalModelExecutionPlanSnapshot {
  readonly planId: string;
  readonly modelVersionId: string;
  readonly primaryOffer: ModelRelease['offer'];
  readonly providerChannel: ProviderChannel;
  readonly fallbackOffers: readonly [];
  readonly routingVersion: 'talk.assignment.v1';
  readonly policyVersion: string;
}

interface PlanEntry {
  readonly snapshot: InternalModelExecutionPlanSnapshot;
  readonly createdAt: number;
  claimed: boolean;
}

export type PlanRegistryFailure = 'invalid-assignment' | 'capacity' | 'missing';

export class PlanRegistryError extends Error {
  constructor(readonly failure: PlanRegistryFailure) {
    super('Model execution plan registry failure.');
    this.name = 'PlanRegistryError';
  }
}

export class InMemoryModelExecutionPlanRegistry {
  readonly #entries = new Map<string, PlanEntry>();
  readonly #maxEntries: number;
  readonly #abandonedPlanTtlMs: number;
  readonly #now: () => number;
  #nextPlanId = 0;
  #assignedReleaseId: string;

  constructor(
    assignedReleaseId: string,
    maxEntries = 128,
    abandonedPlanTtlMs = 60_000,
    now: () => number = Date.now,
  ) {
    this.#assignedReleaseId = assignedReleaseId;
    this.#maxEntries = Math.max(1, maxEntries);
    this.#abandonedPlanTtlMs = Math.max(1, abandonedPlanTtlMs);
    this.#now = now;
    this.#validateAssignment(assignedReleaseId);
  }

  resolve(policyVersion: string): ModelExecutionPlanRefV1 {
    this.#sweepAbandonedPlans();
    if (this.#entries.size >= this.#maxEntries) throw new PlanRegistryError('capacity');
    const release = this.#validateAssignment(this.#assignedReleaseId);
    this.#nextPlanId += 1;
    const planId = `mdlplan_${this.#nextPlanId}`;
    const snapshot: InternalModelExecutionPlanSnapshot = Object.freeze({
      planId,
      modelVersionId: release.releaseId,
      primaryOffer: release.offer,
      providerChannel: DEEPSEEK_OFFICIAL_CHANNEL,
      fallbackOffers: Object.freeze([]) as readonly [],
      routingVersion: 'talk.assignment.v1',
      policyVersion,
    });
    this.#entries.set(planId, { snapshot, createdAt: this.#now(), claimed: false });
    return Object.freeze({ schemaVersion: SCHEMA_VERSION, planId });
  }

  claim(planId: string): InternalModelExecutionPlanSnapshot {
    const entry = this.#entries.get(planId);
    if (entry === undefined || entry.claimed) throw new PlanRegistryError('missing');
    entry.claimed = true;
    return entry.snapshot;
  }

  release(planId: string): void {
    this.#entries.delete(planId);
  }

  setTalkAssignment(releaseId: string): void {
    this.#validateAssignment(releaseId);
    this.#assignedReleaseId = releaseId;
  }

  get size(): number {
    return this.#entries.size;
  }

  #validateAssignment(releaseId: string): ModelRelease {
    const release = findModelRelease(releaseId);
    if (
      release === undefined ||
      release.capability !== 'talk' ||
      release.lifecycle !== 'AVAILABLE' ||
      !release.assignmentEligible
    ) {
      throw new PlanRegistryError('invalid-assignment');
    }
    return release;
  }

  #sweepAbandonedPlans(): void {
    const cutoff = this.#now() - this.#abandonedPlanTtlMs;
    for (const [planId, entry] of this.#entries) {
      if (!entry.claimed && entry.createdAt <= cutoff) this.#entries.delete(planId);
    }
  }
}

/** Keeps the selection key private and prevents it from becoming an execution plan id. */
export function isTalkAssignmentKey(value: string): boolean {
  return value === TALK_MODEL_SLOT;
}
