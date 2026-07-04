'use client';

import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'nextjs-toploader/app';
import { AuthModal } from './auth-modal';

type AuthGateContextValue = {
  openAuthModal: (callbackUrl?: string, disabledReason?: string) => void;
  requireAuth: (callbackUrl?: string, disabledReason?: string) => boolean;
};

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

function normalizeCallbackUrl(value?: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/models';
  return value;
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('/models');
  const [disabledReason, setDisabledReason] = useState<string | undefined>();
  const signedIn = Boolean(session?.user);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setDisabledReason(undefined);

    const params = new URLSearchParams(window.location.search);
    if (pathname === '/' && (params.has('auth') || params.has('callbackUrl'))) {
      router.replace('/');
    }
  }, [pathname, router]);

  const openAuthModal = useCallback((nextCallbackUrl?: string, reason?: string) => {
    setCallbackUrl(normalizeCallbackUrl(nextCallbackUrl));
    setDisabledReason(reason);
    setModalOpen(true);
  }, []);

  const requireAuth = useCallback((nextCallbackUrl?: string, reason?: string) => {
    if (signedIn) return true;
    openAuthModal(nextCallbackUrl, reason);
    return false;
  }, [openAuthModal, signedIn]);

  useEffect(() => {
    if (signedIn) {
      setModalOpen(false);
      return;
    }

    if (status === 'loading') return;

    const params = new URLSearchParams(window.location.search);
    const requested = params.get('callbackUrl');
    setCallbackUrl(normalizeCallbackUrl(requested ?? undefined));

    if (params.get('auth') === 'signin') {
      setModalOpen(true);
    }
  }, [pathname, signedIn, status]);

  const value = useMemo<AuthGateContextValue>(
    () => ({ openAuthModal, requireAuth }),
    [openAuthModal, requireAuth],
  );

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <AuthModal
        callbackUrl={callbackUrl}
        disabledReason={disabledReason}
        onClose={closeModal}
        open={modalOpen && !signedIn}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const value = useContext(AuthGateContext);
  if (!value) {
    throw new Error('useAuthGate must be used inside AuthGateProvider.');
  }
  return value;
}

type ProtectedLinkProps = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
  callbackUrl?: string;
};

export function ProtectedLink({
  callbackUrl,
  children,
  onClick,
  ...props
}: ProtectedLinkProps) {
  const { requireAuth } = useAuthGate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const target = event.currentTarget;
    const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (isModifiedClick || target.target === '_blank') return;

    if (!requireAuth(callbackUrl ?? target.getAttribute('href') ?? undefined)) {
      event.preventDefault();
    }
  }

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
