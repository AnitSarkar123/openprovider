'use client';

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  Check,
  CircleDot,
  GitCompareArrows,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { UiModel } from './model-explorer';
import { ModelHealthMeter } from './model-health-meter';
import { ProviderMark } from '../providers/provider-mark';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import { providerName } from '@/lib/provider-meta';

type CompareFilters = {
  capabilityFilters: {
    reasoning: boolean;
    tools: boolean;
  };
  category: UiModel['category'];
  contextFilter: 'all' | '8k' | '32k' | '128k' | '256k';
  inputModalityFilter: 'all' | 'text' | 'image' | 'audio';
  outputFilter: 'all' | '2k' | '4k' | '8k' | '32k';
  outputModalityFilter: 'all' | 'text' | 'image' | 'audio';
  provider: string;
  showSavedOnly: boolean;
  sort: 'newest' | 'name' | 'context' | 'provider';
  statusFilter: 'all' | 'working' | 'failing' | 'unknown';
};

const MAX_COMPARE_MODELS = 4;
const COMPARE_MODEL_LIMIT = 80;

function categoryLabel(category: UiModel['category']): string {
  if (category === 'vision') return 'Image analysis';
  if (category === 'audio') return 'Speech';
  if (category === 'auto') return 'Auto';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function compactNumber(value: number): string {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return value > 0 ? String(value) : 'Not listed';
}

function statusLabel(model: UiModel): string {
  if (model.status === 'working') {
    return model.statusLatencyMs ? `Working, ${model.statusLatencyMs} ms` : 'Working';
  }

  if (model.status === 'failing') {
    return model.statusError || 'Failing';
  }

  if (model.statusError || model.statusCheckedAt) {
    return model.statusError || 'Needs review';
  }

  return 'Untested';
}

function modalValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function modelSearchParams(filters: CompareFilters, query: string): URLSearchParams {
  const params = new URLSearchParams({
    category: filters.category,
    facets: 'false',
    limit: String(COMPARE_MODEL_LIMIT),
    providerResults: 'false',
    sort: filters.sort,
  });
  const search = query.trim();

  if (filters.provider !== 'all') params.set('provider', filters.provider);
  if (search) params.set('q', search);
  if (filters.statusFilter !== 'all') params.set('status', filters.statusFilter);
  if (filters.contextFilter !== 'all') params.set('context', filters.contextFilter);
  if (filters.outputFilter !== 'all') params.set('output', filters.outputFilter);
  if (filters.inputModalityFilter !== 'all') params.set('input_modalities', filters.inputModalityFilter);
  if (filters.outputModalityFilter !== 'all') params.set('output_modalities', filters.outputModalityFilter);
  if (filters.capabilityFilters.reasoning) params.set('reasoning', 'true');
  if (filters.capabilityFilters.tools) params.set('tools', 'true');
  if (filters.showSavedOnly) params.set('saved', 'true');

  return params;
}

function mergeUniqueModels(primary: UiModel[], secondary: UiModel[]): UiModel[] {
  const models = new Map<string, UiModel>();

  for (const model of [...primary, ...secondary]) {
    models.set(model.id, model);
  }

  return Array.from(models.values());
}

export function ModelCompareDialog({
  filters,
  seedModels,
  onClose,
  open,
}: {
  filters: CompareFilters;
  seedModels: UiModel[];
  onClose: () => void;
  open: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [availableModels, setAvailableModels] = useState<UiModel[]>(seedModels);
  const [selectedModels, setSelectedModels] = useState<UiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    setQuery('');
    setAvailableModels(seedModels.slice(0, COMPARE_MODEL_LIMIT));
    setSelectedModels(current => (
      current
        .filter(model => model.category === filters.category)
        .slice(0, MAX_COMPARE_MODELS)
    ));
  }, [filters.category, open, seedModels]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const params = modelSearchParams(filters, deferredQuery);
    params.set('public', 'true');
    withModelApiCacheVersion(params);

    setLoading(true);
    setError(null);

    fetch(`/api/models?${params.toString()}`, {
      cache: 'default',
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error('Unable to load models');
        }

        return response.json() as Promise<{ data?: UiModel[] }>;
      })
      .then(payload => {
        if (requestId !== requestIdRef.current) return;
        setAvailableModels(Array.isArray(payload.data) ? payload.data : []);
      })
      .catch(fetchError => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load models');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredQuery, filters, open]);

  const selectedModelIds = useMemo(() => (
    new Set(selectedModels.map(model => model.id))
  ), [selectedModels]);

  const options = useMemo(() => (
    mergeUniqueModels(selectedModels, availableModels)
  ), [availableModels, selectedModels]);

  function toggleModel(model: UiModel) {
    setSelectedModels(current => {
      if (current.some(item => item.id === model.id)) {
        return current.filter(item => item.id !== model.id);
      }

      if (current.length >= MAX_COMPARE_MODELS) {
        return current;
      }

      return [...current, model];
    });
  }

  if (!open || !mounted) return null;

  const canCompare = selectedModels.length >= 2;
  const atLimit = selectedModels.length >= MAX_COMPARE_MODELS;
  const compareRows: Array<{
    key: string;
    label: string;
    render: (model: UiModel) => ReactNode;
  }> = [
    {
      key: 'provider',
      label: 'Provider',
      render: model => providerName(model.provider),
    },
    {
      key: 'status',
      label: 'Health',
      render: model => (
        <span className="compare-health-value">
          <ModelHealthMeter
            checkedAt={model.statusCheckedAt}
            error={model.statusError}
            latencyMs={model.statusLatencyMs}
            status={model.status}
          />
          {statusLabel(model)}
        </span>
      ),
    },
    {
      key: 'context',
      label: 'Context',
      render: model => `${compactNumber(model.maxInputTokens)} tokens`,
    },
    {
      key: 'output',
      label: 'Output',
      render: model => `${compactNumber(model.maxOutputTokens)} tokens`,
    },
    {
      key: 'input',
      label: 'Input',
      render: model => model.inputModalities.join(', ') || 'text',
    },
    {
      key: 'output_type',
      label: 'Output type',
      render: model => model.outputModalities.join(', ') || categoryLabel(model.category),
    },
    {
      key: 'tools',
      label: 'Tools',
      render: model => modalValue(model.supportsTools),
    },
    {
      key: 'reasoning',
      label: 'Reasoning',
      render: model => modalValue(model.supportsReasoning),
    },
    {
      key: 'free_reason',
      label: 'Free tier',
      render: model => model.freeReason || 'Free model',
    },
    {
      key: 'route',
      label: 'Route ID',
      render: model => <code>{model.id}</code>,
    },
  ];

  return createPortal(
    <div className="auth-modal-backdrop compare-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label="Compare models"
        aria-modal="true"
        className="compare-modal"
        role="dialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="compare-modal-header">
          <div className="compare-title-block">
            <span className="compare-title-icon">
              <GitCompareArrows size={18} />
            </span>
            <div>
              <h2>Compare Models</h2>
              <p>{categoryLabel(filters.category)} models</p>
            </div>
          </div>
          <button
            aria-label="Close compare models"
            className="snippet-modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="compare-modal-body">
          <aside className="compare-picker">
            <label className="search-box compare-search">
              <Search size={17} />
              <input
                autoFocus
                onChange={event => setQuery(event.target.value)}
                placeholder="Search models..."
                value={query}
              />
            </label>

            <div className="compare-selected-strip" aria-label="Selected models">
              {selectedModels.length > 0 ? selectedModels.map(model => (
                <button
                  className="compare-selected-pill"
                  key={model.id}
                  onClick={() => toggleModel(model)}
                  title={`Remove ${model.name}`}
                  type="button"
                >
                  <ProviderMark provider={model.provider} />
                  <span className="compare-selected-name">{model.name}</span>
                  <X size={12} />
                </button>
              )) : (
                <span className="compare-selection-empty">No models selected</span>
              )}
            </div>

            <div className="compare-option-list">
              {loading && Array.from({ length: 5 }).map((_, index) => (
                <div className="compare-option compare-option-skeleton" key={index}>
                  <span className="model-skeleton-mark skeleton-shimmer" />
                  <span className="compare-option-copy">
                    <span className="skeleton-shimmer" />
                    <span className="skeleton-shimmer" />
                  </span>
                </div>
              ))}

              {!loading && error && (
                <div className="compare-empty-panel compact">
                  <CircleDot size={17} />
                  <span>{error}</span>
                </div>
              )}

              {!loading && !error && options.map(model => {
                const selected = selectedModelIds.has(model.id);
                const disabled = !selected && atLimit;

                return (
                  <button
                    className={clsx('compare-option', selected && 'selected')}
                    disabled={disabled}
                    key={model.id}
                    onClick={() => toggleModel(model)}
                    title={disabled ? 'Remove a model before adding another' : model.name}
                    type="button"
                  >
                    <ProviderMark provider={model.provider} />
                    <span className="compare-option-copy">
                      <strong>{model.name}</strong>
                      <small>
                        {providerName(model.provider)} · {compactNumber(model.maxInputTokens)} context · {statusLabel(model)}
                      </small>
                    </span>
                    <span className="compare-option-action">
                      {selected ? <Check size={15} /> : disabled ? <Minus size={15} /> : <Plus size={15} />}
                    </span>
                  </button>
                );
              })}

              {!loading && !error && options.length === 0 && (
                <div className="compare-empty-panel compact">
                  <CircleDot size={17} />
                  <span>No models found</span>
                </div>
              )}
            </div>
          </aside>

          <main className="compare-results">
            <div className="compare-results-head">
              <div>
                <span className="eyebrow">Selection</span>
                <strong>{selectedModels.length}/{MAX_COMPARE_MODELS} models</strong>
              </div>
              <button
                className="button-link secondary compare-clear-button"
                disabled={selectedModels.length === 0}
                onClick={() => setSelectedModels([])}
                type="button"
              >
                Clear
              </button>
            </div>

            {canCompare ? (
              <div className="compare-table-wrap">
                <div
                  className="compare-table"
                  style={{
                    gridTemplateColumns: `140px repeat(${selectedModels.length}, minmax(170px, 1fr))`,
                    minWidth: `${140 + selectedModels.length * 180}px`,
                  }}
                >
                  <div className="compare-table-cell compare-table-corner">Metric</div>
                  {selectedModels.map(model => (
                    <div className="compare-table-cell compare-table-model" key={model.id}>
                      <div>
                        <ProviderMark provider={model.provider} />
                        <strong>{model.name}</strong>
                      </div>
                      <small>{providerName(model.provider)}</small>
                    </div>
                  ))}

                  {compareRows.map(row => (
                    <div className="compare-table-row" key={row.key}>
                      <div className="compare-table-cell compare-table-label">{row.label}</div>
                      {selectedModels.map(model => (
                        <div className="compare-table-cell compare-table-value" key={`${row.key}-${model.id}`}>
                          {row.render(model)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="compare-empty-panel">
                <GitCompareArrows size={22} />
                <strong>Pick at least 2 models to compare</strong>
                <span>Choose from the model list on the left.</span>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>,
    document.body
  );
}
