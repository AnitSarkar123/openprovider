import { createPageMetadata } from '@/lib/seo';
import type { ReactNode } from 'react';
import { AccountSidebar } from '@/components/account/account-sidebar';
import { getAccountSidebarData } from './account-data';

export const dynamic = 'force-dynamic';

export const metadata = createPageMetadata({
  title: 'Account Settings',
  description: 'Manage OpenProvider API keys, provider credentials, saved models, and conversation history.',
  path: '/account',
  noIndex: true,
});

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const sidebar = await getAccountSidebarData();

  return (
    <section className="settings-layout">
      <AccountSidebar
        apiKeyCount={sidebar.apiKeyCount}
        conversationCount={sidebar.conversationCount}
        missingProviderCount={sidebar.missingProviderCount}
        savedCount={sidebar.savedCount}
      />

      <div className="settings-main">
        {children}
      </div>
    </section>
  );
}
