import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OpenProviderConfig,
  ProviderId,
  ProviderModelSource,
  ProviderModelSourceFormat,
  ProviderRuntimeConfig,
} from '../core/types';
import {
  CLOUDFLARE_API_ROOT,
  PROVIDER_DEFAULT_BASE_URLS,
  PROVIDER_DEFAULT_MODELS_BASE_URLS,
  PROVIDER_KEY_NAMES,
} from '../core/providerRegistry';

const DEFAULT_BASE_URL = 'http://localhost:3000/v1';
const DEFAULT_MODEL = 'auto';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MODEL_SYNC_TTL_MS = 60 * 60 * 1000;
const DEFAULT_FREE_MODELS_ONLY = true;
const CLOUDFLARE_ACCOUNT_PLACEHOLDER = '{account_id}';

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseDotEnv(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key) {
      result[key] = stripOuterQuotes(value);
    }
  }

  return result;
}

export function loadDotEnv(filePath = resolve(process.cwd(), '.env')): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = parseDotEnv(readFileSync(filePath, 'utf8'));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeAtxpOpenAiBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);

    if (url.hostname === 'chat.atxp.ai') {
      return 'https://llm.atxp.ai/v1';
    }

    if (url.hostname === 'llm.atxp.ai') {
      if (
        url.pathname === '' ||
        url.pathname === '/' ||
        url.pathname === '/v1' ||
        url.pathname === '/v1/models' ||
        url.pathname === '/v1/chat/completions'
      ) {
        return 'https://llm.atxp.ai/v1';
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeAtxpModelsBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);

    if (url.hostname === 'chat.atxp.ai') {
      if (
        url.pathname === '' ||
        url.pathname === '/' ||
        url.pathname.startsWith('/c/') ||
        url.pathname === '/api' ||
        url.pathname === '/api/models'
      ) {
        return 'https://chat.atxp.ai/api';
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeOllamaOpenAiBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);
    if (url.hostname === 'api.ollama.com') {
      return 'https://ollama.com/v1';
    }

    if (url.hostname === 'ollama.com' && (url.pathname === '' || url.pathname === '/' || url.pathname === '/api')) {
      return 'https://ollama.com/v1';
    }

    if (
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
      (url.pathname === '' || url.pathname === '/' || url.pathname === '/api')
    ) {
      url.pathname = '/v1';
      return normalizeBaseUrl(url.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeOllamaModelsBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);
    if (url.hostname === 'api.ollama.com') {
      return 'https://ollama.com/api';
    }

    if (url.hostname === 'ollama.com' && (url.pathname === '' || url.pathname === '/' || url.pathname === '/v1')) {
      return 'https://ollama.com/api';
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function readFirstConfiguredEnv(names: readonly string[]): string | undefined {
  return names
    .map(name => process.env[name]?.trim() ?? '')
    .find(value => value.length > 0);
}

function readConfiguredEnvList(names: readonly string[]): string[] {
  const value = readFirstConfiguredEnv(names);
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function absoluteUrlWithPath(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function modelSourceFormatForCatalog(catalogUrl: string): ProviderModelSourceFormat {
  try {
    const url = new URL(catalogUrl);
    return url.hostname === 'models.dev' ? 'models-dev-provider' : 'openai-compatible';
  } catch {
    return 'openai-compatible';
  }
}

function readProviderConfig(
  id: ProviderId,
  baseUrlNames: readonly string[],
  modelsBaseUrlNames: readonly string[] = []
): ProviderRuntimeConfig {
  const baseUrl = readFirstConfiguredEnv(baseUrlNames) ?? PROVIDER_DEFAULT_BASE_URLS[id];

  const modelsBaseUrl = readFirstConfiguredEnv(modelsBaseUrlNames) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS[id];

  return {
    id,
    apiKey: '',
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: false,
    missingConfigReason: 'Provider credentials must be saved in Account -> Provider setup.',
  };
}

function readRegisteredProviderConfig(id: ProviderId): ProviderRuntimeConfig {
  const names = PROVIDER_KEY_NAMES[id];
  return readProviderConfig(id, names.baseUrl, names.modelsBaseUrl);
}

function applyRegisteredEnvProviderConfig(id: ProviderId, current: ProviderRuntimeConfig): ProviderRuntimeConfig {
  const names = PROVIDER_KEY_NAMES[id];
  const apiKey = readFirstConfiguredEnv(names.apiKey) ?? current.apiKey;
  const baseUrl = readFirstConfiguredEnv(names.baseUrl) ?? current.baseUrl;
  const modelsBaseUrl = readFirstConfiguredEnv(names.modelsBaseUrl ?? []) ?? current.modelsBaseUrl;

  return {
    ...current,
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: apiKey.length > 0 || current.enabled,
    missingConfigReason: apiKey ? undefined : current.missingConfigReason,
  };
}

function applyCloudflareEnvProviderConfig(current: ProviderRuntimeConfig): ProviderRuntimeConfig {
  const apiKey = readFirstConfiguredEnv(PROVIDER_KEY_NAMES.cloudflare.apiKey) ?? current.apiKey;
  const accountId = readFirstConfiguredEnv(['CLOUDFLARE_ACCOUNT_ID']) ?? '';
  const accountRoot = accountId ? cloudflareAccountApiRoot(accountId) : '';
  const baseUrl = readFirstConfiguredEnv(PROVIDER_KEY_NAMES.cloudflare.baseUrl)
    ?? (accountRoot ? `${accountRoot}/v1` : current.baseUrl);
  const modelsBaseUrl = readFirstConfiguredEnv(PROVIDER_KEY_NAMES.cloudflare.modelsBaseUrl ?? [])
    ?? (accountRoot || current.modelsBaseUrl);
  const missingConfig: string[] = [];

  if (!apiKey) {
    missingConfig.push('Cloudflare API token is not configured');
  }

  if (!accountId || baseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER) || modelsBaseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER)) {
    missingConfig.push('Cloudflare account id is not configured');
  }

  return {
    ...current,
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: missingConfig.length === 0,
    missingConfigReason: missingConfig.length > 0 ? `${missingConfig.join('; ')}.` : undefined,
  };
}

function applyAtxpEnvProviderConfig(current: ProviderRuntimeConfig): ProviderRuntimeConfig {
  const apiKey = readFirstConfiguredEnv(PROVIDER_KEY_NAMES.atxp.apiKey) ?? current.apiKey;
  const baseUrl = normalizeAtxpOpenAiBaseUrl(
    readFirstConfiguredEnv(PROVIDER_KEY_NAMES.atxp.baseUrl) ?? current.baseUrl
  );
  const modelsBaseUrl = normalizeAtxpModelsBaseUrl(
    readFirstConfiguredEnv(PROVIDER_KEY_NAMES.atxp.modelsBaseUrl ?? []) ?? current.modelsBaseUrl
  );

  return {
    ...current,
    apiKey,
    baseUrl,
    modelsBaseUrl,
    enabled: apiKey.length > 0,
    missingConfigReason: apiKey ? undefined : current.missingConfigReason,
  };
}

function applyOllamaEnvProviderConfig(current: ProviderRuntimeConfig): ProviderRuntimeConfig {
  const apiKey = readFirstConfiguredEnv(PROVIDER_KEY_NAMES.ollama.apiKey) ?? current.apiKey;
  const baseUrl = normalizeOllamaOpenAiBaseUrl(
    readFirstConfiguredEnv(PROVIDER_KEY_NAMES.ollama.baseUrl) ?? current.baseUrl
  );
  const modelsBaseUrl = normalizeOllamaModelsBaseUrl(
    readFirstConfiguredEnv(PROVIDER_KEY_NAMES.ollama.modelsBaseUrl ?? []) ?? current.modelsBaseUrl
  );

  return {
    ...current,
    apiKey,
    baseUrl,
    modelsBaseUrl,
    enabled: apiKey.length > 0,
    missingConfigReason: apiKey ? undefined : current.missingConfigReason,
  };
}

function cloudflareAccountApiRoot(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai`;
}

function readCloudflareProviderConfig(): ProviderRuntimeConfig {
  const accountId = readFirstConfiguredEnv(['CLOUDFLARE_ACCOUNT_ID']) ?? '';
  const accountRoot = accountId ? cloudflareAccountApiRoot(accountId) : '';
  const baseUrl = readFirstConfiguredEnv(['CLOUDFLARE_BASE_URL'])
    ?? (accountRoot ? `${accountRoot}/v1` : PROVIDER_DEFAULT_BASE_URLS.cloudflare);
  const modelsBaseUrl = readFirstConfiguredEnv(['CLOUDFLARE_MODELS_BASE_URL'])
    ?? (accountRoot || PROVIDER_DEFAULT_MODELS_BASE_URLS.cloudflare);
  const missingConfig: string[] = [];

  if (baseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER) || modelsBaseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER)) {
    missingConfig.push('Cloudflare account id is not configured');
  }

  return {
    id: 'cloudflare',
    apiKey: '',
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: false,
    missingConfigReason: missingConfig.length > 0
      ? `${missingConfig.join('; ')}. Provider credentials must be saved in Account -> Provider setup.`
      : 'Provider credentials must be saved in Account -> Provider setup.',
  };
}

function readLlm7ProviderConfig(): ProviderRuntimeConfig {
  const baseUrl = readFirstConfiguredEnv(['LLM7_BASE_URL']) ?? PROVIDER_DEFAULT_BASE_URLS.llm7;
  const modelsBaseUrl = readFirstConfiguredEnv(['LLM7_MODELS_BASE_URL']) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS.llm7;

  return {
    id: 'llm7',
    apiKey: '',
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: true,
  };
}

function readAtxpProviderConfig(): ProviderRuntimeConfig {
  const baseUrl = normalizeAtxpOpenAiBaseUrl(
    readFirstConfiguredEnv(['ATXP_BASE_URL', 'ATXP_LLM_BASE_URL']) ?? PROVIDER_DEFAULT_BASE_URLS.atxp
  );
  const modelsBaseUrl = normalizeAtxpModelsBaseUrl(
    readFirstConfiguredEnv(['ATXP_MODELS_BASE_URL']) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS.atxp
  );

  return {
    id: 'atxp',
    apiKey: '',
    baseUrl,
    modelsBaseUrl,
    enabled: false,
    missingConfigReason: 'Provider credentials must be saved in Account -> Provider setup.',
  };
}

function readPollinationsProviderConfig(): ProviderRuntimeConfig {
  const baseUrl = readFirstConfiguredEnv(['POLLINATIONS_BASE_URL']) ?? PROVIDER_DEFAULT_BASE_URLS.pollinations;
  const modelsBaseUrl = readFirstConfiguredEnv(['POLLINATIONS_MODELS_BASE_URL']) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS.pollinations;

  return {
    id: 'pollinations',
    apiKey: '',
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: true,
  };
}

function readOpenProviderModelsProviderConfig(): ProviderRuntimeConfig {
  const baseUrl = readFirstConfiguredEnv([
    'OPENPROVIDERGATEWAY_URL',
    'OPENPROVIDER_FREE_BASE_URL',
    'OPENPROVIDER_FREE_MODELS_API_BASE_URL',
  ]) ?? PROVIDER_DEFAULT_BASE_URLS.openprovider;
  const modelsBaseUrl = readFirstConfiguredEnv([
    'OPENPROVIDERGATEWAY_URL',
    'OPENPROVIDER_FREE_MODELS_BASE_URL',
    'OPENPROVIDER_FREE_CATALOG_BASE_URL',
  ]) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS.openprovider;
  const apiKey = readFirstConfiguredEnv([
    'OPENPROVIDER_FREE_API_KEY',
    'OPENPROVIDER_FREE_MODELS_API_KEY',
  ]) ?? 'anonymous';
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedModelsBaseUrl = normalizeBaseUrl(modelsBaseUrl);
  const extraCatalogUrls = readConfiguredEnvList([
    'OPENPROVIDER_FREE_ROUTE_CATALOG_URLS',
    'OPENPROVIDER_FREE_SOURCE_CATALOG_URLS',
  ]);
  const extraRouteBaseUrls = readConfiguredEnvList([
    'OPENPROVIDER_FREE_ROUTE_BASE_URLS',
    'OPENPROVIDER_FREE_SOURCE_BASE_URLS',
  ]);
  const modelSources: ProviderModelSource[] = [
    ...(normalizedModelsBaseUrl ? [{
      category: 'text' as const,
      catalogUrl: absoluteUrlWithPath(normalizedModelsBaseUrl, '/models'),
      format: 'openai-compatible' as const,
      routeBaseUrl: normalizedBaseUrl,
      usesProviderAuth: true,
    }] : []),
    ...extraCatalogUrls.map((catalogUrl, index) => ({
      category: 'text' as const,
      catalogUrl: normalizeBaseUrl(catalogUrl),
      format: modelSourceFormatForCatalog(catalogUrl),
      routeBaseUrl: extraRouteBaseUrls[index] ? normalizeBaseUrl(extraRouteBaseUrls[index]) : undefined,
      usesProviderAuth: false,
    })),
  ];

  return {
    id: 'openprovider',
    apiKey,
    baseUrl: normalizedBaseUrl,
    modelsBaseUrl: normalizedModelsBaseUrl,
    modelSources,
    enabled: modelSources.length > 0,
    missingConfigReason: modelSources.length > 0 ? undefined : 'OpenProvider free model sources are not configured.',
  };
}

function readOllamaProviderConfig(): ProviderRuntimeConfig {
  const baseUrl = normalizeOllamaOpenAiBaseUrl(
    readFirstConfiguredEnv(['OLLAMA_BASE_URL']) ?? PROVIDER_DEFAULT_BASE_URLS.ollama
  );
  const modelsBaseUrl = normalizeOllamaModelsBaseUrl(
    readFirstConfiguredEnv(['OLLAMA_MODELS_BASE_URL']) ?? PROVIDER_DEFAULT_MODELS_BASE_URLS.ollama
  );

  return {
    id: 'ollama',
    apiKey: '',
    baseUrl,
    modelsBaseUrl,
    enabled: false,
    missingConfigReason: 'Ollama Cloud API credentials must be saved in Account -> Provider setup.',
  };
}

function loadProviderConfigs(): Record<ProviderId, ProviderRuntimeConfig> {
  return {
    nvidia: readRegisteredProviderConfig('nvidia'),
    groq: readRegisteredProviderConfig('groq'),
    cloudflare: readCloudflareProviderConfig(),
    sambanova: readRegisteredProviderConfig('sambanova'),
    siliconflow: readRegisteredProviderConfig('siliconflow'),
    cohere: readRegisteredProviderConfig('cohere'),
    mistral: readRegisteredProviderConfig('mistral'),
    openrouter: readRegisteredProviderConfig('openrouter'),
    freemodel: readRegisteredProviderConfig('freemodel'),
    puter: readRegisteredProviderConfig('puter'),
    openprovider: readOpenProviderModelsProviderConfig(),
    shuttleai: readRegisteredProviderConfig('shuttleai'),
    cerbes: readRegisteredProviderConfig('cerbes'),
    zai: readRegisteredProviderConfig('zai'),
    google: readRegisteredProviderConfig('google'),
    routeway: readRegisteredProviderConfig('routeway'),
    llmgateway: readRegisteredProviderConfig('llmgateway'),
    atxp: readAtxpProviderConfig(),
    apifreellm: readRegisteredProviderConfig('apifreellm'),
    zenmux: readRegisteredProviderConfig('zenmux'),
    llm7: readLlm7ProviderConfig(),
    ollama: readOllamaProviderConfig(),
    huggingface: readRegisteredProviderConfig('huggingface'),
    pollinations: readPollinationsProviderConfig(),
  };
}

export function loadOpenProviderConfig(): OpenProviderConfig {
  loadDotEnv(resolve(process.cwd(), '.env.local'));
  loadDotEnv();

  return {
    apiKey: process.env.OPENPROVIDER_API_KEY?.trim() ?? '',
    baseUrl: normalizeBaseUrl(
      process.env.OPENPROVIDER_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/v1` : undefined) ??
      (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/v1` : undefined) ??
      DEFAULT_BASE_URL
    ),
    defaultModel: process.env.OPENPROVIDER_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
    autoModel: process.env.OPENPROVIDER_AUTO_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: readPositiveInteger(process.env.OPENPROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    modelSyncTtlMs: readPositiveInteger(process.env.OPENPROVIDER_MODEL_SYNC_TTL_MS, DEFAULT_MODEL_SYNC_TTL_MS),
    freeModelsOnly: readBoolean(process.env.OPENPROVIDER_FREE_MODELS_ONLY, DEFAULT_FREE_MODELS_ONLY),
    providers: loadProviderConfigs(),
  };
}

export function applyEnvProviderKeysToConfig(config: OpenProviderConfig): OpenProviderConfig {
  loadDotEnv(resolve(process.cwd(), '.env.local'));
  loadDotEnv();

  return {
    ...config,
    providers: {
      ...config.providers,
      nvidia: applyRegisteredEnvProviderConfig('nvidia', config.providers.nvidia),
      groq: applyRegisteredEnvProviderConfig('groq', config.providers.groq),
      cloudflare: applyCloudflareEnvProviderConfig(config.providers.cloudflare),
      sambanova: applyRegisteredEnvProviderConfig('sambanova', config.providers.sambanova),
      siliconflow: applyRegisteredEnvProviderConfig('siliconflow', config.providers.siliconflow),
      cohere: applyRegisteredEnvProviderConfig('cohere', config.providers.cohere),
      mistral: applyRegisteredEnvProviderConfig('mistral', config.providers.mistral),
      openrouter: applyRegisteredEnvProviderConfig('openrouter', config.providers.openrouter),
      freemodel: applyRegisteredEnvProviderConfig('freemodel', config.providers.freemodel),
      puter: applyRegisteredEnvProviderConfig('puter', config.providers.puter),
      openprovider: config.providers.openprovider,
      shuttleai: applyRegisteredEnvProviderConfig('shuttleai', config.providers.shuttleai),
      cerbes: applyRegisteredEnvProviderConfig('cerbes', config.providers.cerbes),
      zai: applyRegisteredEnvProviderConfig('zai', config.providers.zai),
      google: applyRegisteredEnvProviderConfig('google', config.providers.google),
      routeway: applyRegisteredEnvProviderConfig('routeway', config.providers.routeway),
      llmgateway: applyRegisteredEnvProviderConfig('llmgateway', config.providers.llmgateway),
      atxp: applyAtxpEnvProviderConfig(config.providers.atxp),
      apifreellm: applyRegisteredEnvProviderConfig('apifreellm', config.providers.apifreellm),
      zenmux: applyRegisteredEnvProviderConfig('zenmux', config.providers.zenmux),
      llm7: applyRegisteredEnvProviderConfig('llm7', config.providers.llm7),
      ollama: applyOllamaEnvProviderConfig(config.providers.ollama),
      huggingface: applyRegisteredEnvProviderConfig('huggingface', config.providers.huggingface),
      pollinations: applyRegisteredEnvProviderConfig('pollinations', config.providers.pollinations),
    },
  };
}
