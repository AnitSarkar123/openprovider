import { googleProvider } from '../providers/google';
import { apiFreeLlmProvider } from '../providers/apifreellm';
import { atxpProvider } from '../providers/atxp';
import { cohereProvider } from '../providers/cohere';
import { zaiProvider } from '../providers/zai';
import { OpenProviderError } from '../utils/errors';
import { bearerToken } from '../utils/auth';
import { countProviderModelList, parseProviderModelList } from './modelDiscovery';
import {
  OpenProviderConfig,
  ProviderDiscoveryResult,
  ProviderId,
  ProviderModel,
  ProviderModelSource,
  ProviderRuntimeConfig,
} from './types';
import { PROVIDER_API_KEY_REQUIRED, PROVIDER_DISCOVERY_TARGETS } from './providerRegistry';

const STATIC_DISCOVERY_MODELS: Partial<Record<ProviderId, ProviderModel[]>> = {
  zai: zaiProvider.models,
  google: googleProvider.models,
  cohere: cohereProvider.models,
  apifreellm: apiFreeLlmProvider.models,
  atxp: atxpProvider.models,
};

type DiscoverySourceGroup = {
  catalogUrl: string;
  usesProviderAuth: boolean;
  sources: ProviderModelSource[];
};

type DiscoverySourceGroupResult = {
  discoveredModelCount: number;
  errors: string[];
  models: ProviderModel[];
  okTargetCount: number;
};

function staticDiscoveryModels(provider: ProviderRuntimeConfig): ProviderModel[] {
  return [...(STATIC_DISCOVERY_MODELS[provider.id] ?? [])];
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function isAtxpChatCatalogUrl(catalogUrl: string): boolean {
  try {
    return new URL(catalogUrl).hostname === 'chat.atxp.ai';
  } catch {
    return false;
  }
}

function targetSources(provider: ProviderRuntimeConfig): ProviderModelSource[] {
  if (provider.modelSources?.length) {
    return provider.modelSources;
  }

  return PROVIDER_DISCOVERY_TARGETS[provider.id].map(target => ({
    category: target.category,
    catalogUrl: endpoint(target.modelsBaseUrl ?? provider.modelsBaseUrl, target.path),
    format: target.format ?? 'openai-compatible',
    routeBaseUrl: target.routeBaseUrl ?? provider.baseUrl,
    routeFormat: target.routeFormat,
    usesProviderAuth: target.usesProviderAuth ?? true,
  }));
}

function providerRequiresDiscoveryToken(provider: ProviderRuntimeConfig): boolean {
  return PROVIDER_API_KEY_REQUIRED[provider.id];
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof OpenProviderError) {
    return error.message;
  }

  const message = (error as Error).message || 'Unknown error';
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const causeDetail = cause?.code ?? cause?.message;

  return causeDetail ? `${message}: ${causeDetail}` : message;
}

function groupSourcesByCatalogUrl(sources: ProviderModelSource[]): DiscoverySourceGroup[] {
  const groups = new Map<string, DiscoverySourceGroup>();

  for (const source of sources) {
    const usesProviderAuth = source.usesProviderAuth !== false;
    const key = `${usesProviderAuth ? 'auth' : 'anonymous'}:${source.catalogUrl}`;
    const existing = groups.get(key);

    if (existing) {
      existing.sources.push(source);
      continue;
    }

    groups.set(key, {
      catalogUrl: source.catalogUrl,
      usesProviderAuth,
      sources: [source],
    });
  }

  return [...groups.values()];
}

async function fetchJson(
  provider: ProviderRuntimeConfig,
  catalogUrl: string,
  usesProviderAuth: boolean,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const token = usesProviderAuth ? bearerToken(provider.apiKey) : '';
  const authorization = token ? `Bearer ${token}` : '';
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (provider.id === 'atxp' && token && isAtxpChatCatalogUrl(catalogUrl)) {
    headers.Cookie = `connection_token=${encodeURIComponent(token)}`;
  }

  try {
    const response = await fetch(catalogUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenProviderError(
        `${provider.id} model discovery failed with status ${response.status}.`,
        response.status
      );
    }

    const text = await response.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new OpenProviderError(`${provider.id} model discovery timed out after ${timeoutMs}ms.`);
    }

    if (error instanceof SyntaxError) {
      throw new OpenProviderError(`${provider.id} returned invalid JSON while fetching models.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSourceGroup(
  provider: ProviderRuntimeConfig,
  group: DiscoverySourceGroup,
  timeoutMs: number,
  freeOnly: boolean
): Promise<DiscoverySourceGroupResult> {
  let payload: unknown;

  try {
    payload = await fetchJson(provider, group.catalogUrl, group.usesProviderAuth, timeoutMs);
  } catch (error) {
    const message = safeErrorMessage(error);

    return {
      discoveredModelCount: 0,
      errors: group.sources.map(source => `${source.category}: ${message}`),
      models: [],
      okTargetCount: 0,
    };
  }

  const models: ProviderModel[] = [];
  const errors: string[] = [];
  let discoveredModelCount = 0;
  let okTargetCount = 0;

  for (const source of group.sources) {
    try {
      const options = {
        category: source.category,
        routeBaseUrl: source.routeBaseUrl,
        routeFormat: source.routeFormat,
        routeUsesProviderAuth: group.usesProviderAuth,
        sourceApiUrl: source.routeBaseUrl,
        sourceCatalogUrl: source.catalogUrl,
        sourceFormat: source.format,
      };

      models.push(...parseProviderModelList(payload, provider.id, {
        freeOnly,
        ...options,
      }));
      discoveredModelCount += countProviderModelList(payload, provider.id, options);
      okTargetCount += 1;
    } catch (error) {
      errors.push(`${source.category}: ${safeErrorMessage(error)}`);
    }
  }

  return {
    discoveredModelCount,
    errors,
    models,
    okTargetCount,
  };
}

export async function discoverProviderModels(
  provider: ProviderRuntimeConfig,
  timeoutMs: number,
  freeOnly = true
): Promise<ProviderDiscoveryResult> {
  if (!provider.enabled || (providerRequiresDiscoveryToken(provider) && !bearerToken(provider.apiKey))) {
    return {
      provider: provider.id,
      ok: false,
      skipped: true,
      modelCount: 0,
      discoveredModelCount: 0,
      filteredModelCount: 0,
      models: [],
      error: provider.missingConfigReason ?? 'API key is not configured.',
    };
  }

  try {
    const sources = targetSources(provider);
    const targetResults = await Promise.all(
      groupSourcesByCatalogUrl(sources).map(group => discoverSourceGroup(provider, group, timeoutMs, freeOnly))
    );
    const models = targetResults.flatMap(result => result.models);
    const errors = targetResults.flatMap(result => result.errors);
    const discoveredModelCount = targetResults.reduce((count, result) => count + result.discoveredModelCount, 0);
    const okTargetCount = targetResults.reduce((count, result) => count + result.okTargetCount, 0);

    const staticModels = staticDiscoveryModels(provider);

    if (okTargetCount === 0 && staticModels.length === 0) {
      throw new OpenProviderError(errors.join(' | ') || `${provider.id} model discovery failed.`);
    }

    models.push(...staticModels);

    const uniqueModels = Array.from(new Map(models.map(model => [model.id.toLowerCase(), model])).values());
    const staticModelCount = staticModels.length;

    return {
      provider: provider.id,
      ok: true,
      skipped: false,
      modelCount: uniqueModels.length,
      discoveredModelCount: discoveredModelCount + staticModelCount,
      filteredModelCount: Math.max(0, discoveredModelCount + staticModelCount - uniqueModels.length),
      models: uniqueModels,
      error: errors.length > 0 ? errors.join(' | ') : undefined,
    };
  } catch (error) {
    return {
      provider: provider.id,
      ok: false,
      skipped: false,
      modelCount: 0,
      discoveredModelCount: 0,
      filteredModelCount: 0,
      models: [],
      error: safeErrorMessage(error),
      status: error instanceof OpenProviderError ? error.status : undefined,
    };
  }
}

export async function discoverConfiguredProviderModels(
  config: OpenProviderConfig
): Promise<ProviderDiscoveryResult[]> {
  const providers = Object.values(config.providers);
  return Promise.all(
    providers.map(provider => discoverProviderModels(provider, config.timeoutMs, config.freeModelsOnly))
  );
}
