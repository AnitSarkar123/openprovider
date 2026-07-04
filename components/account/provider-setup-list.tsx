'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'nextjs-toploader/app';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Download,
  KeyRound,
  Save,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ProviderId } from '@/src/core/types';
import { ProviderMark } from '@/components/providers/provider-mark';
import { ProviderSetupActions } from './provider-setup-actions';

export type ProviderSetupListItem = {
  id: ProviderId;
  name: string;
  description: string;
  getKeyUrl: string;
  docsUrl: string;
  requiredEnv: string[];
  optionalEnv: string[];
  aliases?: string[];
  capabilities: string[];
  note: string;
  configured: boolean;
  missingReason?: string;
  modelCount: number;
  discoveryError?: string;
  discoveryOk?: boolean;
  discoverySkipped?: boolean;
  discoveredModelCount?: number;
  filteredModelCount?: number;
  savedKeyNames?: string[];
  storage?: 'database' | 'missing';
};

type StatusFilter = 'all' | 'configured' | 'missing';
type SortMode = 'configured' | 'models' | 'name';

type ProviderSetupListProps = {
  providers: ProviderSetupListItem[];
};

type IgnoredEnvName = {
  name: string;
  suggestion?: string;
};

type BulkSaveResponse = {
  ok?: boolean;
  savedProviders?: Array<{
    name: string;
    updated: string[];
  }>;
  ignored?: Array<string | IgnoredEnvName>;
  error?: {
    message?: string;
    ignored?: Array<string | IgnoredEnvName>;
  };
};

function normalizeIgnoredEnvNames(ignored: Array<string | IgnoredEnvName> | undefined): IgnoredEnvName[] {
  return (ignored ?? []).map(item => typeof item === 'string' ? { name: item } : item);
}

function formatIgnoredEnvHints(ignored: Array<string | IgnoredEnvName> | undefined): string {
  const normalized = normalizeIgnoredEnvNames(ignored);
  if (normalized.length === 0) {
    return '';
  }

  return normalized.map(item => (
    item.suggestion
      ? `Error name: ${item.name}\nHint: enter ${item.suggestion}=...`
      : `Error name: ${item.name}\nHint: enter a supported provider credential name from this page.`
  )).join('\n\n');
}

export function ProviderSetupList({ providers }: ProviderSetupListProps) {
  const router = useRouter();
  const [bulkError, setBulkError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkWarning, setBulkWarning] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('configured');
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!bulkOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [bulkOpen]);

  useEffect(() => {
    function closeBulkEditor(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBulkOpen(false);
      }
    }

    document.addEventListener('keydown', closeBulkEditor);

    return () => document.removeEventListener('keydown', closeBulkEditor);
  }, []);

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return providers
      .filter(provider => {
        if (statusFilter === 'configured' && !provider.configured) {
          return false;
        }

        if (statusFilter === 'missing' && provider.configured) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return [
          provider.id,
          provider.name,
          provider.description,
          provider.note,
          provider.missingReason ?? '',
          ...provider.requiredEnv,
          ...provider.optionalEnv,
          ...(provider.aliases ?? []),
          ...provider.capabilities,
        ].join(' ').toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sortMode === 'models') {
          return right.modelCount - left.modelCount || left.name.localeCompare(right.name);
        }

        if (sortMode === 'name') {
          return left.name.localeCompare(right.name);
        }

        return Number(right.configured) - Number(left.configured) || right.modelCount - left.modelCount;
      });
  }, [providers, query, sortMode, statusFilter]);

  async function saveBulkKeys() {
    setBulkError('');
    setBulkSuccess('');
    setBulkWarning('');
    setBulkSaving(true);

    try {
      const response = await fetch('/api/provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkText }),
      });
      const result = await response.json() as BulkSaveResponse;

      if (!response.ok || !result.ok) {
        const ignoredHints = formatIgnoredEnvHints(result.error?.ignored ?? result.ignored);
        setBulkError([
          result.error?.message ?? 'Unable to save provider keys.',
          ignoredHints,
        ].filter(Boolean).join('\n\n'));
        return;
      }

      const savedCount = result.savedProviders?.length ?? 0;
      const updatedCount = result.savedProviders?.reduce((total, provider) => total + provider.updated.length, 0) ?? 0;
      const ignoredHints = formatIgnoredEnvHints(result.ignored);
      setBulkText('');
      setBulkSuccess(
        `Saved ${updatedCount} value${updatedCount === 1 ? '' : 's'} across ${savedCount} provider${savedCount === 1 ? '' : 's'}.`
      );
      setBulkWarning(ignoredHints ? `Ignored unrecognized credential names.\n\n${ignoredHints}` : '');
      router.refresh();
    } catch (saveError) {
      setBulkError(saveError instanceof Error ? saveError.message : 'Unable to save provider keys.');
    } finally {
      setBulkSaving(false);
    }
  }

  async function downloadEnvFile() {
    setExportError('');
    setExporting(true);

    try {
      const response = await fetch('/api/provider-keys/export', { cache: 'no-store' });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(result?.error?.message ?? 'Unable to download provider keys.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'openprovider-provider-keys.env';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setExportError(downloadError instanceof Error ? downloadError.message : 'Unable to download provider keys.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="provider-env-panel">
      <div className="provider-env-toolbar">
        <label className="provider-env-search">
          <Search size={18} />
          <input
            aria-label="Search providers"
            onChange={event => setQuery(event.target.value)}
            placeholder="Search providers or credential names..."
            type="search"
            value={query}
          />
        </label>

        <label className="provider-env-select">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter provider status"
            onChange={event => setStatusFilter(event.target.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="all">All statuses</option>
            <option value="configured">Configured</option>
            <option value="missing">Missing</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <button
          className="button-link provider-bulk-paste"
          onClick={() => {
            setBulkError('');
            setBulkSuccess('');
            setBulkWarning('');
            setBulkOpen(true);
          }}
          type="button"
        >
          <ClipboardPaste size={16} />
          Paste keys
        </button>

        <button
          className="button-link secondary provider-env-download"
          disabled={exporting}
          onClick={() => void downloadEnvFile()}
          type="button"
        >
          <Download size={16} />
          {exporting ? 'Preparing...' : 'Download env'}
        </button>

        <label className="provider-env-select">
          <select
            aria-label="Sort providers"
            onChange={event => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="configured">Configured first</option>
            <option value="models">Most models</option>
            <option value="name">Name</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      {exportError && <p className="provider-key-message error provider-export-message">{exportError}</p>}

      <div className="provider-env-table">
        <div className="provider-env-table-head">
          <span>Provider</span>
          <span>Required credentials</span>
          <span>Catalog</span>
          <span>Actions</span>
        </div>

        {filteredProviders.length === 0 ? (
          <div className="provider-env-empty">
            <Search size={18} />
            No providers match this search.
          </div>
        ) : filteredProviders.map(provider => {
          const discoveredButFiltered = (
            provider.configured &&
            !provider.discoverySkipped &&
            provider.modelCount === 0 &&
            typeof provider.discoveredModelCount === 'number' &&
            provider.discoveredModelCount > 0
          );

          return (
            <article className="provider-env-row" key={provider.id}>
              <div className="provider-env-provider">
                <span className="provider-env-mark">
                  <ProviderMark provider={provider.id} />
                </span>
                <div>
                  <div className="provider-env-title">
                    <h3>{provider.name}</h3>
                    <span className={provider.configured ? 'provider-env-status ready' : 'provider-env-status missing'}>
                      {provider.configured ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                      {provider.configured ? 'Configured' : 'Missing'}
                    </span>
                  </div>
                  <p>{provider.description}</p>
                </div>
              </div>

              <div className="provider-env-vars">
                {provider.requiredEnv.length > 0
                  ? provider.requiredEnv.map(name => <code key={name}>{name}</code>)
                  : <code>No key required</code>}
              </div>

              <div className="provider-env-models">
                <span>
                  <Server size={15} />
                  {provider.modelCount} models
                </span>
                {typeof provider.discoveredModelCount === 'number' && provider.discoveredModelCount > 0 && (
                  <span title={`${provider.filteredModelCount ?? 0} duplicate or filtered model records`}>
                    <ShieldCheck size={15} />
                    {provider.discoveredModelCount} discovered
                  </span>
                )}
                <span>
                  <KeyRound size={15} />
                  {provider.requiredEnv.length + provider.optionalEnv.length} fields
                </span>
              </div>

              <ProviderSetupActions
                configured={provider.configured}
                docsUrl={provider.docsUrl}
                getKeyUrl={provider.getKeyUrl}
                optionalEnv={provider.optionalEnv}
                providerId={provider.id}
                providerName={provider.name}
                requiredEnv={provider.requiredEnv}
                storage={provider.storage}
              />

              {provider.missingReason && <p className="provider-env-warning">{provider.missingReason}</p>}
              {provider.discoveryError && (
                <p className="provider-env-warning">
                  Discovery {provider.discoverySkipped ? 'skipped' : 'failed'}: {provider.discoveryError}
                </p>
              )}
              {discoveredButFiltered && (
                <p className="provider-env-warning">
                  {provider.discoveredModelCount} models discovered, but none are included in the free catalog.
                </p>
              )}

            </article>
          );
        })}
      </div>

      <div className="provider-env-footnote">
        <ShieldCheck size={16} />
        Provider credentials are encrypted per user in the database. Secret values are only returned when you download an env export.
      </div>

      {bulkOpen && portalRoot && createPortal(
        <div className="provider-key-backdrop" onMouseDown={() => setBulkOpen(false)}>
          <section
            aria-labelledby="bulk-provider-key-title"
            aria-modal="true"
            className="provider-key-dialog"
            onMouseDown={event => event.stopPropagation()}
            role="dialog"
          >
            <div className="provider-key-head">
              <div>
                <span className="provider-env-status ready">
                  <ClipboardPaste size={14} />
                  Bulk setup
                </span>
                <h3 id="bulk-provider-key-title">Paste provider keys</h3>
                <p>
                  Paste <code>NAME=value</code> credential lines. Recognized provider keys are encrypted and saved to your account.
                </p>
              </div>
              <button aria-label="Close bulk key editor" onClick={() => setBulkOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>

            <form
              className="provider-key-form"
              onSubmit={event => {
                event.preventDefault();
                void saveBulkKeys();
              }}
            >
              <label className="provider-bulk-field">
                <span>Credential values</span>
                <textarea
                  autoFocus
                  onChange={event => setBulkText(event.target.value)}
                  placeholder={'OPENROUTER_API_KEY=sk-...\nOLLAMA_API_KEY=...\nNVIDIA_API_KEY=nvapi-...\nCERBES_API_KEY=csk-...'}
                  spellCheck={false}
                  value={bulkText}
                />
              </label>

              {bulkError && <p className="provider-key-message error">{bulkError}</p>}
              {bulkWarning && <p className="provider-key-message warning">{bulkWarning}</p>}
              {bulkSuccess && <p className="provider-key-message success">{bulkSuccess}</p>}

              <div className="provider-key-actions">
                <button className="button-link secondary" onClick={() => setBulkOpen(false)} type="button">
                  Cancel
                </button>
                <button className="button-link provider-save-key" disabled={bulkSaving} type="submit">
                  <Save size={15} />
                  {bulkSaving ? 'Saving...' : 'Save keys'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        portalRoot
      )}
    </div>
  );
}
