import fs from 'node:fs';
import path from 'node:path';
import { createDefaultModelRegistry } from '@/src/core/modelRegistry';
import { discoverConfiguredProviderModels } from '@/src/core/providerDiscovery';
import { categorizeModel, isChatRouteCategory, normalizeModalities } from '@/src/core/modelCategoryUtils';
import { loadOpenProviderConfig } from '@/src/config/env';
import { OPENPROVIDER_AUTO_FREE_MODEL_ID, OPENPROVIDER_AUTO_FREE_MODEL_NAME } from '@/src/core/autoFreeRouter';
import { applyUserProviderKeysToConfig, loadUserProviderKeyValues } from './provider-keys';
import { hydratePersistedModelStatuses } from './model-status';
import type { RuntimeModelStatus } from '@/src/core/modelStatus';
import type { ModelCategory, OpenProviderConfig, ProviderDiscoveryResult, ProviderModel } from '@/src/core/types';

export type PublicModel = {
  id: string;
  modelId: string;
  name: string;
  description: string;
  provider: string;
  routeFormat?: string;
  category: ModelCategory;
  inputModalities: string[];
  outputModalities: string[];
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  freeReason: string;
  locked: boolean;
  lockReason?: string;
  tags: string[];
  priority: number;
  status?: RuntimeModelStatus;
  statusCheckedAt?: string;
  statusLatencyMs?: number;
  statusError?: string;
  statusSuccesses?: number;
  statusFailures?: number;
  statusConsecutiveFailures?: number;
  statusLastSuccessAt?: string;
  statusLastFailureAt?: string;
};

export type CatalogSnapshot = {
  models: PublicModel[];
  providerResults: ProviderDiscoveryResult[];
  categoryCounts: Record<string, number>;
  providerCounts: Record<string, number>;
  syncedAt: string;
  freeOnly: boolean;
};

type CatalogCacheEntry = {
  snapshot: CatalogSnapshot;
  createdAt: number;
  expiresAt: number;
};

type CatalogSnapshotOptions = boolean | {
  force?: boolean;
  config?: OpenProviderConfig;
  cacheKey?: string;
};

const TMP_CACHE_DIR = '/tmp/openprovider-catalog-cache';

function getFileCachePath(cacheKey: string): string {
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(TMP_CACHE_DIR, `catalog-${safeKey}.json`);
}

function readFromFileCache(cacheKey: string, maxAgeMs: number): CatalogSnapshot | null {
  try {
    const filePath = getFileCachePath(cacheKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;

    if (ageMs > maxAgeMs) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.models)) {
      return parsed as CatalogSnapshot;
    }
  } catch (error) {
    // Ignore cache read errors
  }
  return null;
}

function writeToFileCache(cacheKey: string, snapshot: CatalogSnapshot): void {
  try {
    if (!fs.existsSync(TMP_CACHE_DIR)) {
      fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
    }

    const filePath = getFileCachePath(cacheKey);
    fs.writeFileSync(filePath, JSON.stringify(snapshot), 'utf8');
  } catch (error) {
    // Ignore cache write errors
  }
}

const catalogCaches = new Map<string, CatalogCacheEntry>();
const catalogSyncPromises = new Map<string, Promise<CatalogSnapshot>>();
const CATALOG_STALE_FALLBACK_MS = 15 * 60 * 1000;
const MIN_CATALOG_TTL_MS = 5 * 1000;
const MAX_CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

function clampCatalogTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return MIN_CATALOG_TTL_MS;
  }

  return Math.max(MIN_CATALOG_TTL_MS, Math.min(MAX_CATALOG_TTL_MS, Math.floor(ttlMs)));
}

function enforceCacheEntryLimit(): void {
  if (catalogCaches.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestEntries = Array.from(catalogCaches.entries())
    .sort((left, right) => left[1].createdAt - right[1].createdAt)
    .slice(0, catalogCaches.size - MAX_CACHE_ENTRIES);

  for (const [key] of oldestEntries) {
    catalogCaches.delete(key);
  }
}

async function buildCatalogSnapshot(config: OpenProviderConfig): Promise<CatalogSnapshot> {
  const providerResults = await discoverConfiguredProviderModels(config);
  const discoveredModels = providerResults.flatMap(result => result.models).filter(model => model.free);
  const uniqueModels = Array.from(new Map(discoveredModels.map(model => [model.id.toLowerCase(), model])).values())
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  const persistedStatuses = await hydratePersistedModelStatuses(uniqueModels.map(model => model.id));
  const providerModels = uniqueModels
    .map(toPublicModel)
    .map(model => withPersistedStatus(model, persistedStatuses));
  const models = withOpenProviderAutoFreeModel(providerModels);

  return {
    models,
    providerResults,
    categoryCounts: countBy(models, 'category'),
    providerCounts: countBy(models, 'provider'),
    syncedAt: new Date().toISOString(),
    freeOnly: config.freeModelsOnly,
  };
}

function normalizeCatalogOptions(options: CatalogSnapshotOptions = false) {
  if (typeof options === 'boolean') {
    return {
      force: options,
      config: loadOpenProviderConfig(),
      cacheKey: 'base',
    };
  }

  return {
    force: options.force ?? false,
    config: options.config ?? loadOpenProviderConfig(),
    cacheKey: options.cacheKey ?? (options.config ? undefined : 'base'),
  };
}

function hasModelDescriptions(snapshot: CatalogSnapshot): boolean {
  return snapshot.models.every(model => typeof model.description === 'string' && model.description.trim().length > 0);
}

function prettyProviderName(provider: string): string {
  if (provider === 'zai') return 'Z.AI';
  if (provider === 'cerbes') return 'Cerebras';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'puter') return 'Puter';
  if (provider === 'sambanova') return 'SambaNova Cloud';
  if (provider === 'siliconflow') return 'SiliconFlow';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function fallbackDescription(model: ProviderModel, category: ModelCategory): string {
  const provider = prettyProviderName(model.provider);
  const input = (model.inputModalities ?? (category === 'vision' ? ['image'] : ['text'])).join(' and ');
  const output = (model.outputModalities ?? (category === 'image' ? ['image'] : category === 'audio' ? ['audio'] : ['text'])).join(' and ');
  const context = model.maxInputTokens > 0 ? ` with up to ${model.maxInputTokens.toLocaleString()} input tokens` : '';

  if (category === 'image') {
    return `${model.name} is a free ${provider} image generation model for creating image outputs from ${input} prompts.`;
  }

  if (category === 'vision') {
    return `${model.name} is a free ${provider} image analysis model for image-and-text input to text output.`;
  }

  if (category === 'audio') {
    return `${model.name} is a free ${provider} speech model for generating audio from text input.`;
  }

  return `${model.name} is a free ${provider} text model for ${input} to ${output}${context}.`;
}

function defaultInputModalities(category: ModelCategory): string[] {
  if (category === 'image') {
    return ['text'];
  }

  if (category === 'vision') {
    return ['image', 'text'];
  }

  return ['text'];
}

function defaultOutputModalities(category: ModelCategory): string[] {
  if (category === 'image') {
    return ['image'];
  }

  if (category === 'audio') {
    return ['audio'];
  }

  return ['text'];
}

function toPublicModel(model: ProviderModel): PublicModel {
  const category = categorizeModel(model);
  const inputModalities = normalizeModalities(model.inputModalities ?? defaultInputModalities(category));
  const outputModalities = normalizeModalities(model.outputModalities ?? defaultOutputModalities(category));

  return {
    id: model.id,
    modelId: model.modelId,
    name: model.name,
    description: model.description ?? fallbackDescription(model, category),
    provider: model.provider,
    routeFormat: model.routeFormat ?? 'openai-compatible',
    category,
    inputModalities,
    outputModalities,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning ?? model.tags.some(tag => ['reasoning', 'thinking'].includes(tag.toLowerCase())),
    freeReason: model.freeReason,
    locked: false,
    lockReason: undefined,
    tags: model.tags,
    priority: model.priority,
  };
}

function withPersistedStatus(model: PublicModel, statuses: Awaited<ReturnType<typeof hydratePersistedModelStatuses>>): PublicModel {
  const status = statuses.get(model.id.toLowerCase());
  if (!status) {
    return model;
  }

  return {
    ...model,
    status: status.status,
    statusCheckedAt: status.checkedAt?.toISOString(),
    statusLatencyMs: status.latencyMs ?? undefined,
    statusError: status.errorMessage ?? undefined,
    statusSuccesses: status.successCount,
    statusFailures: status.failureCount,
    statusConsecutiveFailures: status.consecutiveFailures,
    statusLastSuccessAt: status.lastSuccessAt?.toISOString(),
    statusLastFailureAt: status.lastFailureAt?.toISOString(),
  };
}

function createOpenProviderAutoFreeModel(models: PublicModel[]): PublicModel {
  const chatModels = models.filter(model => isChatRouteCategory(model.category));
  const maxInputTokens = Math.max(128000, ...chatModels.map(model => model.maxInputTokens));
  const maxOutputTokens = Math.max(4096, ...chatModels.map(model => model.maxOutputTokens));
  const inputModalities = normalizeModalities(chatModels.flatMap(model => model.inputModalities));
  const status = chatModels.some(model => model.status === 'working')
    ? 'working'
    : chatModels.every(model => model.status === 'failing')
      ? 'failing'
      : 'unknown';

  return {
    id: OPENPROVIDER_AUTO_FREE_MODEL_ID,
    modelId: 'auto-free',
    name: OPENPROVIDER_AUTO_FREE_MODEL_NAME,
    description: 'OpenProvider Auto Free routes each request to the best available free chat model across your configured providers using context size, task type, reasoning support, tools support, and live fallback availability.',
    provider: 'openprovider',
    category: 'text',
    inputModalities: inputModalities.includes('image') ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    maxInputTokens,
    maxOutputTokens,
    supportsTools: chatModels.some(model => model.supportsTools),
    supportsReasoning: chatModels.some(model => model.supportsReasoning),
    freeReason: 'automatic free route',
    locked: false,
    lockReason: undefined,
    tags: ['openprovider', 'auto', 'free', 'router', 'chat', 'fallback'],
    priority: 100000,
    status,
  };
}

function withOpenProviderAutoFreeModel(models: PublicModel[]): PublicModel[] {
  return models.some(model => isChatRouteCategory(model.category))
    ? [createOpenProviderAutoFreeModel(models), ...models]
    : models;
}

function countBy(models: PublicModel[], key: keyof Pick<PublicModel, 'category' | 'provider'>): Record<string, number> {
  return models.reduce<Record<string, number>>((counts, model) => {
    const value = model[key];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function fallbackModels(): ProviderModel[] {
  return createDefaultModelRegistry().list().filter(model => model.free);
}

export async function getCatalogSnapshot(options: CatalogSnapshotOptions = false): Promise<CatalogSnapshot> {
  const { force, config, cacheKey } = normalizeCatalogOptions(options);
  const now = Date.now();
  const cached = cacheKey ? catalogCaches.get(cacheKey) : undefined;

  if (!force && cached && cached.expiresAt > now && hasModelDescriptions(cached.snapshot)) {
    return cached.snapshot;
  }

  const ttlMs = clampCatalogTtl(config.modelSyncTtlMs);

  if (!force && cacheKey) {
    const fileCached = readFromFileCache(cacheKey, ttlMs);
    if (fileCached && hasModelDescriptions(fileCached)) {
      const fileSyncedAt = fileCached.syncedAt ? Date.parse(fileCached.syncedAt) : now;
      const fileAge = Math.max(0, now - fileSyncedAt);
      catalogCaches.set(cacheKey, {
        snapshot: fileCached,
        createdAt: now - fileAge,
        expiresAt: now + Math.max(0, ttlMs - fileAge),
      });
      return fileCached;
    }
  }

  if (!force && cacheKey) {
    const inflight = catalogSyncPromises.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const refreshPromise = (async () => {
    try {
      const snapshot = await buildCatalogSnapshot(config);

      if (cacheKey) {
        catalogCaches.set(cacheKey, {
          snapshot,
          createdAt: now,
          expiresAt: now + ttlMs,
        });
        enforceCacheEntryLimit();
        writeToFileCache(cacheKey, snapshot);
      }

      return snapshot;
    } catch (error) {
      const staleAllowed = !force && cached && hasModelDescriptions(cached.snapshot) && now - cached.expiresAt <= CATALOG_STALE_FALLBACK_MS;

      if (staleAllowed) {
        return cached.snapshot;
      }

      throw error;
    } finally {
      if (cacheKey) {
        catalogSyncPromises.delete(cacheKey);
      }
    }
  })();

  if (cacheKey) {
    catalogSyncPromises.set(cacheKey, refreshPromise);
  }

  return refreshPromise;
}

export async function getShowcaseCatalogSnapshot(): Promise<CatalogSnapshot> {
  const uniqueModels = Array.from(new Map(fallbackModels().map(model => [model.id.toLowerCase(), model])).values())
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  const persistedStatuses = await hydratePersistedModelStatuses(uniqueModels.map(model => model.id));
  const providerModels = uniqueModels
    .map(toPublicModel)
    .map(model => withPersistedStatus(model, persistedStatuses));
  const models = withOpenProviderAutoFreeModel(providerModels);

  return {
    models,
    providerResults: [],
    categoryCounts: countBy(models, 'category'),
    providerCounts: countBy(models, 'provider'),
    syncedAt: new Date().toISOString(),
    freeOnly: true,
  };
}

export async function getCatalogSnapshotForUser(
  userId?: string | null,
  force = false
): Promise<CatalogSnapshot> {
  if (!userId) {
    return getCatalogSnapshot(force);
  }

  const userKeys = await loadUserProviderKeyValues(userId);
  const hasCustomKeys = Object.keys(userKeys).length > 0;

  if (!hasCustomKeys) {
    return getCatalogSnapshot(force);
  }

  const config = await applyUserProviderKeysToConfig(loadOpenProviderConfig(), userId);
  return getCatalogSnapshot({
    force,
    config,
    cacheKey: `user:${userId}`,
  });
}

export function invalidateCatalogSnapshot(cacheKey?: string): void {
  if (cacheKey) {
    catalogCaches.delete(cacheKey);
    catalogSyncPromises.delete(cacheKey);
    return;
  }

  catalogCaches.clear();
  catalogSyncPromises.clear();
}

export function findModel(snapshot: CatalogSnapshot, modelId: string): PublicModel | undefined {
  const normalized = modelId.trim().toLowerCase();
  return snapshot.models.find(model => (
    model.id.toLowerCase() === normalized ||
    model.modelId.toLowerCase() === normalized
  ));
}
