'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  Layers3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { ApiUsageBreakdown, ApiUsageSummary } from '@/lib/openprovider/api-usage';

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type ApiKeysPanelProps = {
  databaseReady: boolean;
  initialKeys: ApiKeyRow[];
  signedIn: boolean;
  usage: ApiUsageSummary;
};

type CreateKeyResponse = {
  key?: ApiKeyRow;
  secret?: string;
  error?: {
    message?: string;
  };
};

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return DATE_FORMATTER.format(new Date(value));
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatLatency(value: number | null): string {
  return typeof value === 'number' ? `${formatNumber(value)} ms` : 'No data';
}

function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function UsageBarList({ rows, title }: { rows: ApiUsageBreakdown[]; title: string }) {
  return (
    <div className="api-usage-list">
      <div className="api-usage-list-head">
        <strong>{title}</strong>
        <span>Requests</span>
      </div>
      {rows.length === 0 ? (
        <p>No usage yet.</p>
      ) : rows.slice(0, 5).map(row => (
        <div className="api-usage-bar-row" key={row.id}>
          <div>
            <span>{row.label}</span>
            <small>{formatNumber(row.requests)} calls · {row.successRate}% success</small>
          </div>
          <strong>{formatNumber(row.requests)}</strong>
          <i aria-hidden="true">
            <b style={{ width: `${Math.max(row.share, 6)}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
}

export function ApiKeysPanel({ databaseReady, initialKeys, signedIn, usage }: ApiKeysPanelProps) {
  const [copied, setCopied] = useState(false);
  const [createdSecret, setCreatedSecret] = useState('');
  const [error, setError] = useState('');
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState('Default key');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const visibleKeys = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return keys.filter(key => !normalized || [key.name, key.keyPrefix].join(' ').toLowerCase().includes(normalized));
  }, [keys, query]);

  async function createKey() {
    setError('');
    setCreatedSecret('');
    setSaving(true);

    try {
      const response = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json() as CreateKeyResponse;
      if (!response.ok || !result.key || !result.secret) {
        throw new Error(result.error?.message ?? 'Unable to create API key.');
      }

      setKeys(current => [result.key!, ...current]);
      setCreatedSecret(result.secret);
      setName('Default key');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create API key.');
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;
    await navigator.clipboard?.writeText(createdSecret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function deleteKey(id: string) {
    setError('');

    try {
      const response = await fetch(`/api/account/api-keys?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(result.error?.message ?? 'Unable to delete API key.');
      }

      setKeys(current => current.filter(key => key.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete API key.');
    }
  }

  return (
    <div className="api-key-panel">
      <div className="api-key-create">
        <label>
          <span>Key name</span>
          <input
            disabled={!signedIn || !databaseReady}
            onChange={event => setName(event.target.value)}
            placeholder="Production app"
            value={name}
          />
        </label>
        <button
          className="button-link provider-save-key"
          disabled={!signedIn || !databaseReady || saving}
          onClick={() => void createKey()}
          type="button"
        >
          <Plus size={15} />
          {saving ? 'Creating...' : 'Create key'}
        </button>
      </div>

      {!signedIn && (
        <div className="api-key-notice">
          <AlertCircle size={16} />
          Sign in with Google before creating OpenProvider API keys.
        </div>
      )}

      {signedIn && !databaseReady && (
        <div className="api-key-notice">
          <AlertCircle size={16} />
          DATABASE_URL is required before API keys can be stored.
        </div>
      )}

      {createdSecret && (
        <div className="api-key-once">
          <div>
            <strong>Copy this key now</strong>
            <span>It will not be shown again.</span>
          </div>
          <code>{createdSecret}</code>
          <button className="button-link secondary" onClick={() => void copySecret()} type="button">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {error && <p className="provider-key-message error">{error}</p>}

      <section className="api-usage-dashboard" aria-label="API key usage analytics">
        <div className="api-usage-dashboard-head">
          <div>
            <span className="eyebrow">Usage analytics</span>
            <h2>API key usage</h2>
            <p>Track which workflows, models, and providers your OpenProvider keys are using.</p>
          </div>
          <span>{usage.storageReady ? 'Last 30 days' : 'Migration required'}</span>
        </div>

        <div className="api-usage-metrics">
          <div className="api-usage-metric primary">
            <Activity size={18} />
            <span>Total requests</span>
            <strong>{formatNumber(usage.totalRequests)}</strong>
          </div>
          <div className="api-usage-metric">
            <CheckCircle2 size={18} />
            <span>Success rate</span>
            <strong>{usage.totalRequests ? `${usage.successRate}%` : 'No data'}</strong>
          </div>
          <div className="api-usage-metric">
            <Clock3 size={18} />
            <span>Avg latency</span>
            <strong>{formatLatency(usage.averageLatencyMs)}</strong>
          </div>
          <div className="api-usage-metric">
            <Layers3 size={18} />
            <span>Top model</span>
            <strong>{usage.byModel[0]?.label ?? 'No traffic yet'}</strong>
          </div>
        </div>

        {usage.totalRequests === 0 ? (
          <div className="api-usage-empty">
            <BarChart3 size={20} />
            <div>
              <strong>{usage.storageReady ? 'No API usage recorded yet' : 'Usage storage is not ready yet'}</strong>
              <span>
                {usage.storageReady
                  ? 'Call a `/v1/*` endpoint with an OpenProvider key and this graph will populate automatically.'
                  : 'Run the database migration to create the `api_usage_event` table. Existing API keys still work.'}
              </span>
            </div>
          </div>
        ) : (
          <div className="api-usage-grid">
            <UsageBarList rows={usage.byModel} title="Most used models" />
            <UsageBarList rows={usage.byWorkflow} title="Workflow mix" />
            <UsageBarList rows={usage.byProvider} title="Provider mix" />
            <div className="api-usage-recent">
              <div className="api-usage-list-head">
                <strong>Recent requests</strong>
                <span>Status</span>
              </div>
              {usage.recent.map(event => (
                <div className="api-usage-event" key={event.id}>
                  <div>
                    <strong>{event.endpoint}</strong>
                    <span>{event.model ?? event.workflow} · {event.provider ?? event.keyPrefix}</span>
                  </div>
                  <small>{formatDateTime(event.createdAt)}</small>
                  <b className={event.ok ? 'ok' : 'fail'}>
                    {event.statusCode}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="api-key-table">
        <div className="api-key-toolbar">
          <label>
            <Search size={17} />
            <input
              aria-label="Search API keys"
              onChange={event => setQuery(event.target.value)}
              placeholder="Search API keys..."
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="api-key-row api-key-row-head">
          <span>Name</span>
          <span>Key</span>
          <span>Created</span>
          <span>Last used</span>
          <span>Status</span>
          <span>Action</span>
        </div>

        {visibleKeys.length === 0 ? (
          <div className="api-key-empty">
            <KeyRound size={18} />
            No OpenProvider API keys yet.
          </div>
        ) : visibleKeys.map(key => {
          const revoked = Boolean(key.revokedAt);

          return (
            <div className="api-key-row" key={key.id}>
              <strong>{key.name}</strong>
              <code>{key.keyPrefix}</code>
              <span>{formatDate(key.createdAt)}</span>
              <span>{formatDate(key.lastUsedAt)}</span>
              <span className={revoked ? 'api-key-status revoked' : 'api-key-status active'}>
                {revoked ? 'Revoked' : 'Active'}
              </span>
              <button
                className="button-link secondary danger"
                onClick={() => void deleteKey(key.id)}
                type="button"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
