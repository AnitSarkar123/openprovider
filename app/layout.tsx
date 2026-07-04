import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import NextTopLoader from 'nextjs-toploader';
import { SiteShell } from '@/components/layout/site-shell';
import { ScrollPerformance } from '@/components/layout/scroll-performance';
import { AuthSessionProvider } from '@/components/auth/session-provider';
import { AuthGateProvider } from '@/components/auth/auth-gate';
import { absoluteUrl, siteConfig } from '@/lib/seo';
import 'streamdown/styles.css';
import './globals.css';
import './models-responsive.css';

const googleAdSenseClient =
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT?.trim() || 'ca-pub-9647614948015971';

export const metadata: Metadata = {
  metadataBase: siteConfig.url,
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [{ name: siteConfig.creator }],
  creator: siteConfig.creator,
  publisher: siteConfig.name,
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: siteConfig.iconPath,
    shortcut: siteConfig.iconPath,
    apple: siteConfig.iconPath,
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    url: absoluteUrl('/'),
    siteName: siteConfig.name,
    images: [
      {
        url: absoluteUrl(siteConfig.iconPath),
        width: 1024,
        height: 1024,
        alt: siteConfig.name,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: siteConfig.title,
    description: siteConfig.description,
    images: [absoluteUrl(siteConfig.iconPath)],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0d12' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const themeScript = `
    (function() {
      try {
        var key = 'openprovider-theme';
        var stored = window.localStorage.getItem(key);
        var theme = stored === 'light' || stored === 'dark'
          ? stored
          : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
      } catch (_) {}
    })();
  `;
  const devHydrationGuardScript = `
    (function() {
      try {
        var extensionAttributes = ['bis_skin_checked'];
        var selector = extensionAttributes.map(function(attribute) {
          return '[' + attribute + ']';
        }).join(',');
        var removeExtensionAttributes = function(root) {
          if (!root || !root.querySelectorAll) return;
          var nodes = root.matches && root.matches(selector)
            ? [root]
            : [];
          root.querySelectorAll(selector).forEach(function(node) {
            nodes.push(node);
          });
          nodes.forEach(function(node) {
            extensionAttributes.forEach(function(attribute) {
              node.removeAttribute(attribute);
            });
          });
        };

        removeExtensionAttributes(document.documentElement);

        if (!window.MutationObserver) return;

        var observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes') {
              removeExtensionAttributes(mutation.target);
              return;
            }
            mutation.addedNodes.forEach(function(node) {
              if (node.nodeType === 1) removeExtensionAttributes(node);
            });
          });
        });

        observer.observe(document.documentElement, {
          attributeFilter: extensionAttributes,
          attributes: true,
          childList: true,
          subtree: true
        });

        window.setTimeout(function() {
          observer.disconnect();
          removeExtensionAttributes(document.documentElement);
        }, 3000);
      } catch (_) {}
    })();
  `;

  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${googleAdSenseClient}`}
        />
      </head>
      <body suppressHydrationWarning>
        <ScrollPerformance />
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {process.env.NODE_ENV === 'development' && (
          <Script
            id="dev-hydration-guard"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: devHydrationGuardScript }}
          />
        )}
        <NextTopLoader
          color="var(--accent)"
          height={3}
          shadow="0 0 10px var(--accent), 0 0 5px var(--accent)"
          showSpinner={false}
          zIndex={2147483647}
        />
        <AuthSessionProvider>
          <AuthGateProvider>
            <SiteShell>{children}</SiteShell>
          </AuthGateProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
