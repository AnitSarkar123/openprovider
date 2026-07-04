import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { discoverConfiguredProviderModels } from '@/src/core/providerDiscovery';
import { applyEnvProviderKeysToConfig, loadOpenProviderConfig } from '@/src/config/env';
import { PROVIDER_IDS } from '@/src/core/providerRegistry';
import { applyUserProviderKeysToConfig, findSingleProviderKeyUserId } from '@/lib/openprovider/provider-keys';
import { runModelStatusChecks } from '@/lib/openprovider/model-status-checker';
import { hasDatabase } from '@/lib/db/client';
import { authOptions } from '@/lib/auth';
import type { ProviderId } from '@/src/core/types';
import type { RuntimeModelStatus } from '@/src/core/modelStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_MODEL_STATUS_LIMIT = 25;
const DEFAULT_MAX_RUNTIME_MS = 60000;
const DEFAULT_MANUAL_CONCURRENCY = 2;
const DEFAULT_MANUAL_PROVIDER_DELAY_MS = 3000;
const DEFAULT_MANUAL_SLOW_RETRY_CONCURRENCY = 1;
const DEFAULT_MANUAL_SLOW_RETRY_TIMEOUT_MS = 12000;
const DEFAULT_MANUAL_SOFT_FAILURE_THRESHOLD = 3;
const DEFAULT_MANUAL_STALE_HOURS = 72;
const DEFAULT_MANUAL_TIMEOUT_MS = 7000;

const PROVIDER_ID_SET = new Set<ProviderId>(PROVIDER_IDS);
const STATUS_SET = new Set<RuntimeModelStatus>(['unknown', 'working', 'failing']);

function numberParam(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberParam(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numberFromEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const value = process.env[name]?.trim() ?? null;
    const parsed = numberParam(value, 0);
    if (parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function nonNegativeNumberFromEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value === undefined) {
      continue;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback;
}

function boolParam(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

type CronAuthorization = {
  ok: boolean;
  source?: 'cron-secret' | 'signed-in-user' | 'local-dev';
  userId?: string;
};

async function authorizeCronRequest(request: NextRequest): Promise<CronAuthorization> {
  const secret = process.env.CRON_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { ok: true, source: 'cron-secret' };
  }

  if (isProduction) {
    return { ok: false };
  }

  if (!secret) {
    return { ok: true, source: 'local-dev' };
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return { ok: true, source: 'signed-in-user', userId: session.user.id };
  }

  return { ok: false };
}

function providerParam(value: string | null): ProviderId | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as ProviderId;
  return PROVIDER_ID_SET.has(normalized) ? normalized : undefined;
}

function statusParam(value: string | null): RuntimeModelStatus | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as RuntimeModelStatus;
  return STATUS_SET.has(normalized) ? normalized : undefined;
}

function csvParam(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeCronRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid cron authorization. Call this endpoint with the CRON_SECRET bearer token.',
        },
      },
      { status: 401 }
    );
  }

  if (!hasDatabase()) {
    return NextResponse.json(
      { error: { message: 'DATABASE_URL is required before model status checks can be persisted.' } },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const provider = providerParam(url.searchParams.get('provider'));
  const status = statusParam(url.searchParams.get('status'));
  const envProviderKeys = boolParam(url.searchParams.get('envProviderKeys'));
  const finalizeUnknown = boolParam(url.searchParams.get('finalizeUnknown'));
  const excludeModelIds = [
    ...csvParam(url.searchParams.get('exclude')),
    ...csvParam(url.searchParams.get('excludeModelIds')),
  ];
  const requestedUserId = envProviderKeys ? undefined : authorization.source === 'cron-secret' ? url.searchParams.get('userId')?.trim() : undefined;
  const envUserId = envProviderKeys ? undefined : process.env.MODEL_STATUS_USER_ID?.trim();
  const manualUserId = envProviderKeys ? undefined : authorization.source === 'signed-in-user' ? authorization.userId : undefined;
  const autoUserId = envProviderKeys || envUserId || requestedUserId || manualUserId ? null : await findSingleProviderKeyUserId();
  const statusUserId = envUserId || requestedUserId || manualUserId || autoUserId;
  const credentialSource = envProviderKeys
    ? 'environment'
    : envUserId
      ? 'configured-user'
      : requestedUserId
        ? 'request-user'
        : manualUserId
          ? 'signed-in-user'
          : autoUserId
            ? 'single-saved-user'
            : 'public-provider-defaults';
  const trigger = envProviderKeys
    ? 'manual-env'
    : authorization.source === 'signed-in-user'
      ? 'manual-browser'
      : autoUserId
        ? 'manual-auto-user'
        : 'manual';
  const baseConfig = loadOpenProviderConfig();
  const envConfig = envProviderKeys ? applyEnvProviderKeysToConfig(baseConfig) : baseConfig;
  const config = statusUserId ? await applyUserProviderKeysToConfig(envConfig, statusUserId) : envConfig;
  const providerResults = await discoverConfiguredProviderModels(config);
  const discoveredModels = providerResults
    .flatMap(result => result.models)
    .filter(model => model.enabled && model.free)
    .filter(model => !provider || model.provider === provider)
    .filter(model => config.providers[model.provider]?.enabled);
  const limit = nonNegativeNumberParam(
    url.searchParams.get('limit'),
    nonNegativeNumberFromEnv(['MODEL_STATUS_MAX_MODELS'], DEFAULT_MODEL_STATUS_LIMIT)
  );
  const maxRuntimeMs = numberParam(
    url.searchParams.get('budgetMs'),
    numberFromEnv(['MODEL_STATUS_MAX_RUNTIME_MS'], DEFAULT_MAX_RUNTIME_MS)
  );
  const concurrency = numberParam(
    url.searchParams.get('concurrency'),
    numberFromEnv(['MODEL_STATUS_PROBE_CONCURRENCY'], DEFAULT_MANUAL_CONCURRENCY)
  );
  const providerDelayMs = numberParam(
    url.searchParams.get('providerDelayMs'),
    numberFromEnv(['MODEL_STATUS_PROVIDER_DELAY_MS'], DEFAULT_MANUAL_PROVIDER_DELAY_MS)
  );
  const slowRetryConcurrency = numberParam(
    url.searchParams.get('slowRetryConcurrency'),
    numberFromEnv(['MODEL_STATUS_SLOW_RETRY_CONCURRENCY'], DEFAULT_MANUAL_SLOW_RETRY_CONCURRENCY)
  );
  const slowRetryTimeoutMs = numberParam(
    url.searchParams.get('slowRetryTimeoutMs'),
    numberFromEnv(['MODEL_STATUS_SLOW_RETRY_TIMEOUT_MS'], DEFAULT_MANUAL_SLOW_RETRY_TIMEOUT_MS)
  );
  const softFailureThreshold = numberParam(
    url.searchParams.get('softFailureThreshold'),
    numberFromEnv(['MODEL_STATUS_SOFT_FAILURE_THRESHOLD'], DEFAULT_MANUAL_SOFT_FAILURE_THRESHOLD)
  );
  const staleHours = numberParam(
    url.searchParams.get('staleHours'),
    numberFromEnv(['MODEL_STATUS_STALE_HOURS'], DEFAULT_MANUAL_STALE_HOURS)
  );
  const timeoutMs = numberParam(
    url.searchParams.get('timeoutMs'),
    numberFromEnv(['MODEL_STATUS_PROBE_TIMEOUT_MS'], DEFAULT_MANUAL_TIMEOUT_MS)
  );

  const summary = await runModelStatusChecks(config, discoveredModels, {
    concurrency,
    force: boolParam(url.searchParams.get('force')),
    excludeModelIds,
    finalizeUnknown,
    limit: limit > 0 ? limit : undefined,
    maxRuntimeMs,
    provider,
    providerDelayMs,
    slowRetryConcurrency,
    slowRetryTimeoutMs,
    softFailureThreshold,
    staleAfterMs: staleHours * 60 * 60 * 1000,
    status,
    timeoutMs,
    trigger,
  });

  return NextResponse.json({
    ok: true,
    provider: provider ?? 'all',
    authorization: authorization.source,
    credentialSource,
    modelCount: discoveredModels.length,
    checkableCount: summary.checkableCount,
    dueCount: summary.dueCount,
    selectedCount: summary.selectedCount,
    checkedCount: summary.checkedCount,
    workingCount: summary.workingCount,
    failingCount: summary.failingCount,
    unknownCount: summary.unknownCount,
    retryCount: summary.retryCount,
    softFailureCount: summary.softFailureCount,
    remainingDueCount: summary.remainingDueCount,
    skippedCount: summary.skippedCount,
    stoppedByBudget: summary.stoppedByBudget,
    strategy: {
      mode: 'manual',
      concurrency,
      force: boolParam(url.searchParams.get('force')),
      excludeCount: excludeModelIds.length,
      finalizeUnknown,
      limit: limit > 0 ? limit : null,
      maxRuntimeMs,
      providerDelayMs,
      slowRetryConcurrency,
      slowRetryTimeoutMs,
      softFailureThreshold,
      staleHours,
      status: status ?? 'all',
      timeoutMs,
      envProviderKeys,
    },
    results: summary.results,
    providerResults: providerResults.map(result => ({
      provider: result.provider,
      ok: result.ok,
      skipped: result.skipped,
      modelCount: result.modelCount,
      error: result.error,
      status: result.status,
    })),
  });
}
