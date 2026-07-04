import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { modelStatusRuns, modelStatuses } from '@/lib/db/schema';
import { hydrateModelStatuses, type RuntimeModelStatus } from '@/src/core/modelStatus';
import type { ProviderModel } from '@/src/core/types';

export type PersistedModelStatus = {
  modelId: string;
  provider: string;
  status: RuntimeModelStatus;
  checkedAt?: Date | null;
  latencyMs?: number | null;
  httpStatus?: number | null;
  errorMessage?: string | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
};

export type ModelStatusResult = {
  ok: boolean;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
  checkedAt?: Date;
  softFailure?: boolean;
  softFailureThreshold?: number;
};

export type ModelStatusRunSummary = {
  checkableCount?: number;
  checkedCount: number;
  dueCount?: number;
  workingCount: number;
  failingCount: number;
  unknownCount?: number;
  retryCount?: number;
  softFailureCount?: number;
  remainingDueCount?: number;
  selectedCount?: number;
  skippedCount: number;
  stoppedByBudget?: boolean;
  errorMessage?: string;
};

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function runtimeStatus(value: string): RuntimeModelStatus {
  return value === 'working' || value === 'failing' ? value : 'unknown';
}

function rowToStatus(row: typeof modelStatuses.$inferSelect): PersistedModelStatus {
  return {
    modelId: row.modelId,
    provider: row.provider,
    status: runtimeStatus(row.status),
    checkedAt: row.checkedAt,
    latencyMs: row.latencyMs,
    httpStatus: row.httpStatus,
    errorMessage: row.errorMessage,
    successCount: row.successCount,
    failureCount: row.failureCount,
    consecutiveFailures: row.consecutiveFailures,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
  };
}

function initialStatus(result: ModelStatusResult, softFailureThreshold: number): RuntimeModelStatus {
  if (result.ok) {
    return 'working';
  }

  return result.softFailure && 1 < softFailureThreshold ? 'unknown' : 'failing';
}

export async function listPersistedModelStatuses(modelIds?: string[]): Promise<Map<string, PersistedModelStatus>> {
  const db = getDb();
  const wantedModelIds = [...new Set((modelIds ?? []).map(modelId => modelId.trim()).filter(Boolean))];
  const statuses = new Map<string, PersistedModelStatus>();

  if (!db) {
    return statuses;
  }

  if (modelIds && wantedModelIds.length === 0) {
    return statuses;
  }

  try {
    const rows = wantedModelIds.length > 0
      ? await db
        .select()
        .from(modelStatuses)
        .where(inArray(modelStatuses.modelId, wantedModelIds))
      : await db.select().from(modelStatuses);

    for (const row of rows) {
      const normalized = normalizeModelId(row.modelId);
      statuses.set(normalized, rowToStatus(row));
    }
  } catch {
    return statuses;
  }

  return statuses;
}

export async function hydratePersistedModelStatuses(modelIds?: string[]): Promise<Map<string, PersistedModelStatus>> {
  const statuses = await listPersistedModelStatuses(modelIds);

  hydrateModelStatuses([...statuses.values()].map(status => ({
    modelId: status.modelId,
    status: status.status,
    checkedAt: status.checkedAt,
    latencyMs: status.latencyMs,
    error: status.errorMessage,
    successes: status.successCount,
    failures: status.failureCount,
    consecutiveFailures: status.consecutiveFailures,
    lastSuccessAt: status.lastSuccessAt,
    lastFailureAt: status.lastFailureAt,
  })));

  return statuses;
}

export async function recordModelStatus(
  model: Pick<ProviderModel, 'id' | 'provider'>,
  result: ModelStatusResult
): Promise<RuntimeModelStatus | undefined> {
  const db = getDb();
  if (!db) {
    return undefined;
  }

  const now = result.checkedAt ?? new Date();
  const softFailureThreshold = Math.max(1, result.softFailureThreshold ?? 3);

  try {
    const status = initialStatus(result, softFailureThreshold);
    const nextStatus = result.ok
      ? 'working'
      : result.softFailure
        ? sql`case
            when ${modelStatuses.consecutiveFailures} + 1 < ${softFailureThreshold}
              then ${modelStatuses.status}
            else 'failing'
          end`
        : 'failing';
    const values = {
      provider: model.provider,
      status,
      checkedAt: now,
      latencyMs: result.latencyMs ?? null,
      httpStatus: result.httpStatus ?? null,
      errorMessage: result.ok ? null : (result.error ?? 'Model status check failed.'),
      successCount: result.ok ? 1 : 0,
      failureCount: result.ok ? 0 : 1,
      consecutiveFailures: result.ok ? 0 : 1,
      cooldownUntil: null,
      lastSuccessAt: result.ok ? now : null,
      lastFailureAt: result.ok ? null : now,
      updatedAt: now,
    };

    const [updated] = await db
      .insert(modelStatuses)
      .values({
        modelId: model.id,
        createdAt: now,
        ...values,
      })
      .onConflictDoUpdate({
        target: modelStatuses.modelId,
        set: {
          provider: model.provider,
          status: nextStatus,
          checkedAt: now,
          latencyMs: values.latencyMs,
          httpStatus: values.httpStatus,
          errorMessage: values.errorMessage,
          successCount: result.ok ? sql`${modelStatuses.successCount} + 1` : sql`${modelStatuses.successCount}`,
          failureCount: result.ok ? sql`${modelStatuses.failureCount}` : sql`${modelStatuses.failureCount} + 1`,
          consecutiveFailures: result.ok ? 0 : sql`${modelStatuses.consecutiveFailures} + 1`,
          cooldownUntil: null,
          lastSuccessAt: result.ok ? now : sql`${modelStatuses.lastSuccessAt}`,
          lastFailureAt: result.ok ? sql`${modelStatuses.lastFailureAt}` : now,
          updatedAt: now,
        },
      })
      .returning({ status: modelStatuses.status });

    return runtimeStatus(updated?.status ?? status);
  } catch (error) {
    if (process.env.MODEL_STATUS_DEBUG === 'true') {
      console.warn('[model-status] Failed to persist model status.', error);
    }
    // Status tracking must never break chat or catalog routes.
    return undefined;
  }
}

export async function recordModelStatusUnknown(
  model: Pick<ProviderModel, 'id' | 'provider'>,
  result: Omit<ModelStatusResult, 'ok'>
): Promise<RuntimeModelStatus | undefined> {
  const db = getDb();
  if (!db) {
    return undefined;
  }

  const now = result.checkedAt ?? new Date();

  try {
    const values = {
      provider: model.provider,
      status: 'unknown' as const,
      checkedAt: now,
      latencyMs: result.latencyMs ?? null,
      httpStatus: result.httpStatus ?? null,
      errorMessage: result.error ?? 'Model status is unknown.',
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      updatedAt: now,
    };

    await db
      .insert(modelStatuses)
      .values({
        modelId: model.id,
        createdAt: now,
        ...values,
      })
      .onConflictDoUpdate({
        target: modelStatuses.modelId,
        set: {
          provider: model.provider,
          status: 'unknown',
          checkedAt: now,
          latencyMs: values.latencyMs,
          httpStatus: values.httpStatus,
          errorMessage: values.errorMessage,
          consecutiveFailures: 0,
          cooldownUntil: null,
          updatedAt: now,
        },
      });

    return 'unknown';
  } catch {
    return undefined;
  }
}

export async function startModelStatusRun(trigger: string, provider?: string | null): Promise<string | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const id = crypto.randomUUID();
    await db.insert(modelStatusRuns).values({
      id,
      trigger,
      provider: provider ?? null,
      status: 'running',
      startedAt: new Date(),
    });
    return id;
  } catch {
    return null;
  }
}

export async function finishModelStatusRun(
  runId: string | null,
  status: 'completed' | 'failed',
  summary: ModelStatusRunSummary
): Promise<void> {
  if (!runId) {
    return;
  }

  const db = getDb();
  if (!db) {
    return;
  }

  try {
    await db
      .update(modelStatusRuns)
      .set({
        status,
        finishedAt: new Date(),
        checkedCount: summary.checkedCount,
        workingCount: summary.workingCount,
        failingCount: summary.failingCount,
        skippedCount: summary.skippedCount,
        errorMessage: summary.errorMessage,
      })
      .where(eq(modelStatusRuns.id, runId));
  } catch {
    // Run logs are best-effort.
  }
}
