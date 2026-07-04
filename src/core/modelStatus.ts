export type RuntimeModelStatus = 'unknown' | 'working' | 'failing';

export type ModelStatusSnapshot = {
  status: RuntimeModelStatus;
  checkedAt?: string;
  latencyMs?: number;
  error?: string;
  successes: number;
  failures: number;
  consecutiveFailures?: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

type StoredModelStatus = {
  status: RuntimeModelStatus;
  checkedAt: number;
  latencyMs?: number;
  error?: string;
  successes: number;
  failures: number;
  consecutiveFailures?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
};

const statusStore = new Map<string, StoredModelStatus>();
const MAX_STATUS_ENTRIES = 5000;
const STATUS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function emptyStatus(): ModelStatusSnapshot {
  return {
    status: 'unknown',
    successes: 0,
    failures: 0,
  };
}

function upsertStatus(key: string, status: StoredModelStatus): void {
  // Refresh insertion order so the Map behaves as an LRU queue.
  statusStore.delete(key);
  statusStore.set(key, status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Model request failed.');
}

function pruneStatusStore(now: number): void {
  for (const [key, status] of statusStore.entries()) {
    if (now - status.checkedAt > STATUS_RETENTION_MS) {
      statusStore.delete(key);
    }
  }

  while (statusStore.size > MAX_STATUS_ENTRIES) {
    const oldestKey = statusStore.keys().next().value;
    if (!oldestKey) {
      break;
    }

    statusStore.delete(oldestKey);
  }
}

export function getModelStatus(modelId: string): ModelStatusSnapshot {
  const now = Date.now();
  const key = normalizeModelId(modelId);
  const stored = statusStore.get(key);

  if (!stored) {
    return emptyStatus();
  }

  if (now - stored.checkedAt > STATUS_RETENTION_MS) {
    statusStore.delete(key);
    return emptyStatus();
  }

  upsertStatus(key, stored);

  return {
    status: stored.status,
    checkedAt: new Date(stored.checkedAt).toISOString(),
    latencyMs: stored.latencyMs,
    error: stored.error,
    successes: stored.successes,
    failures: stored.failures,
    consecutiveFailures: stored.consecutiveFailures,
    lastSuccessAt: stored.lastSuccessAt ? new Date(stored.lastSuccessAt).toISOString() : undefined,
    lastFailureAt: stored.lastFailureAt ? new Date(stored.lastFailureAt).toISOString() : undefined,
  };
}

export function getModelStatusState(modelId: string): RuntimeModelStatus {
  return getModelStatus(modelId).status;
}

export function markModelWorking(modelId: string, latencyMs?: number): void {
  const now = Date.now();
  const key = normalizeModelId(modelId);
  const previous = statusStore.get(key);

  upsertStatus(key, {
    status: 'working',
    checkedAt: now,
    latencyMs,
    successes: (previous?.successes ?? 0) + 1,
    failures: previous?.failures ?? 0,
    consecutiveFailures: 0,
    lastSuccessAt: now,
  });

  pruneStatusStore(now);
}

export function markModelFailing(modelId: string, error: unknown, latencyMs?: number): void {
  const now = Date.now();
  const key = normalizeModelId(modelId);
  const previous = statusStore.get(key);
  const message = errorMessage(error);
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;

  upsertStatus(key, {
    status: 'failing',
    checkedAt: now,
    latencyMs,
    error: message,
    successes: previous?.successes ?? 0,
    failures: (previous?.failures ?? 0) + 1,
    consecutiveFailures,
    lastFailureAt: now,
  });

  pruneStatusStore(now);
}

export function markModelUnknown(modelId: string, error?: unknown, latencyMs?: number): void {
  const now = Date.now();
  const key = normalizeModelId(modelId);
  const previous = statusStore.get(key);
  const message = error instanceof Error ? error.message : error ? String(error) : undefined;

  upsertStatus(key, {
    status: 'unknown',
    checkedAt: now,
    latencyMs,
    error: message,
    successes: previous?.successes ?? 0,
    failures: previous?.failures ?? 0,
    consecutiveFailures: 0,
    lastSuccessAt: previous?.lastSuccessAt,
    lastFailureAt: previous?.lastFailureAt,
  });

  pruneStatusStore(now);
}

export function hydrateModelStatuses(statuses: Array<{
  modelId: string;
  status: RuntimeModelStatus;
  checkedAt?: string | Date | null;
  latencyMs?: number | null;
  error?: string | null;
  successes?: number | null;
  failures?: number | null;
  consecutiveFailures?: number | null;
  lastSuccessAt?: string | Date | null;
  lastFailureAt?: string | Date | null;
}>): void {
  const now = Date.now();

  for (const status of statuses) {
    const checkedAt = status.checkedAt ? new Date(status.checkedAt).getTime() : now;
    const lastSuccessAt = status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : undefined;
    const lastFailureAt = status.lastFailureAt ? new Date(status.lastFailureAt).getTime() : undefined;

    upsertStatus(normalizeModelId(status.modelId), {
      status: status.status,
      checkedAt: Number.isFinite(checkedAt) ? checkedAt : now,
      latencyMs: status.latencyMs ?? undefined,
      error: status.error ?? undefined,
      successes: status.successes ?? 0,
      failures: status.failures ?? 0,
      consecutiveFailures: status.consecutiveFailures ?? 0,
      lastSuccessAt: lastSuccessAt && Number.isFinite(lastSuccessAt) ? lastSuccessAt : undefined,
      lastFailureAt: lastFailureAt && Number.isFinite(lastFailureAt) ? lastFailureAt : undefined,
    });
  }

  pruneStatusStore(now);
}

export function knownWorkingModelIds(): Set<string> {
  return new Set(
    [...statusStore.entries()]
      .filter(([, value]) => value.status === 'working')
      .map(([key]) => key)
  );
}
