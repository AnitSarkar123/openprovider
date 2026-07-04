import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthButton } from '../auth/auth-button';
import { GlobalSearch } from '../search/global-search';
import { SiteNav } from './site-nav';
import { ThemeToggle } from './theme-toggle';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame" suppressHydrationWarning>
      <header className="site-header">
        <Link className="brand" href="/">
          <Image alt="" aria-hidden="true" src="/brand/openprovider-icon.png" width={32} height={32} priority />
          <strong>OpenProvider</strong>
        </Link>

        <GlobalSearch />

        <SiteNav />

        <div className="header-actions">
          <ThemeToggle />
          <AuthButton />
        </div>
      </header>

      <div className="main-shell">
        <main>{children}</main>
      </div>
    </div>
  );
}
