import { NextResponse } from 'next/server';
import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import { recordOpenProviderApiUsage, statusCodeFromOpenProviderError } from '@/lib/openprovider/api-usage';
import { getCatalogSnapshotForUser } from '@/lib/openprovider/catalog';
import { getProviderSetupStatusesForUser } from '@/lib/openprovider/provider-setup';
import type { ProviderDiscoveryResult } from '@/src/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProviderDiscoveryStatus = {
  ok: boolean;
  skipped: boolean;
  error?: string;
  status_code?: number;
  model_count: number;
  discovered_count: number;
  discovered_model_count: number;
  filtered_count: number;
  filtered_model_count: number;
};

function providerDiscoveryStatus(
  discovery: ProviderDiscoveryResult | undefined,
  missingReason: string | undefined
): ProviderDiscoveryStatus {
  const discoveredCount = discovery?.discoveredModelCount ?? 0;
  const filteredCount = discovery?.filteredModelCount ?? 0;

  return {
    ok: discovery?.ok ?? false,
    skipped: discovery?.skipped ?? Boolean(missingReason),
    error: discovery?.error ?? missingReason,
    status_code: discovery?.status,
    model_count: discovery?.modelCount ?? 0,
    discovered_count: discoveredCount,
    discovered_model_count: discoveredCount,
    filtered_count: filteredCount,
    filtered_model_count: filteredCount,
  };
}

export async function GET(request: Request) {
  const authResult = await requireOpenProviderApiKey(request);
  if ('response' in authResult) return authResult.response;
  const startedAt = Date.now();

  try {
    const [providers, catalog] = await Promise.all([
      getProviderSetupStatusesForUser(authResult.auth.userId),
      getCatalogSnapshotForUser(authResult.auth.userId),
    ]);
    const resolvedCatalog = providers.some(provider => {
      if (!provider.configured) {
        return false;
      }

      const discovery = catalog.providerResults.find(result => result.provider === provider.id);
      if (!discovery?.skipped) {
        return false;
      }

      const error = discovery.error ?? '';
      return (
        error.includes('No user credential is saved') ||
        error.includes('Sign in and save provider credentials') ||
        error.includes('API key is not configured')
      );
    })
      ? await getCatalogSnapshotForUser(authResult.auth.userId, true)
      : catalog;
    const discoveryResults = new Map(resolvedCatalog.providerResults.map(result => [result.provider, result]));

    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      endpoint: '/v1/providers/status',
      method: 'GET',
      ok: true,
      startedAt,
      statusCode: 200,
      workflow: 'providers',
    });

    return NextResponse.json({
      object: 'list',
      data: providers.map(provider => {
        const discovery = discoveryResults.get(provider.id);
        const discoveryStatus = providerDiscoveryStatus(discovery, provider.missingReason);
        const modelCount = resolvedCatalog.providerCounts[provider.id] ?? 0;
        const status = !provider.configured
          ? 'missing_credentials'
          : discovery?.skipped
            ? 'discovery_skipped'
            : discovery && !discovery.ok
              ? 'discovery_error'
              : modelCount > 0
                ? 'ready'
                : 'no_models';

        return {
          id: provider.id,
          name: provider.name,
          configured: provider.configured,
          status,
          missing_reason: provider.missingReason,
          models: modelCount,
          ok: discoveryStatus.ok,
          skipped: discoveryStatus.skipped,
          error: discoveryStatus.error,
          model_count: discoveryStatus.model_count,
          discovered_count: discoveryStatus.discovered_count,
          discovered_model_count: discoveryStatus.discovered_model_count,
          filtered_count: discoveryStatus.filtered_count,
          filtered_model_count: discoveryStatus.filtered_model_count,
          discovery: discoveryStatus,
          capabilities: provider.capabilities,
        };
      }),
    });
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      endpoint: '/v1/providers/status',
      error,
      method: 'GET',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'providers',
    });
    throw error;
  }
}
