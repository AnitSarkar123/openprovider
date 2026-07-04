'use client';

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import { signIn } from 'next-auth/react';

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" focusable="false" viewBox="0 0 24 24">
      <path d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52Z" fill="#4285F4" />
      <path d="M12 22c2.7 0 4.97-.9 6.62-2.45l-3.24-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.82-1.76-5.61-4.12H3.04v2.59A10 10 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.39 13.87A6.01 6.01 0 0 1 6.07 12c0-.65.11-1.28.32-1.87V7.54H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.46l3.35-2.59Z" fill="#FBBC05" />
      <path d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.54l3.35 2.59C7.18 7.77 9.4 6.01 12 6.01Z" fill="#EA4335" />
    </svg>
  );
}

export function AuthModal({
  callbackUrl,
  disabledReason,
  onClose,
  open,
}: {
  callbackUrl: string;
  disabledReason?: string;
  onClose: () => void;
  open: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="auth-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="auth-modal"
        onMouseDown={event => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close sign in" className="auth-modal-close" onClick={onClose} type="button">
          <X size={18} />
        </button>

        <div className="auth-modal-brand">
          <span>
            <img alt="" aria-hidden="true" src="/brand/openprovider-icon.png" />
          </span>
        </div>

        <div className="auth-modal-copy">
          <h2 id={titleId}>Sign in to OpenProvider</h2>
          <p>Use your Google account to access models, chat, provider keys, and API key management.</p>
        </div>

        <button
          className="auth-google-button"
          disabled={Boolean(disabledReason)}
          onClick={() => {
            if (!disabledReason) void signIn('google', { callbackUrl });
          }}
          type="button"
        >
          <GoogleMark />
          <span>{disabledReason ?? 'Continue with Google'}</span>
          <ArrowRight size={16} />
        </button>

        <div className="auth-modal-note">
          <ShieldCheck size={16} />
          <span>Your provider credentials and OpenProvider API keys stay tied to your account.</span>
        </div>
      </section>
    </div>,
    document.body
  );
}
