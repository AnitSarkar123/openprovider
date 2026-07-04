import { getCatalogSnapshot } from '@/lib/openprovider/catalog';
import { applyUserProviderKeysToConfig } from '@/lib/openprovider/provider-keys';
import { loadOpenProviderConfig } from '@/src/config/env';
import { OPENPROVIDER_AUTO_FREE_MODEL_ID } from '@/src/core/autoFreeRouter';
import { categorizeModel, normalizeModalities } from '@/src/core/modelCategoryUtils';
import type { ModelCategory, ProviderId, ProviderModel, ProviderRouteFormat } from '@/src/core/types';
import { bearerToken } from '@/src/utils/auth';

export type VscodeDirectCredentialProvider = {
  baseUrl: string;
  apiKey?: string;
};

export type VscodeDirectCredentialModel = {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  category: ModelCategory;
  inputModalities: string[];
  outputModalities: string[];
  contextWindow: number;
  outputTokens: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsImages: boolean;
  routeBaseUrl?: string;
  routeFormat?: ProviderRouteFormat;
  usesProviderAuth: boolean;
};

export type VscodeDirectCredentialBundle = {
  version: 1;
  issuedAt: string;
  providers: Record<string, VscodeDirectCredentialProvider>;
  models: VscodeDirectCredentialModel[];
};

const DIRECT_ROUTE_EXCLUDED_PROVIDERS = new Set<ProviderId>(['apifreellm', 'openprovider']);

function cleanBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

function canUseDirectRoute(baseUrl: string): boolean {
  if (!baseUrl) return false;
  if (baseUrl.includes('{') || baseUrl.includes('}')) return false;

  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function defaultInputModalities(category: ModelCategory): string[] {
  return category === 'vision' ? ['text', 'image'] : ['text'];
}

function defaultOutputModalities(category: ModelCategory): string[] {
  if (category === 'image') return ['image'];
  if (category === 'audio') return ['audio'];
  return ['text'];
}

function vscodeContextWindow(model: ProviderModel): number {
  const maxInputTokens = Math.max(0, Math.floor(model.maxInputTokens));
  const maxOutputTokens = Math.max(0, Math.floor(model.maxOutputTokens));
  return maxInputTokens + maxOutputTokens;
}

function toDirectModel(model: ProviderModel): VscodeDirectCredentialModel | null {
  if (model.id === OPENPROVIDER_AUTO_FREE_MODEL_ID) return null;
  if (DIRECT_ROUTE_EXCLUDED_PROVIDERS.has(model.provider)) return null;

  const category = categorizeModel(model);
  const inputModalities = normalizeModalities(model.inputModalities ?? defaultInputModalities(category));
  const outputModalities = normalizeModalities(model.outputModalities ?? defaultOutputModalities(category));
  if (!outputModalities.includes('text')) return null;

  return {
    id: model.id,
    modelId: model.modelId,
    name: model.name,
    provider: model.provider,
    category,
    inputModalities,
    outputModalities,
    contextWindow: vscodeContextWindow(model),
    outputTokens: Math.max(0, Math.floor(model.maxOutputTokens)),
    supportsTools: model.supportsTools === true,
    supportsReasoning: model.supportsReasoning === true ||
      model.tags.some(tag => ['reasoning', 'thinking'].includes(tag.toLowerCase())),
    supportsImages: inputModalities.includes('image') || category === 'vision',
    routeBaseUrl: cleanBaseUrl(model.routeBaseUrl) || undefined,
    routeFormat: model.routeFormat ?? 'openai-compatible',
    usesProviderAuth: model.routeUsesProviderAuth !== false,
  };
}

export async function buildVscodeDirectCredentialBundle(
  userId: string
): Promise<VscodeDirectCredentialBundle | null> {
  const config = await applyUserProviderKeysToConfig(loadOpenProviderConfig(), userId);

  const snapshot = await getCatalogSnapshot({
    config,
    cacheKey: `user:${userId}`,
  });
  const providerModels = snapshot.providerResults
    .flatMap(result => result.models)
    .filter(model => model.free);
  const providers: Record<string, VscodeDirectCredentialProvider> = {};
  const models: VscodeDirectCredentialModel[] = [];
  const seenModelIds = new Set<string>();

  for (const model of providerModels) {
    const provider = config.providers[model.provider];
    if (!provider?.enabled) continue;

    const directModel = toDirectModel(model);
    if (!directModel) continue;

    const providerBaseUrl = cleanBaseUrl(provider.baseUrl);
    const routeBaseUrl = directModel.routeBaseUrl || providerBaseUrl;
    if (!canUseDirectRoute(routeBaseUrl)) continue;

    const token = directModel.usesProviderAuth ? bearerToken(provider.apiKey) : '';
    if (directModel.usesProviderAuth && !token) continue;

    const modelKey = directModel.id.toLowerCase();
    if (seenModelIds.has(modelKey)) continue;
    seenModelIds.add(modelKey);

    const existingProvider = providers[model.provider];
    if (existingProvider) {
      if (token && !existingProvider.apiKey) {
        existingProvider.apiKey = token;
      }
    } else {
      providers[model.provider] = {
        baseUrl: providerBaseUrl || routeBaseUrl,
        ...(token ? { apiKey: token } : {}),
      };
    }
    models.push(directModel);
  }

  if (models.length === 0) {
    return null;
  }

  return {
    version: 1,
    issuedAt: new Date().toISOString(),
    providers,
    models,
  };
}

export function encodeVscodeDirectCredentialBundle(
  bundle: VscodeDirectCredentialBundle | null
): string | undefined {
  if (!bundle) return undefined;
  return Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64url');
}
