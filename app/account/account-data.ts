import { getServerSession } from 'next-auth';
import { authIsConfigured, authOptions } from '@/lib/auth';
import { hasDatabase } from '@/lib/db/client';
import { getCatalogSnapshotForUser } from '@/lib/openprovider/catalog';
import { listRecentConversations } from '@/lib/openprovider/chat';
import { listOpenProviderApiKeys } from '@/lib/openprovider/api-keys';
import { getApiRequestTraceEmptyData, getApiRequestTraceForUser, getApiUsageEmptySummary, getApiUsageSummaryForUser } from '@/lib/openprovider/api-usage';
import { getProviderSetupStatusesForUser } from '@/lib/openprovider/provider-setup';
import { listSavedModels } from '@/lib/openprovider/saved-models';
import type { ApiKeyRow } from '@/components/account/api-keys-panel';
import type { CatalogSnapshot } from '@/lib/openprovider/catalog';
import type { ProviderSetupStatus } from '@/lib/openprovider/provider-setup';

export const openProviderApiActions = [
  {
    method: 'GET',
    path: '/v1/models',
    label: 'List every free model available to your workspace.',
  },
  {
    method: 'POST',
    path: '/v1/chat/completions',
    label: 'Run chat completions through your configured provider keys.',
  },
  {
    method: 'POST',
    path: '/v1/images/generations',
    label: 'Generate images through auto or exact image routes.',
  },
  {
    method: 'POST',
    path: '/v1/images/analyze',
    label: 'Route visual understanding requests to configured models.',
  },
  {
    method: 'POST',
    path: '/v1/audio/speech',
    label: 'Create speech from text prompts using free speech models.',
  },
  {
    method: 'GET',
    path: '/v1/providers/status',
    label: 'Check provider setup, availability, and catalog counts.',
  },
];

export async function getAccountSession() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  return { session, userId };
}

export async function getAccountSidebarData() {
  const { userId } = await getAccountSession();
  const [saved, conversations, apiKeys, providers] = await Promise.all([
    userId ? listSavedModels(userId) : Promise.resolve([]),
    userId ? listRecentConversations(userId) : Promise.resolve([]),
    userId ? listOpenProviderApiKeys(userId) : Promise.resolve([]),
    getProviderSetupStatusesForUser(userId),
  ]);
  const configuredCount = providers.filter(provider => provider.configured).length;

  return {
    apiKeyCount: apiKeys.filter(key => !key.revokedAt).length,
    conversationCount: conversations.length,
    missingProviderCount: providers.length - configuredCount,
    savedCount: saved.length,
  };
}

export async function getAccountOverviewData() {
  const { session, userId } = await getAccountSession();
  const [saved, conversations, apiKeys, providers, catalog] = await Promise.all([
    userId ? listSavedModels(userId) : Promise.resolve([]),
    userId ? listRecentConversations(userId) : Promise.resolve([]),
    userId ? listOpenProviderApiKeys(userId) : Promise.resolve([]),
    getProviderSetupStatusesForUser(userId),
    getCatalogSnapshotForUser(userId),
  ]);
  const configuredCount = providers.filter(provider => provider.configured).length;

  return {
    apiKeyCount: apiKeys.filter(key => !key.revokedAt).length,
    authReady: authIsConfigured(),
    catalog,
    configuredCount,
    conversationCount: conversations.length,
    databaseReady: hasDatabase(),
    missingProviderCount: providers.length - configuredCount,
    savedCount: saved.length,
    session,
  };
}

export async function getApiKeyPageData() {
  const { userId } = await getAccountSession();
  const [apiKeys, usage] = userId
    ? await Promise.all([
      listOpenProviderApiKeys(userId),
      getApiUsageSummaryForUser(userId),
    ])
    : [[], getApiUsageEmptySummary()] as const;
  const apiKeyRows: ApiKeyRow[] = apiKeys.map(key => ({
    ...key,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }));

  return {
    apiKeyRows,
    databaseReady: hasDatabase(),
    signedIn: Boolean(userId),
    usage,
  };
}

export async function getProviderSetupPageData() {
  const { userId } = await getAccountSession();
  const [providers, initialCatalog] = await Promise.all([
    getProviderSetupStatusesForUser(userId),
    getCatalogSnapshotForUser(userId),
  ]);
  const catalog = catalogNeedsSavedCredentialRefresh(providers, initialCatalog)
    ? await getCatalogSnapshotForUser(userId, true)
    : initialCatalog;
  const configuredCount = providers.filter(provider => provider.configured).length;
  const discoveryResults = new Map(catalog.providerResults.map(result => [result.provider, result]));
  const providerRows = providers.map(provider => ({
    ...provider,
    discoveryError: discoveryResults.get(provider.id)?.error,
    discoveryOk: discoveryResults.get(provider.id)?.ok,
    discoverySkipped: discoveryResults.get(provider.id)?.skipped,
    discoveredModelCount: discoveryResults.get(provider.id)?.discoveredModelCount,
    filteredModelCount: discoveryResults.get(provider.id)?.filteredModelCount,
    modelCount: catalog.providerCounts[provider.id] ?? 0,
  }));

  return {
    catalog,
    configuredCount,
    missingProviderCount: providers.length - configuredCount,
    providerRows,
  };
}

function catalogNeedsSavedCredentialRefresh(providers: ProviderSetupStatus[], catalog: CatalogSnapshot): boolean {
  const discoveryResults = new Map(catalog.providerResults.map(result => [result.provider, result]));

  return providers.some(provider => {
    if (!provider.configured) {
      return false;
    }

    const discovery = discoveryResults.get(provider.id);
    if (!discovery?.skipped) {
      return false;
    }

    const error = discovery.error ?? '';
    return (
      error.includes('No user credential is saved') ||
      error.includes('Sign in and save provider credentials') ||
      error.includes('API key is not configured')
    );
  });
}

export async function getSavedModelsPageData() {
  const { userId } = await getAccountSession();
  const saved = userId ? await listSavedModels(userId) : [];

  return { saved, signedIn: Boolean(userId) };
}

export async function getConversationsPageData() {
  const { userId } = await getAccountSession();
  const conversations = userId ? await listRecentConversations(userId) : [];

  return { conversations, signedIn: Boolean(userId) };
}

export async function getRequestTracePageData() {
  const { userId } = await getAccountSession();
  const trace = userId ? await getApiRequestTraceForUser(userId) : getApiRequestTraceEmptyData();

  return {
    databaseReady: hasDatabase(),
    signedIn: Boolean(userId),
    trace,
  };
}
