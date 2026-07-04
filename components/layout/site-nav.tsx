'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioLines, FileCode2, MessageSquareText, Search, Server, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ProtectedLink } from '../auth/auth-gate';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  public?: boolean;
  isActive: (pathname: string) => boolean;
};

const nav: NavItem[] = [
  { href: '/', label: 'Explore', icon: Search, public: true, isActive: pathname => pathname === '/' },
  { href: '/models', label: 'Models', icon: Server, isActive: pathname => pathname === '/models' || pathname.startsWith('/models/') },
  { href: '/docs', label: 'Docs', icon: FileCode2, public: true, isActive: pathname => pathname === '/docs' || pathname.startsWith('/docs/') },
  { href: '/chat', label: 'Chat', icon: MessageSquareText, isActive: pathname => pathname === '/chat' || pathname.startsWith('/chat/') },
  {
    href: '/playground',
    label: 'Playground',
    icon: AudioLines,
    isActive: pathname => pathname === '/playground' || pathname.startsWith('/playground/') || pathname === '/vision' || pathname === '/speech',
  },
];

export function SiteNav() {
  const pathname = usePathname() || '/';

  return (
    <nav aria-label="Primary navigation" className="nav-list">
      {nav.map(item => {
        const Icon = item.icon;
        const active = item.isActive(pathname);
        const className = clsx('nav-item', active && 'active');
        const ariaCurrent = active ? 'page' : undefined;

        return item.public ? (
          <Link aria-current={ariaCurrent} className={className} href={item.href} key={item.href}>
            <Icon size={17} />
            <span>{item.label}</span>
          </Link>
        ) : (
          <ProtectedLink aria-current={ariaCurrent} className={className} href={item.href} key={item.href}>
            <Icon size={17} />
            <span>{item.label}</span>
          </ProtectedLink>
        );
      })}
    </nav>
  );
}
