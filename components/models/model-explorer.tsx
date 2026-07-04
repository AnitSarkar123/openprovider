'use client';

import { useRouter } from 'nextjs-toploader/app';
import {
  ArrowDownUp,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ClipboardCopy,
  GitCompareArrows,
  Grid2X2,
  Heart,
  Eye,
  Image as ImageIcon,
  Info,
  LayoutList,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  TextInitial,
  Volume2,
  X,
} from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { providerName } from '@/lib/provider-meta';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import {
  ModelFilterSidebar,
  type ModelContextFilter,
  type ModelModalityFilter,
  type ModelOutputFilter,
  type ModelStatusFilter,
} from './model-filter-sidebar';
import { ModelHealthMeter } from './model-health-meter';
import { ProviderMark } from '../providers/provider-mark';
import { ApiSnippetModal } from './api-snippet-modal';
import { ModelCompareDialog } from './model-compare-dialog';

export type UiModel = {
  id: string;
  modelId: string;
  name: string;
  description: string;
  provider: string;
  category: 'text' | 'image' | 'vision' | 'audio' | 'auto';
  inputModalities: string[];
  outputModalities: string[];
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  freeReason: string;
  locked?: boolean;
  lockReason?: string;
  tags: string[];
  status?: 'unknown' | 'working' | 'failing';
  statusCheckedAt?: string;
  statusLatencyMs?: number;
  statusError?: string;
  statusConsecutiveFailures?: number;
  statusLastSuccessAt?: string;
  statusLastFailureAt?: string;
};

type ModelsPayload = {
  data: UiModel[];
  categoryCounts: Record<string, number>;
  providerCounts: Record<string, number>;
  facets?: {
    categoryCounts: Record<UiModel['category'], number>;
    providerCounts: Record<string, number>;
    statusCounts: Record<ModelStatusFilter, number>;
    contextCounts: Record<ModelContextFilter, number>;
    outputCounts: Record<ModelOutputFilter, number>;
    inputModalityCounts: Record<ModelModalityFilter, number>;
    outputModalityCounts: Record<ModelModalityFilter, number>;
    capabilityCounts: Record<keyof CapabilityFilters, number>;
  };
  pagination?: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  syncedAt: string;
  providerResults?: Array<{
    provider: string;
    ok: boolean;
    skipped: boolean;
    modelCount: number;
    filteredModelCount: number;
    error?: string;
  }>;
};

type CategoryFilter = UiModel['category'];
type CapabilityFilters = {
  reasoning: boolean;
  tools: boolean;
};

type ModelSortMode = 'newest' | 'name' | 'context' | 'provider';
type ModelViewMode = 'list' | 'grid';
type UrlWriteMode = 'push' | 'replace';
type ModelBadgeTone = 'text' | 'vision' | 'image' | 'speech' | 'audio' | 'tools' | 'reasoning';

type ModelBadge = {
  key: string;
  label: string;
  title: string;
  tone: ModelBadgeTone;
};

type ModelUrlFilters = {
  capabilityFilters: CapabilityFilters;
  category: CategoryFilter;
  contextFilter: ModelContextFilter;
  inputModalityFilter: ModelModalityFilter;
  outputFilter: ModelOutputFilter;
  outputModalityFilter: ModelModalityFilter;
  provider: string;
  query: string;
  showSavedOnly: boolean;
  sort: ModelSortMode;
  statusFilter: ModelStatusFilter;
  viewMode: ModelViewMode;
};

type SavedModelEntry = {
  id: string;
  modelId: string;
  provider: string;
  category: string;
  modelName: string;
};

function curlSnippetFor(model: UiModel): string {
  const endpoint = model.category === 'image'
    ? '/v1/images/generations'
    : model.category === 'vision'
      ? '/v1/images/analyze'
      : model.category === 'audio'
        ? '/v1/audio/speech'
        : '/v1/chat/completions';

  if (model.category === 'image') {
    return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "${model.id}",
  "prompt": "A clean product mockup on a white desk"
}'`;
  }

  if (model.category === 'vision') {
    return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "${model.id}",
  "image": "https://example.com/image.png",
  "prompt": "Describe this image"
}'`;
  }

  if (model.category === 'audio') {
    return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "${model.id}",
  "input": "Hello from OpenProvider.",
  "voice": "alloy"
}'`;
  }

  return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "${model.id}",
  "messages": [{"role": "user", "content": "Hello"}]
}'`;
}

const categories: Array<{ id: CategoryFilter; label: string; icon: typeof TextInitial }> = [
  { id: 'text', label: 'Text', icon: TextInitial },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'vision', label: 'Vision', icon: Eye },
  { id: 'audio', label: 'Speech', icon: Volume2 },
];
const MODEL_PAGE_SIZE = 40;
const COMPACT_MODEL_LIMIT = 8;
const VIRTUALIZE_THRESHOLD = 120;
const LIST_ITEM_ESTIMATED_HEIGHT = 170;
const GRID_ITEM_ESTIMATED_HEIGHT = 230;
const GRID_MIN_COLUMN_WIDTH = 300;
const GRID_GAP = 9;
const VIRTUAL_OVERSCAN_ROWS = 3;
const MODEL_AUTO_REFRESH_MS = 60 * 1000;

function normalizeCategory(category: string): CategoryFilter {
  return categories.some(item => item.id === category) ? category as CategoryFilter : 'text';
}

function normalizeModalityFilter(modality: string | null): ModelModalityFilter {
  return modality === 'text' || modality === 'image' || modality === 'audio' ? modality : 'all';
}

function normalizeStatusFilter(status: string | null): ModelStatusFilter {
  return status === 'working' || status === 'failing' || status === 'unknown' ? status : 'all';
}

function normalizeContextFilter(context: string | null): ModelContextFilter {
  return context === '8k' || context === '32k' || context === '128k' || context === '256k' ? context : 'all';
}

function normalizeOutputFilter(output: string | null): ModelOutputFilter {
  return output === '2k' || output === '4k' || output === '8k' || output === '32k' ? output : 'all';
}

function normalizeSort(sort: string | null): ModelSortMode {
  return sort === 'name' || sort === 'context' || sort === 'provider' ? sort : 'newest';
}

function normalizeViewMode(view: string | null): ModelViewMode {
  return view === 'grid' ? 'grid' : 'list';
}

function boolParam(value: string | null): boolean {
  return value === 'true' || value === '1';
}

function filtersFromSearchParams(params: URLSearchParams, defaultCategory: CategoryFilter): ModelUrlFilters {
  const provider = params.get('provider')?.trim() || 'all';
  const query = params.get('q') ?? '';

  return {
    capabilityFilters: {
      reasoning: boolParam(params.get('reasoning')),
      tools: boolParam(params.get('tools')),
    },
    category: normalizeCategory(params.get('category') ?? defaultCategory),
    contextFilter: normalizeContextFilter(params.get('context')),
    inputModalityFilter: normalizeModalityFilter(params.get('input_modalities') ?? params.get('inputModality')),
    outputFilter: normalizeOutputFilter(params.get('output')),
    outputModalityFilter: normalizeModalityFilter(params.get('output_modalities') ?? params.get('outputModality')),
    provider,
    query,
    showSavedOnly: boolParam(params.get('saved')),
    sort: normalizeSort(params.get('sort')),
    statusFilter: normalizeStatusFilter(params.get('status')),
    viewMode: normalizeViewMode(params.get('view')),
  };
}

function searchParamsFromFilters(filters: ModelUrlFilters, defaultCategory: CategoryFilter): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.query.trim();

  if (filters.category !== defaultCategory) params.set('category', filters.category);
  if (filters.provider !== 'all') params.set('provider', filters.provider);
  if (query) params.set('q', query);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.statusFilter !== 'all') params.set('status', filters.statusFilter);
  if (filters.contextFilter !== 'all') params.set('context', filters.contextFilter);
  if (filters.outputFilter !== 'all') params.set('output', filters.outputFilter);
  if (filters.inputModalityFilter !== 'all') params.set('input_modalities', filters.inputModalityFilter);
  if (filters.outputModalityFilter !== 'all') params.set('output_modalities', filters.outputModalityFilter);
  if (filters.capabilityFilters.reasoning) params.set('reasoning', 'true');
  if (filters.capabilityFilters.tools) params.set('tools', 'true');
  if (filters.showSavedOnly) params.set('saved', 'true');
  if (filters.viewMode !== 'list') params.set('view', filters.viewMode);

  return params;
}

function detailHref(model: UiModel): string {
  return `/models/${model.provider}/${encodeURIComponent(model.modelId)}`;
}

function compactNumber(value: number): string {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

function categoryLabel(category: UiModel['category']): string {
  if (category === 'vision') return 'Image analysis';
  if (category === 'audio') return 'Speech';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function modelMetric(model: UiModel): string {
  if (model.maxInputTokens > 0) {
    return `${compactNumber(model.maxInputTokens)} context`;
  }

  return `${categoryLabel(model.category)} model`;
}

function modelSummary(model: UiModel): string {
  if (model.description?.trim()) {
    return model.description;
  }

  const input = model.inputModalities.join(', ') || 'text';
  const output = model.outputModalities.join(', ') || 'text';
  return `${model.name} is a free ${model.provider} ${categoryLabel(model.category).toLowerCase()} model for ${input} to ${output}.`;
}

function modelBadges(model: UiModel): ModelBadge[] {
  const inputModalities = model.inputModalities.map(modality => modality.toLowerCase());
  const outputModalities = model.outputModalities.map(modality => modality.toLowerCase());
  const hasImageInput = inputModalities.includes('image') || model.category === 'vision';
  const hasAudioInput = inputModalities.includes('audio');
  const hasTextOutput = outputModalities.includes('text') || model.category === 'text' || model.category === 'vision';
  const hasImageOutput = outputModalities.includes('image') || model.category === 'image';
  const hasAudioOutput = outputModalities.includes('audio') || model.category === 'audio';
  const badges: ModelBadge[] = [];

  if (model.category === 'vision' || (hasImageInput && hasTextOutput)) {
    badges.push({
      key: 'vision',
      label: 'Vision',
      title: 'Accepts image input and returns text',
      tone: 'vision',
    });
  } else if (hasImageOutput) {
    badges.push({
      key: 'image',
      label: 'Image',
      title: 'Generates image output',
      tone: 'image',
    });
  } else if (hasAudioOutput) {
    badges.push({
      key: 'speech',
      label: 'Speech',
      title: 'Generates audio output',
      tone: 'speech',
    });
  } else if (hasTextOutput || model.category === 'auto') {
    badges.push({
      key: 'text',
      label: 'Text',
      title: 'Text input and output model',
      tone: 'text',
    });
  }

  if (hasAudioInput) {
    badges.push({
      key: 'audio-input',
      label: 'Audio Input',
      title: 'Accepts audio input',
      tone: 'audio',
    });
  }

  if (model.supportsTools) {
    badges.push({
      key: 'tools',
      label: 'Tools',
      title: 'Supports tool or function calling',
      tone: 'tools',
    });
  }

  if (model.supportsReasoning) {
    badges.push({
      key: 'reasoning',
      label: 'Reasoning',
      title: 'Supports reasoning or thinking mode',
      tone: 'reasoning',
    });
  }

  return badges;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('a, button, input, select, textarea'));
}

export function ModelExplorer({
  compact = false,
  initialCategory = 'text',
}: {
  compact?: boolean;
  initialCategory?: string;
}) {
  const router = useRouter();
  const defaultCategory = useMemo(() => normalizeCategory(initialCategory), [initialCategory]);
  const [payload, setPayload] = useState<ModelsPayload | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>(defaultCategory);
  const [provider, setProvider] = useState('all');
  const [sort, setSort] = useState<ModelSortMode>('newest');
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>('all');
  const [contextFilter, setContextFilter] = useState<ModelContextFilter>('all');
  const [outputFilter, setOutputFilter] = useState<ModelOutputFilter>('all');
  const [inputModalityFilter, setInputModalityFilter] = useState<ModelModalityFilter>('all');
  const [outputModalityFilter, setOutputModalityFilter] = useState<ModelModalityFilter>('all');
  const [capabilityFilters, setCapabilityFilters] = useState<CapabilityFilters>({
    reasoning: false,
    tools: false,
  });
  const [viewMode, setViewMode] = useState<ModelViewMode>('list');
  const [loading, setLoading] = useState(true);
  const [savedModels, setSavedModels] = useState<SavedModelEntry[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const [snippetModalModel, setSnippetModalModel] = useState<UiModel | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialFiltersLoaded, setInitialFiltersLoaded] = useState(compact);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const urlWriteModeRef = useRef<UrlWriteMode>('replace');
  const [virtualMetrics, setVirtualMetrics] = useState({
    scrollTop: 0,
    viewportHeight: 0,
    listTop: 0,
    listWidth: 0,
  });
  const deferredQuery = useDeferredValue(query);

  const q = deferredQuery.trim().toLowerCase();
  const savedModelIds = useMemo(() => (
    new Set(savedModels.map(entry => entry.modelId))
  ), [savedModels]);

  const applyUrlFilters = useCallback((filters: ModelUrlFilters) => {
    setCapabilityFilters(filters.capabilityFilters);
    setCategory(filters.category);
    setContextFilter(filters.contextFilter);
    setInputModalityFilter(filters.inputModalityFilter);
    setOutputFilter(filters.outputFilter);
    setOutputModalityFilter(filters.outputModalityFilter);
    setProvider(filters.provider);
    setQuery(filters.query);
    setShowSavedOnly(filters.showSavedOnly);
    setSort(filters.sort);
    setStatusFilter(filters.statusFilter);
    setViewMode(filters.viewMode);
  }, []);

  function markUrlWrite(mode: UrlWriteMode = 'push') {
    if (compact) return;
    urlWriteModeRef.current = mode;
  }

  const load = useCallback(async ({
    append = false,
    offset = 0,
    refresh = false,
    silent = false,
  }: {
    append?: boolean;
    offset?: number;
    refresh?: boolean;
    silent?: boolean;
  } = {}) => {
    const requestId = ++requestIdRef.current;
    const params = new URLSearchParams({
      category,
      limit: String(compact ? COMPACT_MODEL_LIMIT : MODEL_PAGE_SIZE),
      offset: String(offset),
      sort,
    });

    if (provider !== 'all') params.set('provider', provider);
    if (q) params.set('q', q);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (contextFilter !== 'all') params.set('context', contextFilter);
    if (outputFilter !== 'all') params.set('output', outputFilter);
    if (inputModalityFilter !== 'all') params.set('input_modalities', inputModalityFilter);
    if (outputModalityFilter !== 'all') params.set('output_modalities', outputModalityFilter);
    if (capabilityFilters.reasoning) params.set('reasoning', 'true');
    if (capabilityFilters.tools) params.set('tools', 'true');
    if (showSavedOnly) params.set('saved', 'true');
    params.set('facets', compact ? 'false' : 'true');
    params.set('providerResults', 'false');
    if (refresh) params.set('refresh', 'true');
    withModelApiCacheVersion(params);

    if (append) setLoadingMore(true);
    else if (!silent) setLoading(true);

    try {
      const response = await fetch(`/api/models?${params.toString()}`, {
        cache: refresh || showSavedOnly ? 'no-store' : 'default',
      });
      const nextPayload: ModelsPayload = await response.json();
      if (requestId !== requestIdRef.current) return;

      setPayload(current => (
        append && current
          ? { ...nextPayload, data: [...current.data, ...(nextPayload.data ?? [])] }
          : nextPayload
      ));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [
    capabilityFilters.reasoning,
    capabilityFilters.tools,
    category,
    compact,
    contextFilter,
    inputModalityFilter,
    outputFilter,
    outputModalityFilter,
    provider,
    q,
    showSavedOnly,
    sort,
    statusFilter,
  ]);

  const refreshSavedModels = useCallback(async () => {
    try {
      const response = await fetch('/api/saved-models', { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      const entries: SavedModelEntry[] = Array.isArray(result.data) ? result.data : [];
      setSavedModels(entries);
    } catch {
      /* ignore — user may not be signed in */
    }
  }, []);

  useEffect(() => {
    void refreshSavedModels();
  }, [refreshSavedModels]);

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, key: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }

  async function toggleBookmark(event: MouseEvent, model: UiModel) {
    event.stopPropagation();
    const isSaved = savedModelIds.has(model.id);
    setSavingModelId(model.id);

    // optimistic update
    setSavedModels(current => (
      isSaved
        ? current.filter(entry => entry.modelId !== model.id)
        : [{
            id: model.id,
            modelId: model.id,
            provider: model.provider,
            category: model.category,
            modelName: model.name,
          }, ...current]
    ));

    try {
      const response = await fetch('/api/saved-models', {
        method: isSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      if (!response.ok) {
        // revert on failure
        setSavedModels(current => (
          isSaved
            ? [{
                id: model.id,
                modelId: model.id,
                provider: model.provider,
                category: model.category,
                modelName: model.name,
              }, ...current]
            : current.filter(entry => entry.modelId !== model.id)
        ));
        showToast('Sign in to save models');
      } else {
        if (showSavedOnly && isSaved) {
          setPayload(current => current ? {
            ...current,
            data: current.data.filter(item => item.id !== model.id),
            pagination: current.pagination ? {
              ...current.pagination,
              total: Math.max(0, current.pagination.total - 1),
            } : current.pagination,
          } : current);
        }
        showToast(isSaved ? 'Removed from saved' : 'Saved to bookmarks');
      }
    } catch {
      setSavedModels(current => (
        isSaved
          ? [{
              id: model.id,
              modelId: model.id,
              provider: model.provider,
              category: model.category,
              modelName: model.name,
            }, ...current]
          : current.filter(entry => entry.modelId !== model.id)
      ));
    } finally {
      setSavingModelId(null);
    }
  }

  function openSnippetModal(event: MouseEvent, model: UiModel) {
    event.stopPropagation();
    setSnippetModalModel(model);
  }

  useEffect(() => {
    if (compact) {
      setInitialFiltersLoaded(true);
      return;
    }

    if (typeof window === 'undefined') return;

    const syncFromUrl = () => {
      urlWriteModeRef.current = 'replace';
      applyUrlFilters(filtersFromSearchParams(new URLSearchParams(window.location.search), defaultCategory));
      setInitialFiltersLoaded(true);
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);

    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [applyUrlFilters, compact, defaultCategory]);

  useEffect(() => {
    if (compact || !initialFiltersLoaded) return;
    if (typeof window === 'undefined') return;

    const params = searchParamsFromFilters({
      capabilityFilters,
      category,
      contextFilter,
      inputModalityFilter,
      outputFilter,
      outputModalityFilter,
      provider,
      query,
      showSavedOnly,
      sort,
      statusFilter,
      viewMode,
    }, defaultCategory);
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl === currentUrl) return;

    const method = urlWriteModeRef.current === 'push' ? 'pushState' : 'replaceState';
    window.history[method](null, '', nextUrl);
    urlWriteModeRef.current = 'replace';
  }, [
    capabilityFilters,
    category,
    compact,
    contextFilter,
    defaultCategory,
    initialFiltersLoaded,
    inputModalityFilter,
    outputFilter,
    outputModalityFilter,
    provider,
    query,
    showSavedOnly,
    sort,
    statusFilter,
    viewMode,
  ]);

  useEffect(() => {
    if (!initialFiltersLoaded) return;
    void load();
  }, [initialFiltersLoaded, load]);

  useEffect(() => {
    if (!initialFiltersLoaded || compact) return;
    if (payload?.pagination && payload.pagination.offset > 0) return;

    const refreshVisibleModels = () => {
      if (document.visibilityState !== 'visible') return;
      void load({ silent: true });
    };
    const interval = window.setInterval(refreshVisibleModels, MODEL_AUTO_REFRESH_MS);

    window.addEventListener('focus', refreshVisibleModels);
    document.addEventListener('visibilitychange', refreshVisibleModels);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleModels);
      document.removeEventListener('visibilitychange', refreshVisibleModels);
    };
  }, [compact, initialFiltersLoaded, load, payload?.pagination]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileFiltersOpen(false);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileFiltersOpen]);

  const categoryCountsForView = payload?.facets?.categoryCounts ?? {
    text: 0,
    image: 0,
    vision: 0,
    audio: 0,
    auto: 0,
  };
  const providerCountsForView = payload?.facets?.providerCounts ?? payload?.providerCounts ?? {};
  const providers = useMemo(() => (
    Object.keys(providerCountsForView).sort()
  ), [providerCountsForView]);

  const allProviderCount = useMemo(() => (
    Object.values(providerCountsForView).reduce((sum, count) => sum + count, 0)
  ), [providerCountsForView]);

  const statusCountsForView = payload?.facets?.statusCounts ?? {
    all: 0,
    failing: 0,
    unknown: 0,
    working: 0,
  };
  const contextCountsForView = payload?.facets?.contextCounts ?? {
    all: 0,
    '8k': 0,
    '32k': 0,
    '128k': 0,
    '256k': 0,
  };
  const outputCountsForView = payload?.facets?.outputCounts ?? {
    all: 0,
    '2k': 0,
    '4k': 0,
    '8k': 0,
    '32k': 0,
  };
  const inputModalityCountsForView = payload?.facets?.inputModalityCounts ?? {
    all: 0,
    text: 0,
    image: 0,
    audio: 0,
  };
  const outputModalityCountsForView = payload?.facets?.outputModalityCounts ?? {
    all: 0,
    text: 0,
    image: 0,
    audio: 0,
  };
  const capabilityCountsForView = payload?.facets?.capabilityCounts ?? {
    reasoning: 0,
    tools: 0,
  };
  const renderedModels = payload?.data ?? [];
  const totalModelCount = payload?.pagination?.total ?? renderedModels.length;
  const hasMoreModels = Boolean(payload?.pagination?.hasMore);
  const compareFilters = useMemo(() => ({
    capabilityFilters,
    category,
    contextFilter,
    inputModalityFilter,
    outputFilter,
    outputModalityFilter,
    provider,
    showSavedOnly,
    sort,
    statusFilter,
  }), [
    capabilityFilters,
    category,
    contextFilter,
    inputModalityFilter,
    outputFilter,
    outputModalityFilter,
    provider,
    showSavedOnly,
    sort,
    statusFilter,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMetrics = () => {
      const listNode = listRef.current;
      const rect = listNode?.getBoundingClientRect();

      setVirtualMetrics({
        scrollTop: window.scrollY,
        viewportHeight: window.innerHeight,
        listTop: rect ? rect.top + window.scrollY : 0,
        listWidth: rect?.width ?? 0,
      });
    };

    const scheduleUpdate = () => {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateMetrics();
      });
    };

    updateMetrics();

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const listNode = listRef.current;
    const rect = listNode?.getBoundingClientRect();

    setVirtualMetrics(current => ({
      ...current,
      listTop: rect ? rect.top + window.scrollY : current.listTop,
      listWidth: rect?.width ?? current.listWidth,
      viewportHeight: window.innerHeight,
    }));
  }, [viewMode, renderedModels.length, loading]);

  const shouldVirtualize = !compact && !loading && renderedModels.length >= VIRTUALIZE_THRESHOLD;
  const columnCount = useMemo(() => {
    if (viewMode !== 'grid') {
      return 1;
    }

    const width = Math.max(virtualMetrics.listWidth, GRID_MIN_COLUMN_WIDTH);
    return Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN_COLUMN_WIDTH + GRID_GAP)));
  }, [viewMode, virtualMetrics.listWidth]);
  const rowStride = viewMode === 'grid'
    ? GRID_ITEM_ESTIMATED_HEIGHT + GRID_GAP
    : LIST_ITEM_ESTIMATED_HEIGHT + GRID_GAP;

  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize || virtualMetrics.listWidth <= 0 || rowStride <= 0) {
      return null;
    }

    const totalItems = renderedModels.length;
    const totalRows = Math.max(1, Math.ceil(totalItems / columnCount));
    const viewportTop = virtualMetrics.scrollTop - virtualMetrics.listTop;
    const viewportBottom = viewportTop + virtualMetrics.viewportHeight;
    const startRow = Math.max(0, Math.floor(viewportTop / rowStride) - VIRTUAL_OVERSCAN_ROWS);
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil(viewportBottom / rowStride) + VIRTUAL_OVERSCAN_ROWS
    );
    const startIndex = startRow * columnCount;
    const endIndex = Math.min(totalItems, (endRow + 1) * columnCount);

    return {
      startIndex,
      endIndex,
      paddingTop: startRow * rowStride,
      paddingBottom: Math.max(0, totalRows * rowStride - (endRow + 1) * rowStride),
    };
  }, [
    shouldVirtualize,
    virtualMetrics.listWidth,
    virtualMetrics.scrollTop,
    virtualMetrics.listTop,
    virtualMetrics.viewportHeight,
    rowStride,
    renderedModels.length,
    columnCount,
  ]);

  const visibleModels = useMemo(() => {
    if (!virtualWindow) {
      return renderedModels;
    }

    return renderedModels.slice(virtualWindow.startIndex, virtualWindow.endIndex);
  }, [renderedModels, virtualWindow]);

  useEffect(() => {
    if (compact || loading || loadingMore || !hasMoreModels) return;
    const node = loadMoreRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      void load({ append: true, offset: renderedModels.length });
    }, { rootMargin: '720px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [compact, hasMoreModels, load, loading, loadingMore, renderedModels.length]);

  const savedCount = useMemo(() => (
    savedModels.filter(entry => entry.category === category).length
  ), [category, savedModels]);

  function toggleCapabilityFilter(filter: keyof CapabilityFilters) {
    markUrlWrite();
    setCapabilityFilters(current => ({
      ...current,
      [filter]: !current[filter],
    }));
  }

  function openModel(model: UiModel) {
    router.push(detailHref(model));
  }

  function handleCardClick(event: MouseEvent<HTMLElement>, model: UiModel) {
    if (isInteractiveTarget(event.target)) return;
    openModel(model);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, model: UiModel) {
    if (isInteractiveTarget(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    openModel(model);
  }

  function resetFilters() {
    markUrlWrite();
    setProvider('all');
    setStatusFilter('all');
    setContextFilter('all');
    setOutputFilter('all');
    setInputModalityFilter('all');
    setOutputModalityFilter('all');
    setCapabilityFilters({ reasoning: false, tools: false });
  }

  function renderFilters() {
    return (
      <ModelFilterSidebar
        allProviderCount={allProviderCount}
        capabilityCounts={capabilityCountsForView}
        capabilityFilters={capabilityFilters}
        contextCounts={contextCountsForView}
        contextFilter={contextFilter}
        inputModalityCounts={inputModalityCountsForView}
        inputModalityFilter={inputModalityFilter}
        outputModalityCounts={outputModalityCountsForView}
        outputModalityFilter={outputModalityFilter}
        onProviderChange={(nextProvider) => {
          markUrlWrite();
          setProvider(nextProvider);
        }}
        onCapabilityToggle={toggleCapabilityFilter}
        onContextFilterChange={(nextFilter) => {
          markUrlWrite();
          setContextFilter(nextFilter);
        }}
        onInputModalityFilterChange={(nextFilter) => {
          markUrlWrite();
          setInputModalityFilter(nextFilter);
        }}
        onOutputModalityFilterChange={(nextFilter) => {
          markUrlWrite();
          setOutputModalityFilter(nextFilter);
        }}
        onOutputFilterChange={(nextFilter) => {
          markUrlWrite();
          setOutputFilter(nextFilter);
        }}
        onStatusFilterChange={(nextFilter) => {
          markUrlWrite();
          setStatusFilter(nextFilter);
        }}
        onReset={resetFilters}
        outputCounts={outputCountsForView}
        outputFilter={outputFilter}
        provider={provider}
        providerCounts={providerCountsForView}
        providers={providers}
        statusCounts={statusCountsForView}
        statusFilter={statusFilter}
      />
    );
  }

  function renderModelCard(model: UiModel) {
    const badges = modelBadges(model);
    const locked = model.locked === true;

    return (
      <article
        aria-label={`Open ${model.name}`}
        aria-disabled={locked}
        className={clsx('model-row', locked && 'locked')}
        key={model.id}
        onClick={locked ? undefined : event => handleCardClick(event, model)}
        onKeyDown={locked ? undefined : event => handleCardKeyDown(event, model)}
        role="link"
        tabIndex={locked ? -1 : 0}
      >
        <div className="model-row-body">
          <div className="model-row-head">
            <div className="model-title-line">
              <ProviderMark provider={model.provider} />
              <h3><span>{providerName(model.provider)}:</span> {model.name}</h3>
            </div>
            <span className="model-card-metric">
              {modelMetric(model)}
              <Info size={14} />
            </span>
          </div>
          <p>{modelSummary(model)}</p>
          <div className="model-bottom-row">
            <div className="model-meta">
              <span className="model-meta-provider">by {providerName(model.provider)}</span>
              <ModelHealthMeter
                checkedAt={model.statusCheckedAt}
                error={model.statusError}
                latencyMs={model.statusLatencyMs}
                status={model.status}
              />
              {badges.length > 0 && (
                <span className="model-meta-badges" aria-label={`${model.name} capabilities`}>
                  {badges.map(badge => (
                    <span
                      className={clsx('model-badge', `model-badge--${badge.tone}`)}
                      key={badge.key}
                      title={badge.title}
                    >
                      {badge.label}
                    </span>
                  ))}
                </span>
              )}
              <span>{compactNumber(model.maxInputTokens)} context</span>
              {model.maxOutputTokens > 0 && <span>{compactNumber(model.maxOutputTokens)} output</span>}
              <span>{model.freeReason}</span>
            </div>
            <div className="model-card-actions">
              <button
                className={clsx('model-action-btn bookmark-btn', savedModelIds.has(model.id) && 'bookmarked')}
                onClick={(event) => toggleBookmark(event, model)}
                title={savedModelIds.has(model.id) ? 'Remove from saved' : 'Save model'}
                type="button"
                disabled={savingModelId === model.id}
              >
                {savedModelIds.has(model.id)
                  ? <BookmarkCheck size={14} />
                  : <Bookmark size={14} />
                }
              </button>
              <button
                className="model-action-btn copy-curl-btn"
                onClick={(event) => openSnippetModal(event, model)}
                title="API Snippets & Integration"
                type="button"
              >
                <Settings2 size={14} />
              </button>
            </div>
          </div>
        </div>
        {locked && (
          <span
            aria-label={model.lockReason ?? 'Model locked'}
            className="model-lock-overlay"
            title={model.lockReason ?? 'Model locked'}
          >
            <LockKeyhole size={28} strokeWidth={1.9} />
          </span>
        )}
      </article>
    );
  }

  return (
    <section className={clsx('models-layout', compact && 'compact-models')}>
      {!compact && renderFilters()}

      <div className="models-main">
        <div className="models-heading">
          <h1>{compact ? 'Free chat models' : 'Models'}</h1>

          <div className="models-toolbar">
            <label className="search-box models-search">
              <Search size={18} />
              <input
                onChange={event => {
                  markUrlWrite('replace');
                  setQuery(event.target.value);
                }}
                placeholder="Search models..."
                value={query}
              />
            </label>
            <button
              className="button-link secondary toolbar-filter-button compare-toolbar-button"
              onClick={() => setCompareDialogOpen(true)}
              type="button"
            >
              <GitCompareArrows size={16} />
              Compare
            </button>
            <button
              className={clsx('button-link secondary toolbar-filter-button', showSavedOnly && 'active')}
              onClick={() => {
                markUrlWrite();
                setShowSavedOnly(current => !current);
              }}
              title={showSavedOnly ? 'Show all models' : 'Show saved models only'}
              type="button"
            >
              {showSavedOnly ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              Saved
              <small>{savedCount}</small>
            </button>
            <button
              className={clsx('button-link secondary toolbar-filter-button', statusFilter === 'working' && 'active')}
              onClick={() => {
                markUrlWrite();
                setStatusFilter(current => current === 'working' ? 'all' : 'working');
              }}
              type="button"
            >
              <CheckCircle2 size={16} />
              Working
              <small>{statusCountsForView.working}</small>
            </button>
            <label className="select-shell">
              <ArrowDownUp size={16} />
              <select
                className="select-control"
                onChange={event => {
                  markUrlWrite();
                  setSort(normalizeSort(event.target.value));
                }}
                value={sort}
              >
                <option value="newest">Newest</option>
                <option value="name">Name</option>
                <option value="context">Context</option>
                <option value="provider">Provider</option>
              </select>
            </label>
            <div className="models-view-tools">
              <div className="view-switch" aria-label="Model view">
                <button
                  className={clsx(viewMode === 'grid' && 'active')}
                  onClick={() => {
                    markUrlWrite();
                    setViewMode('grid');
                  }}
                  title="Grid view"
                  type="button"
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  className={clsx(viewMode === 'list' && 'active')}
                  onClick={() => {
                    markUrlWrite();
                    setViewMode('list');
                  }}
                  title="List view"
                  type="button"
                >
                  <LayoutList size={18} />
                </button>
              </div>
              <button className="icon-button refresh-button" onClick={() => load({ refresh: true })} title="Refresh models" type="button">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="model-tabs">
          {categories.map(item => {
            const Icon = item.icon;
            const count = categoryCountsForView[item.id as keyof typeof categoryCountsForView] ?? 0;

            return (
              <button
                className={clsx(category === item.id && 'active')}
                key={item.id}
                onClick={() => {
                  markUrlWrite();
                  setCategory(item.id);
                }}
                type="button"
              >
                <Icon size={17} />
                <span>{item.label}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>

        <div className={clsx('model-list', viewMode === 'grid' && 'grid-view')} ref={listRef}>
          {loading ? Array.from({ length: compact ? 4 : 8 }).map((_, index) => (
            <article aria-hidden="true" className="model-row skeleton" key={index}>
              <div className="model-row-body">
                <div className="model-row-head">
                  <div className="model-title-line">
                    <span className="model-skeleton-mark skeleton-shimmer" />
                    <span className="model-skeleton-line title skeleton-shimmer" />
                    <span className="model-skeleton-badge skeleton-shimmer" />
                  </div>
                  <span className="model-skeleton-line metric skeleton-shimmer" />
                </div>
                <div className="model-skeleton-copy">
                  <span className="skeleton-shimmer" />
                  <span className="skeleton-shimmer" />
                </div>
                <div className="model-skeleton-meta">
                  <span className="skeleton-shimmer" />
                  <span className="skeleton-shimmer" />
                  <span className="skeleton-shimmer" />
                  <span className="skeleton-shimmer" />
                </div>
              </div>
            </article>
          )) : (
            <>
              {virtualWindow && (
                <div
                  aria-hidden="true"
                  className="model-virtual-spacer"
                  style={{ height: `${virtualWindow.paddingTop}px` }}
                />
              )}
              {visibleModels.map(renderModelCard)}
              {virtualWindow && (
                <div
                  aria-hidden="true"
                  className="model-virtual-spacer"
                  style={{ height: `${virtualWindow.paddingBottom}px` }}
                />
              )}
            </>
          )}
        </div>

        {!loading && hasMoreModels && (
          <div className="model-pagination" ref={loadMoreRef}>
            <span>Showing {renderedModels.length} of {totalModelCount} models</span>
            <button
              className="button-link secondary"
              disabled={loadingMore}
              onClick={() => load({ append: true, offset: renderedModels.length })}
              type="button"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}

        {!loading && renderedModels.length === 0 && (
          <div className="empty-state">
            <strong>No matching models</strong>
            <span>Try another category, provider, or search term.</span>
          </div>
        )}

      </div>

      {!compact && (
        <>
          <button
            className="mobile-filter-fab"
            onClick={() => setMobileFiltersOpen(true)}
            type="button"
          >
            <SlidersHorizontal size={18} />
            Filter
          </button>

          {mobileFiltersOpen && (
            <div className="mobile-filter-drawer open">
              <button
                aria-label="Close model filters"
                className="mobile-filter-backdrop"
                onClick={() => setMobileFiltersOpen(false)}
                type="button"
              />
              <aside
                aria-label="Model filters"
                aria-modal="true"
                className="mobile-filter-sheet"
                role="dialog"
              >
                <div className="mobile-filter-head">
                  <div>
                    <span className="eyebrow">Filters</span>
                    <strong>Refine models</strong>
                  </div>
                  <button
                    aria-label="Close model filters"
                    className="icon-button"
                    onClick={() => setMobileFiltersOpen(false)}
                    type="button"
                  >
                    <X size={17} />
                  </button>
                </div>
                {renderFilters()}
              </aside>
            </div>
          )}
        </>
      )}

      <ApiSnippetModal
        model={snippetModalModel}
        onClose={() => setSnippetModalModel(null)}
        open={snippetModalModel !== null}
      />

      <ModelCompareDialog
        filters={compareFilters}
        onClose={() => setCompareDialogOpen(false)}
        open={compareDialogOpen}
        seedModels={renderedModels}
      />

      {toast && (
        <div className="explorer-toast" key={toast.key}>
          <Check size={15} />
          {toast.message}
        </div>
      )}
    </section>
  );
}
