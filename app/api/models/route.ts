import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCatalogSnapshotForUser, type PublicModel } from '@/lib/openprovider/catalog';
import { modelListCacheHeaders } from '@/lib/http/cache';
import { parseModelCategory, parseModalitySet, parseSupportedParameters } from '@/lib/openprovider/model-filters';
import { listSavedModels } from '@/lib/openprovider/saved-models';
import { getModelStatus } from '@/src/core/modelStatus';
import { modelHasAllModalities, modelSupportsAllParameters } from '@/src/core/modelCategoryUtils';
import { providerName } from '@/lib/provider-meta';
import type { ModelCategory } from '@/src/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ModelStatusFilter = 'all' | 'working' | 'failing' | 'unknown';
type ModelContextFilter = 'all' | '8k' | '32k' | '128k' | '256k';
type ModelOutputFilter = 'all' | '2k' | '4k' | '8k' | '32k';
type ModelModalityFilter = 'all' | 'text' | 'image' | 'audio';
type ModelSort = 'newest' | 'name' | 'context' | 'provider';

type ModelFilters = {
  category: ModelCategory | null;
  provider: string | null;
  search: string;
  status: ModelStatusFilter;
  context: ModelContextFilter;
  output: ModelOutputFilter;
  inputModalities: Set<string> | null;
  outputModalities: Set<string> | null;
  supportedParameters: Set<string> | null;
  reasoning: boolean;
  tools: boolean;
  savedOnly: boolean;
  savedModelIds: Set<string>;
};

type CapabilityCounts = Record<'reasoning' | 'tools', number>;

type ModelsResponsePayload = {
  object: 'list';
  data: PublicModel[];
  categoryCounts: Record<string, number>;
  providerCounts: Record<string, number>;
  facets?: ModelFacets;
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  providerResults?: Array<{
    provider: string;
    ok: boolean;
    skipped: boolean;
    modelCount: number;
    discoveredModelCount: number;
    filteredModelCount: number;
    error?: string;
  }>;
  syncedAt: string;
  freeOnly: boolean;
};

type ModelFacets = {
  categoryCounts: Record<ModelCategory, number>;
  providerCounts: Record<string, number>;
  statusCounts: Record<ModelStatusFilter, number>;
  contextCounts: Record<ModelContextFilter, number>;
  outputCounts: Record<ModelOutputFilter, number>;
  inputModalityCounts: Record<ModelModalityFilter, number>;
  outputModalityCounts: Record<ModelModalityFilter, number>;
  capabilityCounts: CapabilityCounts;
};

const statusFilters = new Set<ModelStatusFilter>(['all', 'working', 'failing', 'unknown']);
const contextFilters = new Set<ModelContextFilter>(['all', '8k', '32k', '128k', '256k']);
const outputFilters = new Set<ModelOutputFilter>(['all', '2k', '4k', '8k', '32k']);
const modalityFilters = new Set<ModelModalityFilter>(['all', 'text', 'image', 'audio']);
const sortOptions = new Set<ModelSort>(['newest', 'name', 'context', 'provider']);
const DEFAULT_MODEL_LIMIT = 100;
const MAX_MODEL_LIMIT = 200;

function withRouteCacheHeader(headers: HeadersInit, value: 'hit' | 'miss' | 'skip'): HeadersInit {
  return {
    ...Object.fromEntries(new Headers(headers)),
    'X-OpenProvider-Cache': value,
  };
}

const contextMinimums: Record<ModelContextFilter, number> = {
  all: 0,
  '8k': 8000,
  '32k': 32000,
  '128k': 128000,
  '256k': 256000,
};

const outputMinimums: Record<ModelOutputFilter, number> = {
  all: 0,
  '2k': 2000,
  '4k': 4000,
  '8k': 8000,
  '32k': 32000,
};

function categoryLabel(category: PublicModel['category']): string {
  return category;
}

function withDescription(model: PublicModel): PublicModel {
  if (model.description?.trim()) {
    return model;
  }

  return {
    ...model,
    description: `${model.name} is a free ${model.provider} ${categoryLabel(model.category)} model available through OpenProvider.`,
  };
}

function withRuntimeStatus(model: PublicModel): PublicModel {
  const status = getModelStatus(model.id);
  const hasRuntimeStatus = Boolean(status.checkedAt) || status.successes > 0 || status.failures > 0 || status.status !== 'unknown';

  if (!hasRuntimeStatus && model.status) {
    return model;
  }

  return {
    ...model,
    status: status.status,
    statusCheckedAt: status.checkedAt,
    statusLatencyMs: status.latencyMs,
    statusError: status.error,
    statusSuccesses: status.successes,
    statusFailures: status.failures,
    statusConsecutiveFailures: status.consecutiveFailures,
    statusLastSuccessAt: status.lastSuccessAt,
    statusLastFailureAt: status.lastFailureAt,
  };
}

function boolParam(value: string | null): boolean {
  return value === 'true' || value === '1';
}

function hasNextAuthSessionCookie(request: NextRequest): boolean {
  const cookieHeader = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)(?:__Secure-)?next-auth\.session-token=/.test(cookieHeader);
}

function parseStatus(value: string | null): ModelStatusFilter {
  return value && statusFilters.has(value as ModelStatusFilter) ? value as ModelStatusFilter : 'all';
}

function parseContext(value: string | null): ModelContextFilter {
  return value && contextFilters.has(value as ModelContextFilter) ? value as ModelContextFilter : 'all';
}

function parseOutput(value: string | null): ModelOutputFilter {
  return value && outputFilters.has(value as ModelOutputFilter) ? value as ModelOutputFilter : 'all';
}

function parseSort(value: string | null): ModelSort {
  return value && sortOptions.has(value as ModelSort) ? value as ModelSort : 'newest';
}

function parseOffset(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_MODEL_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MODEL_LIMIT;
  return Math.min(Math.floor(parsed), MAX_MODEL_LIMIT);
}

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }

  return boolParam(value);
}

function getPublicModelStatus(model: PublicModel): ModelStatusFilter {
  if (model.status === 'working' || model.status === 'failing') {
    return model.status;
  }

  return 'unknown';
}

function matchesSearch(model: PublicModel, search: string): boolean {
  if (!search) return true;

  return [
    model.id,
    model.name,
    model.description,
    model.provider,
    model.category,
    model.freeReason,
    ...model.tags,
  ].join(' ').toLowerCase().includes(search);
}

function sortModels(models: PublicModel[], sort: ModelSort): PublicModel[] {
  const sorted = [...models].sort((a, b) => {
    if (sort === 'newest') return 0;
    if (sort === 'context') return b.maxInputTokens - a.maxInputTokens;
    if (sort === 'provider') return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  return sort === 'newest' ? interleaveByProvider(sorted) : sorted;
}

function interleaveByProvider(models: PublicModel[]): PublicModel[] {
  const groups = new Map<string, PublicModel[]>();

  for (const model of models) {
    groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  }

  const providerOrder = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'openprovider') return -1;
    if (b === 'openprovider') return 1;

    return (
      (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0)
      || providerName(a).localeCompare(providerName(b))
    );
  });

  const balanced: PublicModel[] = [];
  let rowIndex = 0;
  let added = true;

  while (added) {
    added = false;

    for (const provider of providerOrder) {
      const model = groups.get(provider)?.[rowIndex];

      if (model) {
        balanced.push(model);
        added = true;
      }
    }

    rowIndex += 1;
  }

  return balanced;
}

function createEmptyFacets(): ModelFacets {
  return {
    categoryCounts: {
      text: 0,
      image: 0,
      vision: 0,
      audio: 0,
      auto: 0,
    },
    providerCounts: {},
    statusCounts: {
      all: 0,
      working: 0,
      failing: 0,
      unknown: 0,
    },
    contextCounts: {
      all: 0,
      '8k': 0,
      '32k': 0,
      '128k': 0,
      '256k': 0,
    },
    outputCounts: {
      all: 0,
      '2k': 0,
      '4k': 0,
      '8k': 0,
      '32k': 0,
    },
    inputModalityCounts: {
      all: 0,
      text: 0,
      image: 0,
      audio: 0,
    },
    outputModalityCounts: {
      all: 0,
      text: 0,
      image: 0,
      audio: 0,
    },
    capabilityCounts: {
      reasoning: 0,
      tools: 0,
    },
  };
}

function incrementModalityCounts(counts: Record<ModelModalityFilter, number>, modalities: string[]): void {
  counts.all += 1;

  for (const modality of modalities) {
    if (modalityFilters.has(modality as ModelModalityFilter) && modality !== 'all') {
      counts[modality as ModelModalityFilter] += 1;
    }
  }
}

function collectModelsAndFacets(models: PublicModel[], filters: ModelFilters, includeFacets: boolean) {
  const facets = includeFacets ? createEmptyFacets() : null;
  const filteredModels: PublicModel[] = [];

  for (const rawModel of models) {
    const model = withRuntimeStatus(withDescription(rawModel));
    const runtimeStatus = getPublicModelStatus(model);
    const categoryMatches = !filters.category || model.category === filters.category;
    const providerMatches = !filters.provider || model.provider === filters.provider;
    const searchMatches = matchesSearch(model, filters.search);
    const statusMatches = filters.status === 'all' || runtimeStatus === filters.status;
    const contextMatches = model.maxInputTokens >= contextMinimums[filters.context];
    const outputMatches = model.maxOutputTokens >= outputMinimums[filters.output];
    const inputModalityMatches = modelHasAllModalities(model.inputModalities, filters.inputModalities);
    const outputModalityMatches = modelHasAllModalities(model.outputModalities, filters.outputModalities);
    const supportedParametersMatch = modelSupportsAllParameters(model, filters.supportedParameters);
    const capabilitiesMatch = (
      (!filters.reasoning || model.supportsReasoning) &&
      (!filters.tools || model.supportsTools) &&
      supportedParametersMatch
    );
    const savedMatches = !filters.savedOnly || filters.savedModelIds.has(model.id.toLowerCase());
    const matchesAll = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesCategoryFacet = (
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesProviderFacet = (
      categoryMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesStatusFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesContextFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesOutputFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesInputModalityFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      outputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesOutputModalityFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      capabilitiesMatch &&
      savedMatches
    );
    const matchesCapabilityFacet = (
      categoryMatches &&
      providerMatches &&
      searchMatches &&
      statusMatches &&
      contextMatches &&
      outputMatches &&
      inputModalityMatches &&
      outputModalityMatches &&
      savedMatches
    );

    if (matchesAll) {
      filteredModels.push(model);
    }

    if (!facets) {
      continue;
    }

    if (matchesCategoryFacet) {
      facets.categoryCounts[model.category] += 1;
    }

    if (matchesProviderFacet) {
      facets.providerCounts[model.provider] = (facets.providerCounts[model.provider] ?? 0) + 1;
    }

    if (matchesStatusFacet) {
      facets.statusCounts.all += 1;
      facets.statusCounts[runtimeStatus] += 1;
    }

    if (matchesContextFacet) {
      facets.contextCounts.all += 1;
      if (model.maxInputTokens >= contextMinimums['8k']) facets.contextCounts['8k'] += 1;
      if (model.maxInputTokens >= contextMinimums['32k']) facets.contextCounts['32k'] += 1;
      if (model.maxInputTokens >= contextMinimums['128k']) facets.contextCounts['128k'] += 1;
      if (model.maxInputTokens >= contextMinimums['256k']) facets.contextCounts['256k'] += 1;
    }

    if (matchesOutputFacet) {
      facets.outputCounts.all += 1;
      if (model.maxOutputTokens >= outputMinimums['2k']) facets.outputCounts['2k'] += 1;
      if (model.maxOutputTokens >= outputMinimums['4k']) facets.outputCounts['4k'] += 1;
      if (model.maxOutputTokens >= outputMinimums['8k']) facets.outputCounts['8k'] += 1;
      if (model.maxOutputTokens >= outputMinimums['32k']) facets.outputCounts['32k'] += 1;
    }

    if (matchesInputModalityFacet) {
      incrementModalityCounts(facets.inputModalityCounts, model.inputModalities);
    }

    if (matchesOutputModalityFacet) {
      incrementModalityCounts(facets.outputModalityCounts, model.outputModalities);
    }

    if (matchesCapabilityFacet) {
      if (model.supportsReasoning) facets.capabilityCounts.reasoning += 1;
      if (model.supportsTools) facets.capabilityCounts.tools += 1;
    }
  }

  return {
    facets,
    filteredModels,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const refresh = params.get('refresh') === 'true';
  const savedOnly = boolParam(params.get('saved'));
  const includeFacets = parseBooleanParam(params.get('facets'), false);
  const includeProviderResults = parseBooleanParam(params.get('providerResults'), false);
  const hasSessionCookie = hasNextAuthSessionCookie(request);
  const publicCatalog = boolParam(params.get('public')) && !savedOnly && !hasSessionCookie;
  const shouldReadSession = !publicCatalog && (savedOnly || hasSessionCookie);
  const session = shouldReadSession ? await getServerSession(authOptions) : null;
  const userId = publicCatalog ? undefined : session?.user?.id;
  const userSpecific = Boolean(userId) || savedOnly;
  const cacheHeaders = modelListCacheHeaders({ refresh, userSpecific });

  const snapshot = await getCatalogSnapshotForUser(
    userId,
    refresh
  );
  const savedEntries = userId && savedOnly ? await listSavedModels(userId) : [];
  const filters: ModelFilters = {
    category: parseModelCategory(params.get('category')),
    provider: params.get('provider')?.trim() || null,
    search: params.get('q')?.toLowerCase().trim() ?? '',
    status: parseStatus(params.get('status')),
    context: parseContext(params.get('context')),
    output: parseOutput(params.get('output')),
    inputModalities: parseModalitySet(params.get('input_modalities') ?? params.get('inputModality')),
    outputModalities: parseModalitySet(params.get('output_modalities') ?? params.get('outputModality')),
    supportedParameters: parseSupportedParameters(params.get('supported_parameters')),
    reasoning: boolParam(params.get('reasoning')),
    tools: boolParam(params.get('tools')),
    savedOnly,
    savedModelIds: new Set(savedEntries.map(entry => entry.modelId.toLowerCase())),
  };
  const sortParam = params.get('sort');
  const sort = parseSort(sortParam);
  const offset = parseOffset(params.get('offset'));
  const limit = parseLimit(params.get('limit'));
  const { facets, filteredModels } = collectModelsAndFacets(snapshot.models, filters, includeFacets);
  const sortedModels = sortParam ? sortModels(filteredModels, sort) : filteredModels;
  const models = sortedModels.slice(offset, offset + limit);
  const payload: ModelsResponsePayload = {
    object: 'list',
    data: models,
    categoryCounts: snapshot.categoryCounts,
    providerCounts: snapshot.providerCounts,
    facets: facets ?? undefined,
    pagination: {
      total: sortedModels.length,
      offset,
      limit,
      hasMore: offset + limit < sortedModels.length,
    },
    providerResults: includeProviderResults
      ? snapshot.providerResults.map(result => ({
          provider: result.provider,
          ok: result.ok,
          skipped: result.skipped,
          modelCount: result.modelCount,
          discoveredModelCount: result.discoveredModelCount,
          filteredModelCount: result.filteredModelCount,
          error: result.error,
        }))
      : undefined,
    syncedAt: snapshot.syncedAt,
    freeOnly: snapshot.freeOnly,
  };

  return NextResponse.json(payload, {
    headers: withRouteCacheHeader(cacheHeaders, refresh ? 'skip' : 'miss'),
  });
}
