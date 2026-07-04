'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Bookmark,
  ChevronDown,
  KeyRound,
  LogIn,
  LogOut,
  MessageSquareText,
  Search,
  Server,
  Settings,
  UserRound,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useAuthGate } from './auth-gate';
import { UserAvatar } from './user-avatar';

const appLinks = [
  { href: '/', label: 'Explore', icon: Search },
  { href: '/models', label: 'Models', icon: Server },
  { href: '/chat', label: 'Chat', icon: MessageSquareText },
  { href: '/playground', label: 'Playground', icon: AudioLines },
];

const accountLinks = [
  { href: '/account', label: 'Account overview', icon: UserRound },
  { href: '/account/apikey', label: 'API keys', icon: KeyRound },
  { href: '/account/providersetup', label: 'Provider setup', icon: Settings },
  { href: '/account/savedmodels', label: 'Saved models', icon: Bookmark },
  { href: '/account/conversations', label: 'Conversations', icon: MessageSquareText },
];

export function AuthButton({ disabledReason }: { disabledReason?: string } = {}) {
  const { data: session, status } = useSession();
  const { openAuthModal } = useAuthGate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isLoading = status === 'loading';

  useEffect(() => {
    if (!profileOpen) return;

    function closeOnOutside(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  if (session?.user) {
    const accountLabel = session.user.name ?? session.user.email ?? 'Account';
    return (
      <div className="profile-menu" ref={profileRef}>
        <button
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          aria-label={`Open profile menu for ${accountLabel}`}
          className="user-button profile-trigger"
          onClick={() => setProfileOpen(current => !current)}
          type="button"
        >
          <UserAvatar
            className="profile-trigger-avatar"
            email={session.user.email}
            image={session.user.image}
            name={session.user.name ?? accountLabel}
          />
          <span>{accountLabel}</span>
          <ChevronDown size={15} />
        </button>

        {profileOpen && (
          <div className="profile-dropdown" role="menu">
            <div className="profile-card">
              <UserAvatar
                className="profile-avatar"
                email={session.user.email}
                iconSize={18}
                image={session.user.image}
                name={session.user.name ?? accountLabel}
              />
              <div>
                <strong>{session.user.name ?? 'OpenProvider user'}</strong>
                <span>{session.user.email ?? 'Signed in'}</span>
              </div>
            </div>

            <div className="profile-menu-list">
              <div className="profile-menu-section profile-app-links">
                {appLinks.map(item => (
                  <Link
                    href={item.href}
                    key={item.href}
                    onClick={() => setProfileOpen(false)}
                    role="menuitem"
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>

              <div className="profile-menu-section">
                {accountLinks.map(item => (
                  <Link
                    href={item.href}
                    key={item.href}
                    onClick={() => setProfileOpen(false)}
                    role="menuitem"
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <button
              className="profile-signout"
              onClick={() => {
                setProfileOpen(false);
                void signOut();
              }}
              role="menuitem"
              type="button"
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        aria-label="Sign in with Google"
        className="user-button"
        disabled={isLoading}
        onClick={() => {
          if (!isLoading) openAuthModal('/models', disabledReason);
        }}
        title={disabledReason ?? 'Sign in with Google'}
        type="button"
      >
        <LogIn size={16} />
        <span>{disabledReason ?? (isLoading ? 'Checking...' : 'Sign in with Google')}</span>
      </button>
    </>
  );
}
