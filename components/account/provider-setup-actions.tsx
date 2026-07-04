'use client';

import Link from 'next/link';
import { useRouter } from 'nextjs-toploader/app';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  KeyRound,
  ListFilter,
  MoreHorizontal,
  Save,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type ProviderSetupActionsProps = {
  configured: boolean;
  docsUrl: string;
  getKeyUrl: string;
  optionalEnv: string[];
  providerId: string;
  providerName: string;
  requiredEnv: string[];
  storage?: 'database' | 'missing';
};

type SaveResponse = {
  ok?: boolean;
  updated?: string[];
  configured?: boolean;
  missingReason?: string;
  storage?: 'database';
  error?: {
    message?: string;
  };
};

function isSecretEnv(name: string): boolean {
  return /(KEY|TOKEN|SECRET|PASSWORD)/i.test(name);
}

export function ProviderSetupActions({
  configured,
  docsUrl,
  getKeyUrl,
  optionalEnv,
  providerId,
  providerName,
  requiredEnv,
  storage,
}: ProviderSetupActionsProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const envNames = [...requiredEnv, ...optionalEnv];

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeMenu);

    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  useEffect(() => {
    function closeEditor(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditorOpen(false);
      }
    }

    document.addEventListener('keydown', closeEditor);

    return () => document.removeEventListener('keydown', closeEditor);
  }, []);

  useEffect(() => {
    if (!editorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editorOpen]);

  async function saveKeys() {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await fetch('/api/provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, values }),
      });
      const result = await response.json() as SaveResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? 'Unable to save provider key.');
      }

      setValues({});
      setSuccess(
        result.configured
          ? `Saved ${result.updated?.length ?? 0} credential value${result.updated?.length === 1 ? '' : 's'} to encrypted database storage.`
          : result.missingReason ?? 'Saved, but this provider still needs more required values.'
      );
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save provider key.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="provider-actions" ref={menuRef}>
      <button
        className="button-link provider-primary-action"
        onClick={() => {
          setEditorOpen(true);
          setMenuOpen(false);
          setError('');
          setSuccess('');
        }}
        type="button"
      >
        <KeyRound size={15} />
        Edit key
      </button>

      <button
        aria-expanded={menuOpen}
        className="button-link secondary provider-more-action"
        onClick={() => setMenuOpen(current => !current)}
        type="button"
      >
        <MoreHorizontal size={16} />
        More
        <ChevronDown size={14} />
      </button>

      {menuOpen && (
        <div className="provider-action-menu">
          <a href={getKeyUrl} onClick={() => setMenuOpen(false)} rel="noreferrer" target="_blank">
            <KeyRound size={15} />
            Provider console
            <ExternalLink size={13} />
          </a>
          <Link href={`/models?provider=${providerId}`} onClick={() => setMenuOpen(false)}>
            <ListFilter size={15} />
            View models
          </Link>
          <a href={docsUrl} onClick={() => setMenuOpen(false)} rel="noreferrer" target="_blank">
            <FileText size={15} />
            Provider docs
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {editorOpen && portalRoot && createPortal(
        <div className="provider-key-backdrop" onMouseDown={() => setEditorOpen(false)}>
          <section
            aria-labelledby={`${providerId}-key-editor-title`}
            aria-modal="true"
            className="provider-key-dialog"
            onMouseDown={event => event.stopPropagation()}
            role="dialog"
          >
            <div className="provider-key-head">
              <div>
                <span className={configured ? 'provider-env-status ready' : 'provider-env-status missing'}>
                  {configured ? <Check size={14} /> : <AlertTriangle size={14} />}
                  {configured ? 'Configured' : 'Missing'}
                </span>
                <h3 id={`${providerId}-key-editor-title`}>Edit {providerName} keys</h3>
                <p>
                  {storage === 'database'
                    ? 'Saved to encrypted user storage. Existing secrets stay hidden, so leave a field blank to keep its current value.'
                    : 'Credential values are encrypted and saved to your account. Existing secrets stay hidden; leave blank to keep current saved values.'}
                </p>
              </div>
              <button aria-label="Close key editor" onClick={() => setEditorOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>

            <form
              className="provider-key-form"
              onSubmit={event => {
                event.preventDefault();
                void saveKeys();
              }}
            >
              <div className="provider-key-fields">
                {envNames.map((name, index) => (
                  <label key={name}>
                    <span>
                      {name}
                      {requiredEnv.includes(name) ? <small>Required</small> : <small>Optional</small>}
                    </span>
                    <input
                      autoComplete="off"
                      autoFocus={index === 0}
                      onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}
                      placeholder={configured ? 'Configured. Enter a new value to replace.' : `Paste ${name}`}
                      spellCheck={false}
                      type={isSecretEnv(name) ? 'password' : 'text'}
                      value={values[name] ?? ''}
                    />
                  </label>
                ))}
              </div>

              {error && <p className="provider-key-message error">{error}</p>}
              {success && <p className="provider-key-message success">{success}</p>}

              <div className="provider-key-actions">
                <a className="button-link secondary" href={getKeyUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={15} />
                  Get key
                </a>
                <button className="button-link provider-save-key" disabled={saving} type="submit">
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save'}
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
