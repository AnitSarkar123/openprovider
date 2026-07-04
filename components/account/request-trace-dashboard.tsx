'use client';

import { useMemo, useState } from 'react';
import { Activity, AlertCircle, Check, Clock3, Copy, Gauge, Route, Search, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import type { ApiRequestTraceData, ApiRequestTraceEvent } from '@/lib/openprovider/api-usage';
import { providerName } from '@/lib/provider-meta';

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

type RequestTraceDashboardProps = {
  databaseReady: boolean;
  signedIn: boolean;
  trace: ApiRequestTraceData;
};

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatLatency(value: number | null): string {
  return typeof value === 'number' ? `${formatNumber(value)} ms` : 'No data';
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function workflowLabel(workflow: string): string {
  if (workflow === 'chat') return 'Chat';
  if (workflow === 'image') return 'Image';
  if (workflow === 'image_analysis') return 'Image analysis';
  if (workflow === 'speech') return 'Speech';
  if (workflow === 'models') return 'Model catalog';
  if (workflow === 'providers') return 'Provider status';
  return workflow;
}

function tokenUsageLabel(tokenUsage: Record<string, unknown> | null): string {
  if (!tokenUsage) return 'No usage payload';

  const total = tokenUsage.total_tokens ?? tokenUsage.totalTokens;
  const prompt = tokenUsage.prompt_tokens ?? tokenUsage.promptTokens ?? tokenUsage.input_tokens ?? tokenUsage.inputTokens;
  const completion = tokenUsage.completion_tokens ?? tokenUsage.completionTokens ?? tokenUsage.output_tokens ?? tokenUsage.outputTokens;
  const bytes = tokenUsage.bytes;

  if (typeof total === 'number') return `${formatNumber(total)} total tokens`;
  if (typeof prompt === 'number' || typeof completion === 'number') {
    return `${typeof prompt === 'number' ? formatNumber(prompt) : 0} in / ${typeof completion === 'number' ? formatNumber(completion) : 0} out`;
  }
  if (typeof bytes === 'number') return `${formatNumber(bytes)} bytes`;

  return 'Usage payload captured';
}

function routeSummary(event: ApiRequestTraceEvent): string {
  const requested = event.requestedModel ?? 'not specified';
  const routed = event.routedModel ?? 'not routed';
  const provider = event.provider ? providerName(event.provider) : 'no provider';
  return `${requested} -> ${routed} via ${provider}`;
}

function curlForEvent(event: ApiRequestTraceEvent): string {
  const body: Record<string, unknown> = {};
  if (event.requestedModel) {
    body.model = event.requestedModel;
  }

  if (event.workflow === 'chat') {
    body.messages = [{ role: 'user', content: 'Hello from OpenProvider' }];
  } else if (event.workflow === 'image') {
    body.prompt = 'A clean product mockup on a white desk';
  } else if (event.workflow === 'image_analysis') {
    body.image = 'https://example.com/image.png';
    body.prompt = 'Describe this image';
  } else if (event.workflow === 'speech') {
    body.input = 'Hello from OpenProvider.';
    body.voice = 'alloy';
  }

  const lines = [
    `curl -X ${event.method} ${event.endpoint}`,
    event.endpoint.startsWith('/v1/')
      ? '  -H "Authorization: Bearer YOUR_OPENPROVIDER_API_KEY"'
      : '  -H "Cookie: your signed-in browser session"',
  ];

  if (event.method !== 'GET') {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(body, null, 2)}'`);
  }

  return lines.join(' \\\n');
}

export function RequestTraceDashboard({ databaseReady, signedIn, trace }: RequestTraceDashboardProps) {
  const [copiedId, setCopiedId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(trace.events[0]?.id ?? '');

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return trace.events;

    return trace.events.filter(event => [
      event.endpoint,
      event.method,
      event.workflow,
      event.requestedModel,
      event.routedModel,
      event.provider,
      event.keyPrefix,
      event.errorType,
      String(event.statusCode),
    ].filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [query, trace.events]);

  const selectedEvent = visibleEvents.find(event => event.id === selectedId) ?? visibleEvents[0] ?? null;

  async function copyCurl(event: ApiRequestTraceEvent) {
    await navigator.clipboard?.writeText(curlForEvent(event));
    setCopiedId(event.id);
    window.setTimeout(() => setCopiedId(''), 1400);
  }

  return (
    <div className="request-trace-dashboard">
      {!signedIn && (
        <div className="api-key-notice">
          <AlertCircle size={16} />
          Sign in with Google before request traces can be shown.
        </div>
      )}

      {signedIn && !databaseReady && (
        <div className="api-key-notice">
          <AlertCircle size={16} />
          DATABASE_URL is required before request traces can be stored.
        </div>
      )}

      <div className="api-usage-metrics">
        <div className="api-usage-metric primary">
          <Activity size={18} />
          <span>Total requests</span>
          <strong>{formatNumber(trace.totalRequests)}</strong>
        </div>
        <div className="api-usage-metric">
          <Check size={18} />
          <span>Success rate</span>
          <strong>{trace.totalRequests ? `${trace.successRate}%` : 'No data'}</strong>
        </div>
        <div className="api-usage-metric">
          <Clock3 size={18} />
          <span>Avg latency</span>
          <strong>{formatLatency(trace.averageLatencyMs)}</strong>
        </div>
        <div className="api-usage-metric">
          <Gauge size={18} />
          <span>Slowest request</span>
          <strong>{formatLatency(trace.slowestLatencyMs)}</strong>
        </div>
      </div>

      {trace.totalRequests === 0 ? (
        <div className="api-usage-empty">
          <Route size={20} />
          <div>
            <strong>{trace.storageReady ? 'No request traces yet' : 'Request trace storage is not ready yet'}</strong>
            <span>
              {trace.storageReady
                ? 'Use web chat or call a `/v1/*` endpoint and this dashboard will populate automatically.'
                : 'Run the database migration that creates the `api_usage_event` table.'}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="request-trace-toolbar">
            <label>
              <Search size={17} />
              <input
                aria-label="Search request traces"
                onChange={event => setQuery(event.target.value)}
                placeholder="Search endpoint, model, provider, status..."
                type="search"
                value={query}
              />
            </label>
            <span>{formatNumber(visibleEvents.length)} shown</span>
          </div>

          <div className="request-trace-grid">
            <div className="request-trace-list" aria-label="Recent request traces">
              {visibleEvents.length === 0 ? (
                <div className="api-key-empty">
                  <Search size={18} />
                  No request traces match this search.
                </div>
              ) : visibleEvents.map(event => (
                <button
                  className={clsx('request-trace-row', event.id === selectedEvent?.id && 'active')}
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  type="button"
                >
                  <span className={clsx('request-trace-status', event.ok ? 'ok' : 'fail')}>
                    {event.ok ? <Check size={13} /> : <TriangleAlert size={13} />}
                    {event.statusCode}
                  </span>
                  <div>
                    <strong>{event.method} {event.endpoint}</strong>
                    <small>{routeSummary(event)}</small>
                  </div>
                  <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                </button>
              ))}
            </div>

            {selectedEvent && (
              <aside className="request-trace-detail" aria-label="Selected request trace">
                <div className="request-trace-detail-head">
                  <div>
                    <span className="eyebrow">{workflowLabel(selectedEvent.workflow)}</span>
                    <h2>{selectedEvent.method} {selectedEvent.endpoint}</h2>
                  </div>
                  <span className={clsx('request-trace-status', selectedEvent.ok ? 'ok' : 'fail')}>
                    {selectedEvent.statusCode}
                  </span>
                </div>

                <dl className="request-trace-fields">
                  <div>
                    <dt>Requested model</dt>
                    <dd>{selectedEvent.requestedModel ?? 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt>Routed model</dt>
                    <dd>{selectedEvent.routedModel ?? 'No route recorded'}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{selectedEvent.provider ? providerName(selectedEvent.provider) : 'No provider recorded'}</dd>
                  </div>
                  <div>
                    <dt>Latency</dt>
                    <dd>{formatLatency(selectedEvent.latencyMs)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{selectedEvent.keyPrefix}</dd>
                  </div>
                  <div>
                    <dt>Usage</dt>
                    <dd>{tokenUsageLabel(selectedEvent.tokenUsage)}</dd>
                  </div>
                  <div>
                    <dt>Error</dt>
                    <dd>{selectedEvent.errorType ?? 'None'}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{formatDateTime(selectedEvent.createdAt)}</dd>
                  </div>
                </dl>

                <button className="button-link secondary" onClick={() => void copyCurl(selectedEvent)} type="button">
                  {copiedId === selectedEvent.id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedId === selectedEvent.id ? 'Copied cURL' : 'Copy cURL'}
                </button>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
