import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { apiUsageEvents } from '@/lib/db/schema';
import type { AuthenticatedOpenProviderApiKey } from './api-keys';
import { OpenProviderError } from '@/src/utils/errors';

export type ApiUsageBreakdown = {
  id: string;
  label: string;
  requests: number;
  share: number;
  successRate: number;
  averageLatencyMs: number | null;
};

export type ApiUsageRecentEvent = {
  id: string;
  keyPrefix: string;
  endpoint: string;
  workflow: string;
  model: string | null;
  provider: string | null;
  statusCode: number;
  ok: boolean;
  latencyMs: number | null;
  createdAt: string;
};

export type ApiRequestTraceEvent = {
  id: string;
  keyPrefix: string;
  endpoint: string;
  method: string;
  workflow: string;
  requestedModel: string | null;
  routedModel: string | null;
  provider: string | null;
  statusCode: number;
  ok: boolean;
  latencyMs: number | null;
  errorType: string | null;
  tokenUsage: Record<string, unknown> | null;
  createdAt: string;
};

export type ApiUsageSummary = {
  storageReady: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageLatencyMs: number | null;
  byModel: ApiUsageBreakdown[];
  byProvider: ApiUsageBreakdown[];
  byWorkflow: ApiUsageBreakdown[];
  recent: ApiUsageRecentEvent[];
};

export type ApiRequestTraceData = {
  storageReady: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageLatencyMs: number | null;
  slowestLatencyMs: number | null;
  events: ApiRequestTraceEvent[];
};

type ApiUsageInsert = {
  userId: string;
  apiKeyId: string | null;
  keyPrefix: string;
  endpoint: string;
  method: string;
  workflow: string;
  requestedModel?: string | null;
  routedModel?: string | null;
  provider?: string | null;
  statusCode: number;
  ok: boolean;
  latencyMs?: number | null;
  errorType?: string | null;
  tokenUsage?: Record<string, unknown> | null;
};

type ApiUsageRouteInput = {
  auth: AuthenticatedOpenProviderApiKey;
  endpoint: string;
  method: string;
  workflow: string;
  startedAt: number;
  body?: unknown;
  requestedModel?: string | null;
  routedModel?: string | null;
  provider?: string | null;
  statusCode: number;
  ok: boolean;
  error?: unknown;
  tokenUsage?: unknown;
};

type SessionTraceInput = {
  userId: string;
  endpoint: string;
  method: string;
  workflow: string;
  startedAt: number;
  body?: unknown;
  requestedModel?: string | null;
  routedModel?: string | null;
  provider?: string | null;
  statusCode: number;
  ok: boolean;
  error?: unknown;
  tokenUsage?: unknown;
  source?: string;
};

type UsageEventRow = typeof apiUsageEvents.$inferSelect;

const EMPTY_USAGE_SUMMARY: ApiUsageSummary = {
  storageReady: true,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  successRate: 0,
  averageLatencyMs: null,
  byModel: [],
  byProvider: [],
  byWorkflow: [],
  recent: [],
};

const EMPTY_REQUEST_TRACE_DATA: ApiRequestTraceData = {
  storageReady: true,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  successRate: 0,
  averageLatencyMs: null,
  slowestLatencyMs: null,
  events: [],
};

export function getApiUsageEmptySummary(storageReady = true): ApiUsageSummary {
  return {
    ...EMPTY_USAGE_SUMMARY,
    storageReady,
  };
}

export function getApiRequestTraceEmptyData(storageReady = true): ApiRequestTraceData {
  return {
    ...EMPTY_REQUEST_TRACE_DATA,
    storageReady,
  };
}

export function requestedModelFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const model = (body as Record<string, unknown>).model;
  return typeof model === 'string' && model.trim() ? model.trim() : null;
}

export function statusCodeFromOpenProviderError(error: unknown): number {
  if (error instanceof OpenProviderError) return error.status ?? 500;
  if (error instanceof SyntaxError) return 400;
  return 500;
}

export function errorTypeFromOpenProviderError(error: unknown): string {
  if (error instanceof OpenProviderError) return error.name;
  if (error instanceof SyntaxError) return 'SyntaxError';
  if (error instanceof Error && error.name) return error.name;
  return 'OpenProviderRouteError';
}

export function routeInfoFromPayload(payload: unknown): { model: string | null; provider: string | null } {
  if (!payload || typeof payload !== 'object') {
    return { model: null, provider: null };
  }

  const record = payload as Record<string, unknown>;
  const openprovider = record.openprovider;
  if (openprovider && typeof openprovider === 'object') {
    const route = openprovider as Record<string, unknown>;
    return {
      model: typeof route.model === 'string' ? route.model : typeof record.model === 'string' ? record.model : null,
      provider: typeof route.provider === 'string' ? route.provider : null,
    };
  }

  return {
    model: typeof record.model === 'string' ? record.model : null,
    provider: typeof record.provider === 'string' ? record.provider : null,
  };
}

function normalizeUsagePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isMissingUsageTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { cause?: unknown; code?: unknown; message?: unknown };
  const cause = record.cause && typeof record.cause === 'object'
    ? record.cause as { code?: unknown; message?: unknown }
    : null;
  const message = typeof record.message === 'string' ? record.message : '';
  const causeMessage = typeof cause?.message === 'string' ? cause.message : '';

  return record.code === '42P01' ||
    cause?.code === '42P01' ||
    message.includes('relation "api_usage_event" does not exist') ||
    causeMessage.includes('relation "api_usage_event" does not exist');
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toPercentage(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function buildBreakdown(
  rows: UsageEventRow[],
  getKey: (row: UsageEventRow) => string | null,
  getLabel: (key: string) => string
): ApiUsageBreakdown[] {
  const groups = new Map<string, { requests: number; successes: number; latencies: number[] }>();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;

    const current = groups.get(key) ?? { requests: 0, successes: 0, latencies: [] };
    current.requests += 1;
    if (row.ok) current.successes += 1;
    if (typeof row.latencyMs === 'number') current.latencies.push(row.latencyMs);
    groups.set(key, current);
  }

  const total = Array.from(groups.values()).reduce((sum, group) => sum + group.requests, 0);
  return Array.from(groups.entries())
    .map(([key, group]) => ({
      id: key,
      label: getLabel(key),
      requests: group.requests,
      share: toPercentage(group.requests, total),
      successRate: toPercentage(group.successes, group.requests),
      averageLatencyMs: average(group.latencies),
    }))
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 8);
}

function workflowLabel(workflow: string): string {
  if (workflow === 'chat') return 'Chat';
  if (workflow === 'image') return 'Image';
  if (workflow === 'image_analysis') return 'Image analysis';
  if (workflow === 'speech') return 'Speech';
  if (workflow === 'models') return 'Model catalog';
  if (workflow === 'providers') return 'Provider status';
  return workflow;
}

export async function recordApiUsageEvent(input: ApiUsageInsert): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(apiUsageEvents).values({
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      keyPrefix: input.keyPrefix,
      endpoint: input.endpoint,
      method: input.method,
      workflow: input.workflow,
      requestedModel: input.requestedModel ?? null,
      routedModel: input.routedModel ?? null,
      provider: input.provider ?? null,
      statusCode: input.statusCode,
      ok: input.ok,
      latencyMs: input.latencyMs ?? null,
      errorType: input.errorType ?? null,
      tokenUsage: input.tokenUsage ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    if (isMissingUsageTableError(error)) return;
    console.warn('[OpenProvider] Failed to record API usage event.', error);
  }
}

export async function recordOpenProviderApiUsage(input: ApiUsageRouteInput): Promise<void> {
  await recordApiUsageEvent({
    userId: input.auth.userId,
    apiKeyId: input.auth.keyId,
    keyPrefix: input.auth.keyPrefix,
    endpoint: input.endpoint,
    method: input.method,
    workflow: input.workflow,
    requestedModel: input.requestedModel ?? requestedModelFromBody(input.body),
    routedModel: input.routedModel ?? null,
    provider: input.provider ?? null,
    statusCode: input.statusCode,
    ok: input.ok,
    latencyMs: Math.max(0, Date.now() - input.startedAt),
    errorType: input.error ? errorTypeFromOpenProviderError(input.error) : null,
    tokenUsage: normalizeUsagePayload(input.tokenUsage),
  });
}

export async function recordSessionRequestTrace(input: SessionTraceInput): Promise<void> {
  await recordApiUsageEvent({
    userId: input.userId,
    apiKeyId: null,
    keyPrefix: input.source ?? 'web-session',
    endpoint: input.endpoint,
    method: input.method,
    workflow: input.workflow,
    requestedModel: input.requestedModel ?? requestedModelFromBody(input.body),
    routedModel: input.routedModel ?? null,
    provider: input.provider ?? null,
    statusCode: input.statusCode,
    ok: input.ok,
    latencyMs: Math.max(0, Date.now() - input.startedAt),
    errorType: input.error ? errorTypeFromOpenProviderError(input.error) : null,
    tokenUsage: normalizeUsagePayload(input.tokenUsage),
  });
}

function toTraceEvent(row: UsageEventRow): ApiRequestTraceEvent {
  return {
    id: row.id,
    keyPrefix: row.keyPrefix,
    endpoint: row.endpoint,
    method: row.method,
    workflow: row.workflow,
    requestedModel: row.requestedModel,
    routedModel: row.routedModel,
    provider: row.provider,
    statusCode: row.statusCode,
    ok: row.ok,
    latencyMs: row.latencyMs,
    errorType: row.errorType,
    tokenUsage: normalizeUsagePayload(row.tokenUsage),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getApiUsageSummaryForUser(
  userId: string,
  options: { limit?: number; sinceDays?: number } = {}
): Promise<ApiUsageSummary> {
  const db = getDb();
  if (!db) return getApiUsageEmptySummary(false);

  const limit = options.limit ?? 1000;
  const sinceDays = options.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  let rows: UsageEventRow[];

  try {
    rows = await db
      .select()
      .from(apiUsageEvents)
      .where(and(eq(apiUsageEvents.userId, userId), gte(apiUsageEvents.createdAt, since)))
      .orderBy(desc(apiUsageEvents.createdAt))
      .limit(limit);
  } catch (error) {
    if (isMissingUsageTableError(error)) {
      return getApiUsageEmptySummary(false);
    }

    console.warn('[OpenProvider] Failed to read API usage summary.', error);
    return getApiUsageEmptySummary();
  }

  if (!rows.length) return getApiUsageEmptySummary();

  const successfulRequests = rows.filter(row => row.ok).length;
  const latencies = rows
    .map(row => row.latencyMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    storageReady: true,
    totalRequests: rows.length,
    successfulRequests,
    failedRequests: rows.length - successfulRequests,
    successRate: toPercentage(successfulRequests, rows.length),
    averageLatencyMs: average(latencies),
    byModel: buildBreakdown(
      rows,
      row => row.routedModel ?? row.requestedModel,
      key => key
    ),
    byProvider: buildBreakdown(
      rows,
      row => row.provider,
      key => key
    ),
    byWorkflow: buildBreakdown(
      rows,
      row => row.workflow,
      workflowLabel
    ),
    recent: rows.slice(0, 8).map(row => ({
      id: row.id,
      keyPrefix: row.keyPrefix,
      endpoint: row.endpoint,
      workflow: row.workflow,
      model: row.routedModel ?? row.requestedModel,
      provider: row.provider,
      statusCode: row.statusCode,
      ok: row.ok,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function getApiRequestTraceForUser(
  userId: string,
  options: { limit?: number; sinceDays?: number } = {}
): Promise<ApiRequestTraceData> {
  const db = getDb();
  if (!db) return getApiRequestTraceEmptyData(false);

  const limit = options.limit ?? 100;
  const sinceDays = options.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  let rows: UsageEventRow[];

  try {
    rows = await db
      .select()
      .from(apiUsageEvents)
      .where(and(eq(apiUsageEvents.userId, userId), gte(apiUsageEvents.createdAt, since)))
      .orderBy(desc(apiUsageEvents.createdAt))
      .limit(limit);
  } catch (error) {
    if (isMissingUsageTableError(error)) {
      return getApiRequestTraceEmptyData(false);
    }

    console.warn('[OpenProvider] Failed to read request traces.', error);
    return getApiRequestTraceEmptyData();
  }

  if (!rows.length) return getApiRequestTraceEmptyData();

  const successfulRequests = rows.filter(row => row.ok).length;
  const latencies = rows
    .map(row => row.latencyMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    storageReady: true,
    totalRequests: rows.length,
    successfulRequests,
    failedRequests: rows.length - successfulRequests,
    successRate: toPercentage(successfulRequests, rows.length),
    averageLatencyMs: average(latencies),
    slowestLatencyMs: latencies.length ? Math.max(...latencies) : null,
    events: rows.map(toTraceEvent),
  };
}
