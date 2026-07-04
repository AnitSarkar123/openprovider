'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bookmark, KeyRound, MessageSquareText, PlugZap, UserRound } from 'lucide-react';
import clsx from 'clsx';

type AccountSidebarProps = {
  savedCount: number;
  conversationCount: number;
  missingProviderCount: number;
  apiKeyCount: number;
};

const sections = [
  { href: '/account', id: 'account', label: 'Account', icon: UserRound },
  { href: '/account/apikey', id: 'keys', label: 'API keys', icon: KeyRound },
  { href: '/account/requests', id: 'requests', label: 'Request logs', icon: Activity },
  { href: '/account/providersetup', id: 'providers', label: 'Provider setup', icon: PlugZap },
  { href: '/account/savedmodels', id: 'saved', label: 'Saved models', icon: Bookmark },
  { href: '/account/conversations', id: 'chats', label: 'Conversations', icon: MessageSquareText },
];

export function AccountSidebar({ apiKeyCount, savedCount, conversationCount, missingProviderCount }: AccountSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="settings-sidebar">
      <div className="workspace-switcher">
        <span>Workspace</span>
        <strong>Default workspace</strong>
        <small>OpenProvider gateway</small>
      </div>

      <nav aria-label="Account sections">
        {sections.map(section => {
          const Icon = section.icon;
          const count = section.id === 'providers'
            ? missingProviderCount
            : section.id === 'keys'
              ? apiKeyCount
              : section.id === 'saved'
                ? savedCount
                : section.id === 'chats'
                  ? conversationCount
                  : undefined;
          const active = pathname === section.href;

          return (
            <Link
              className={clsx(active && 'active')}
              href={section.href}
              key={section.id}
            >
              <Icon size={16} />
              <span>{section.label}</span>
              {typeof count === 'number' && count > 0 && <small>{count}</small>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
