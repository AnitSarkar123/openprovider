'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ClipboardCopy, Code, Copy, Server, X } from 'lucide-react';
import type { UiModel } from './model-explorer';
import { providerName } from '@/lib/provider-meta';

/* -------------------------------------------------------------------------- */
/*  Helpers (unchanged)                                                       */
/* -------------------------------------------------------------------------- */

function endpointFor(category: UiModel['category']): string {
  if (category === 'image') return '/v1/images/generations';
  if (category === 'vision') return '/v1/images/analyze';
  if (category === 'audio') return '/v1/audio/speech';
  return '/v1/chat/completions';
}

function apiExampleFor(model: UiModel): string {
  if (model.category === 'image') {
    return JSON.stringify({ model: model.id, prompt: 'A clean product mockup on a white desk' }, null, 2);
  }
  if (model.category === 'vision') {
    return JSON.stringify({ model: model.id, image: 'https://example.com/image.png', prompt: 'Describe this image' }, null, 2);
  }
  if (model.category === 'audio') {
    return JSON.stringify({ model: model.id, input: 'This audio was generated through OpenProvider.', voice: 'alloy' }, null, 2);
  }
  return JSON.stringify({ model: model.id, messages: [{ role: 'user', content: 'Hello' }] }, null, 2);
}

function curlSnippetFor(model: UiModel): string {
  const endpoint = endpointFor(model.category);
  const body = apiExampleFor(model);
  const indentedBody = body.split('\n').join('\n  ');
  return `curl -X POST http://localhost:3000${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${indentedBody}'`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ApiSnippetModal({
  model,
  onClose,
  open,
}: {
  model: UiModel | null;
  onClose: () => void;
  open: boolean;
}) {
  const titleId = useId();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure portal is only created on the client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when open (client‑side only)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !model || !mounted) return null;

  /* ---- copy helper with modern fallback ---- */
  async function copyText(text: string, field: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / non‑https contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        document.execCommand('copy'); // still widely supported as fallback
        document.body.removeChild(textarea);
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1500);
    } catch {
      // silent failure – nothing to do
    }
  }

  return createPortal(
    <div className="auth-modal-backdrop snippet-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="snippet-modal"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="snippet-modal-header">
          <div>
            <h2 id={titleId}>API Integration</h2>
            <p>
              {providerName(model.provider)}: {model.name}
            </p>
          </div>
          <button
            aria-label="Close modal"
            className="snippet-modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="snippet-modal-body">
          {/* Route & model ID strip */}
          <div className="snippet-route-strip">
            <div className="snippet-route-item">
              <span className="snippet-route-icon"><Server size={15} /></span>
              <span className="snippet-route-copy">
                <small>Endpoint</small>
                <strong><b>POST</b> {endpointFor(model.category)}</strong>
              </span>
            </div>
            <button
              className="snippet-route-item snippet-route-button"
              onClick={() => copyText(model.id, 'Route ID')}
              title="Copy routing name"
              type="button"
            >
              <span className="snippet-route-icon">{copiedField === 'Route ID' ? <Check size={15} /> : <Code size={15} />}</span>
              <span className="snippet-route-copy">
                <small>{copiedField === 'Route ID' ? 'Copied' : 'Model'}</small>
                <strong>{copiedField === 'Route ID' ? 'Route ID copied' : model.id}</strong>
              </span>
            </button>
          </div>

          {/* cURL snippet */}
          <div className="detail-code-wrapper">
            <div className="detail-code-header">
              <span>CURL EXAMPLE</span>
              <button
                className="detail-code-copy"
                onClick={() => copyText(curlSnippetFor(model), 'cURL')}
                type="button"
              >
                {copiedField === 'cURL' ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {copiedField === 'cURL' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="code-block snippet-block">
              <code>{curlSnippetFor(model)}</code>
            </pre>
          </div>

          {/* JSON body */}
          <div className="detail-code-wrapper">
            <div className="detail-code-header">
              <span>JSON BODY</span>
              <button
                className="detail-code-copy"
                onClick={() => copyText(apiExampleFor(model), 'JSON body')}
                type="button"
              >
                {copiedField === 'JSON body' ? <Check size={14} /> : <Copy size={14} />}
                {copiedField === 'JSON body' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="code-block snippet-block">
              <code>{apiExampleFor(model)}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
