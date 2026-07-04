'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Brain,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  Copy,
  Eye,
  Gauge,
  Image as ImageIcon,
  MessageSquareText,
  Server,
  Volume2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UiModel } from './model-explorer';
import { ModelHealthMeter } from './model-health-meter';
import { ProviderMark } from '../providers/provider-mark';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import { providerName } from '@/lib/provider-meta';

type DetailTab = 'overview' | 'providers' | 'api';

const DETAIL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const DETAIL_NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

function categoryLabel(category: UiModel['category']): string {
  switch (category) {
    case 'vision':
      return 'Image analysis';
    case 'audio':
      return 'Speech';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'auto':
      return 'Auto';
  }
}

function endpointFor(category: UiModel['category']): string {
  if (category === 'image') return 'POST /v1/images/generations';
  if (category === 'vision') return 'POST /v1/images/analyze';
  if (category === 'audio') return 'POST /v1/audio/speech';
  return 'POST /v1/chat/completions';
}

function playgroundHref(model: UiModel): string {
  if (model.category === 'vision') {
    return `/vision?model=${encodeURIComponent(model.id)}`;
  }

  if (model.category === 'image') {
    return `/playground?model=${encodeURIComponent(model.id)}`;
  }

  if (model.category === 'audio') {
    return `/speech?model=${encodeURIComponent(model.id)}`;
  }

  return `/playground?model=${encodeURIComponent(model.id)}`;
}

function compactNumber(value: number): string {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return value > 0 ? String(value) : 'Not listed';
}

function statusDescription(model: UiModel): string {
  if (model.status === 'working') {
    return model.statusLatencyMs ? `${model.statusLatencyMs} ms probe` : 'Latest probe passed';
  }

  if (model.status === 'failing') {
    return model.statusError || 'Latest probe failed';
  }

  if (model.statusError) {
    return model.statusError;
  }

  if (model.statusCheckedAt) {
    return 'Latest probe could not confirm this model';
  }

  return 'Waiting for daily status probe';
}

function checkedAtLabel(value?: string): string {
  if (!value) return 'Not checked yet';

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Not checked yet';

  return DETAIL_DATE_TIME_FORMATTER.format(timestamp);
}

function apiExampleFor(model: UiModel): string {
  if (model.category === 'image') {
    return JSON.stringify({
      model: model.id,
      prompt: 'A clean product mockup on a white desk',
    }, null, 2);
  }

  if (model.category === 'vision') {
    return JSON.stringify({
      model: model.id,
      image: 'https://example.com/image.png',
      prompt: 'Describe this image',
    }, null, 2);
  }

  if (model.category === 'audio') {
    return JSON.stringify({
      model: model.id,
      input: 'This audio was generated through OpenProvider.',
      voice: 'alloy',
    }, null, 2);
  }

  return JSON.stringify({
    model: model.id,
    messages: [
      { role: 'user', content: 'Hello' },
    ],
  }, null, 2);
}

function curlSnippetFor(model: UiModel): string {
  const endpoint = model.category === 'image'
    ? '/v1/images/generations'
    : model.category === 'vision'
      ? '/v1/images/analyze'
      : model.category === 'audio'
        ? '/v1/audio/speech'
        : '/v1/chat/completions';

  const body = apiExampleFor(model);

  return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

function modelDescription(model: UiModel): string {
  if (model.description?.trim()) {
    return model.description;
  }

  return `${model.name} is a free ${providerName(model.provider)} ${categoryLabel(model.category).toLowerCase()} model available through OpenProvider.`;
}

function normalizedModelKey(value: string): string {
  return value.trim().toLowerCase();
}

function modelMatchesRoute(model: UiModel, provider: string, modelId: string): boolean {
  const normalizedProvider = normalizedModelKey(provider);
  const normalizedModelId = normalizedModelKey(modelId);
  const normalizedRouteId = `${normalizedProvider}/${normalizedModelId}`;

  return (
    normalizedModelKey(model.provider) === normalizedProvider
    && (
      normalizedModelKey(model.modelId) === normalizedModelId
      || normalizedModelKey(model.id) === normalizedRouteId
      || normalizedModelKey(model.id) === normalizedModelId
    )
  );
}

function mergeUniqueModels(...groups: UiModel[][]): UiModel[] {
  const merged = new Map<string, UiModel>();

  for (const group of groups) {
    for (const model of group) {
      const key = normalizedModelKey(model.id);
      if (!key) {
        continue;
      }

      merged.set(key, model);
    }
  }

  return Array.from(merged.values());
}

function PrimaryModelAction({ model }: { model: UiModel }) {
  if (model.category === 'text') {
    return (
      <Link className="button-link" href={`/chat?model=${encodeURIComponent(model.id)}`}>
        <MessageSquareText size={16} />
        Chat
      </Link>
    );
  }

  if (model.category === 'vision') {
    return (
      <Link className="button-link" href={playgroundHref(model)}>
        <Eye size={16} />
        Analyze Image
      </Link>
    );
  }

  if (model.category === 'audio') {
    return (
      <Link className="button-link" href={playgroundHref(model)}>
        <Volume2 size={16} />
        Speech
      </Link>
    );
  }

  if (model.category === 'image') {
    return (
      <Link className="button-link" href={playgroundHref(model)}>
        <ImageIcon size={16} />
        Generate Image
      </Link>
    );
  }

  return null;
}

function ModelDetailSkeleton() {
  return (
    <section aria-label="Loading model details" className="detail-page detail-skeleton-page">
      <span className="detail-skeleton-back skeleton-shimmer" />
      <div className="detail-hero skeleton-hero">
        <div className="detail-hero-main">
          <div className="detail-title-row">
            <span className="detail-provider-mark skeleton-shimmer" />
            <div>
              <span className="detail-skeleton-kicker skeleton-shimmer" />
              <span className="detail-skeleton-title skeleton-shimmer" />
            </div>
          </div>
          <span className="detail-skeleton-route skeleton-shimmer" />
          <div className="detail-meta">
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-chip skeleton-shimmer" />
          </div>
          <div className="detail-skeleton-copy">
            <span className="skeleton-shimmer" />
            <span className="skeleton-shimmer" />
            <span className="skeleton-shimmer" />
          </div>
        </div>
        <div className="detail-actions">
          <span className="detail-skeleton-button skeleton-shimmer" />
          <span className="detail-skeleton-button skeleton-shimmer" />
        </div>
      </div>
      <div className="detail-metric-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="detail-metric-card skeleton" key={index}>
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-value skeleton-shimmer" />
            <span className="detail-skeleton-small skeleton-shimmer" />
          </div>
        ))}
      </div>
      <div className="detail-tabs skeleton-tabs">
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
      </div>
      <div className="detail-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton" key={index}>
            <span className="detail-skeleton-small skeleton-shimmer" />
            <span className="detail-skeleton-value skeleton-shimmer" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ModelDetail({
  provider,
  modelId,
  initialModel = null,
}: {
  provider: string;
  modelId: string;
  initialModel?: UiModel | null;
}) {
  const [models, setModels] = useState<UiModel[]>(() => initialModel ? [initialModel] : []);
  const [loadingCatalog, setLoadingCatalog] = useState(!initialModel);
  const [saved, setSaved] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, key: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }

  async function copyText(text: string, field: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(current => current === field ? null : current), 1500);
      showToast(`${field} copied`);
    } catch {
      showToast('Failed to copy');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalog(!initialModel);

    async function loadModels() {
      const baseParams = new URLSearchParams({
        facets: 'false',
        providerResults: 'false',
        limit: '200',
        public: 'true',
      });
      const exactParams = new URLSearchParams({
        facets: 'false',
        providerResults: 'false',
        limit: '20',
        public: 'true',
        provider,
        q: modelId,
      });
      withModelApiCacheVersion(baseParams);
      withModelApiCacheVersion(exactParams);

      try {
        const responses = await Promise.allSettled([
          fetch(`/api/models?${baseParams.toString()}`, { cache: 'default', signal: controller.signal }),
          fetch(`/api/models?${exactParams.toString()}`, { cache: 'default', signal: controller.signal }),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const fetchedGroups = await Promise.all(responses.map(async response => {
          if (response.status !== 'fulfilled' || !response.value.ok) {
            return [];
          }

          const payload = await response.value.json();
          return Array.isArray(payload.data) ? payload.data as UiModel[] : [];
        }));

        setModels(mergeUniqueModels(...fetchedGroups, initialModel ? [initialModel] : []));
      } catch {
        if (!controller.signal.aborted) {
          setModels(initialModel ? [initialModel] : []);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCatalog(false);
        }
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [initialModel, modelId, provider]);

  // Check if model is already saved
  const checkSavedStatus = useCallback(async (targetModelId: string) => {
    try {
      const response = await fetch('/api/saved-models', { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      const entries = Array.isArray(result.data) ? result.data : [];
      setSaved(entries.some((entry: { modelId: string }) => entry.modelId === targetModelId));
    } catch {
      /* user may not be signed in */
    }
  }, []);

  useEffect(() => {
    const targetId = models.find(item => modelMatchesRoute(item, provider, modelId))?.id;
    if (targetId) void checkSavedStatus(targetId);
  }, [models, provider, modelId, checkSavedStatus]);

  async function toggleBookmark(model: UiModel) {
    setSavingBookmark(true);
    const wasSaved = saved;
    setSaved(!wasSaved);

    try {
      const response = await fetch('/api/saved-models', {
        method: wasSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      if (!response.ok) {
        setSaved(wasSaved);
        showToast('Sign in to save models');
      } else {
        showToast(wasSaved ? 'Removed from saved' : 'Saved to bookmarks');
      }
    } catch {
      setSaved(wasSaved);
    } finally {
      setSavingBookmark(false);
    }
  }

  const model = useMemo(() => models.find(item => (
    modelMatchesRoute(item, provider, modelId)
  )), [models, provider, modelId]);

  if (!model) {
    if (loadingCatalog) {
      return <ModelDetailSkeleton />;
    }

    return (
      <section className="detail-panel">
        <Link className="row-link" href="/models"><ArrowLeft size={15} /> Back to models</Link>
        <h2>Model not found</h2>
        <p>OpenProvider could not find {provider}/{modelId} in the current free-model catalog.</p>
      </section>
    );
  }

  const isHealthy = model.status === 'working';
  const isFailing = model.status === 'failing';
  const maxOutputLabel = model.maxOutputTokens > 0 ? compactNumber(model.maxOutputTokens) : 'Not listed';

  return (
    <section className="detail-page">
      <Link className="back-link" href="/models"><ArrowLeft size={15} /> Back to models</Link>

      <div className="detail-hero">
        <div className="detail-hero-main">
          <div className="detail-title-row">
            <span className="detail-provider-mark">
              <ProviderMark provider={model.provider} />
            </span>
            <div>
              <span className="eyebrow">{providerName(model.provider)} model route</span>
              <h1>{model.name}</h1>
            </div>
          </div>
          <button
            className="copy-id detail-route-id"
            onClick={() => copyText(model.id, 'Route ID')}
            title="Copy routing name"
            type="button"
          >
            {copiedField === 'Route ID' ? <Check size={15} /> : <Code2 size={15} />}
            {copiedField === 'Route ID' ? 'Copied!' : model.id}
          </button>
          <div className="detail-meta">
            <span>by {providerName(model.provider)}</span>
            <span>{categoryLabel(model.category)}</span>
            <span>{compactNumber(model.maxInputTokens)} context</span>
          </div>
          <p>{modelDescription(model)}</p>
        </div>
        <div className="detail-actions">
          <button
            className="icon-button wide"
            onClick={() => toggleBookmark(model)}
            disabled={savingBookmark}
            type="button"
          >
            {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
          <button
            className="icon-button wide"
            onClick={() => copyText(model.id, 'Model ID')}
            type="button"
          >
            {copiedField === 'Model ID' ? <Check size={16} /> : <Copy size={16} />}
            <span>{copiedField === 'Model ID' ? 'Copied!' : 'Copy ID'}</span>
          </button>
          <PrimaryModelAction model={model} />
        </div>
      </div>

      <div className="detail-metric-grid" aria-label="Model capabilities">
        <div className="detail-metric-card">
          <span><Gauge size={15} /> Context</span>
          <strong>{compactNumber(model.maxInputTokens)}</strong>
          <small>input tokens</small>
        </div>
        <div className="detail-metric-card">
          <span><Code2 size={15} /> Output</span>
          <strong>{maxOutputLabel}</strong>
          <small>max tokens</small>
        </div>
        <div className="detail-metric-card">
          <span><Wrench size={15} /> Tools</span>
          <strong>{model.supportsTools ? 'Ready' : 'No'}</strong>
          <small>{model.supportsTools ? 'tool calls listed' : 'not listed'}</small>
        </div>
        <div className="detail-metric-card">
          <span><Brain size={15} /> Reasoning</span>
          <strong>{model.supportsReasoning ? 'Ready' : 'No'}</strong>
          <small>{model.supportsReasoning ? 'thinking capable' : 'not listed'}</small>
        </div>
      </div>

      <nav aria-label="Model sections" className="detail-tabs" role="tablist">
        {([
          ['overview', 'Overview'],
          ['providers', 'Providers'],
          ['api', 'API'],
        ] as const).map(([tab, label]) => (
          <button
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : undefined}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <div className="detail-grid" id="overview" role="tabpanel">
          <div><span>Category</span><strong>{categoryLabel(model.category)}</strong></div>
          <div><span>Provider</span><strong>{providerName(model.provider)}</strong></div>
          <div><span>Provider model</span><strong>{model.modelId}</strong></div>
          <div>
            <span>Status</span>
            <strong>
              <ModelHealthMeter
                checkedAt={model.statusCheckedAt}
                error={model.statusError}
                latencyMs={model.statusLatencyMs}
                status={model.status}
              />
            </strong>
          </div>
          <div><span>Input</span><strong>{model.inputModalities.join(', ')}</strong></div>
          <div><span>Output</span><strong>{model.outputModalities.join(', ')}</strong></div>
          <div><span>Free reason</span><strong>{model.freeReason}</strong></div>
          <div><span>Last checked</span><strong>{checkedAtLabel(model.statusCheckedAt)}</strong></div>
        </div>
      )}

      {activeTab === 'providers' && (
        <section className="detail-section" id="providers" role="tabpanel">
          <div>
            <h2>Providers for {model.name}</h2>
            <p>OpenProvider routes this model through the configured free provider registry.</p>
          </div>
          <article className="provider-card">
            <div>
              <ProviderMark provider={model.provider} />
              <strong>{providerName(model.provider)}</strong>
              <ModelHealthMeter
                checkedAt={model.statusCheckedAt}
                error={model.statusError}
                latencyMs={model.statusLatencyMs}
                status={model.status}
              />
            </div>
            <dl>
              <div><dt>Route id</dt><dd>{model.id}</dd></div>
              <div><dt>Provider model</dt><dd>{model.modelId}</dd></div>
              <div><dt>Status detail</dt><dd>{statusDescription(model)}</dd></div>
              <div><dt>Total context</dt><dd>{DETAIL_NUMBER_FORMATTER.format(model.maxInputTokens)}</dd></div>
              <div><dt>Max output</dt><dd>{model.maxOutputTokens > 0 ? DETAIL_NUMBER_FORMATTER.format(model.maxOutputTokens) : 'Not listed'}</dd></div>
              <div><dt>Modalities</dt><dd>{model.inputModalities.join(', ')} to {model.outputModalities.join(', ')}</dd></div>
            </dl>
            {isFailing && (
              <p className="detail-warning"><AlertTriangle size={15} /> {model.statusError || 'This model failed the latest status probe.'}</p>
            )}
            {isHealthy && (
              <p className="detail-success"><CheckCircle2 size={15} /> This model passed the latest OpenProvider status probe.</p>
            )}
          </article>
        </section>
      )}

      {activeTab === 'api' && (
        <section className="detail-section" id="api" role="tabpanel">
          <div>
            <h2>API</h2>
            <p>Use this routing name with {endpointFor(model.category)}.</p>
          </div>
          <div className="detail-api-strip">
            <span><Server size={15} /> {endpointFor(model.category)}</span>
            <button
              className="copy-id"
              onClick={() => copyText(model.id, 'Route ID')}
              title="Copy routing name"
              type="button"
            >
              {copiedField === 'Route ID' ? <Check size={15} /> : <Code2 size={15} />}
              {copiedField === 'Route ID' ? 'Copied!' : model.id}
            </button>
          </div>
          <div className="detail-code-wrapper">
            <div className="detail-code-header">
              <span>Request body</span>
              <button
                className="detail-code-copy"
                onClick={() => copyText(apiExampleFor(model), 'JSON body')}
                type="button"
              >
                {copiedField === 'JSON body' ? <Check size={14} /> : <Copy size={14} />}
                {copiedField === 'JSON body' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="code-block"><code>{apiExampleFor(model)}</code></pre>
          </div>
          <div className="detail-code-wrapper">
            <div className="detail-code-header">
              <span>cURL</span>
              <button
                className="detail-code-copy"
                onClick={() => copyText(curlSnippetFor(model), 'cURL')}
                type="button"
              >
                {copiedField === 'cURL' ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {copiedField === 'cURL' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="code-block"><code>{curlSnippetFor(model)}</code></pre>
          </div>
          {model.category === 'text' && (
            <Link className="row-link" href={`/chat?model=${encodeURIComponent(model.id)}`}>
              <Code2 size={15} />
              Test in chat
            </Link>
          )}
          {model.category === 'vision' && (
            <Link className="row-link" href={playgroundHref(model)}>
              <Eye size={15} />
              Test image analysis
            </Link>
          )}
          {model.category === 'audio' && (
            <Link className="row-link" href={playgroundHref(model)}>
              <Volume2 size={15} />
              Test in speech playground
            </Link>
          )}
        </section>
      )}

      {toast && (
        <div className="explorer-toast detail-toast" key={toast.key}>
          <Check size={15} />
          {toast.message}
        </div>
      )}
    </section>
  );
}
