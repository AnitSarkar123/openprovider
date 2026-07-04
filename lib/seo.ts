import type { Metadata } from 'next';

const fallbackSiteUrl = 'http://localhost:3000';

function normalizeSiteUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export const siteConfig = {
  name: 'OpenProvider',
  title: 'OpenProvider - Free AI Model Gateway',
  description: 'OpenProvider is a free-first OpenAI-compatible gateway for model search, chat, image generation, image analysis, and speech across configured providers.',
  keywords: [
    'OpenProvider',
    'free AI models',
    'OpenAI compatible API',
    'AI model gateway',
    'LLM router',
    'image generation API',
    'text to speech API',
  ],
  creator: 'VK',
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
    ?? normalizeSiteUrl(process.env.NEXTAUTH_URL)
    ?? normalizeSiteUrl(process.env.VERCEL_URL)
    ?? new URL(fallbackSiteUrl),
  iconPath: '/brand/openprovider-icon.png',
};

export function absoluteUrl(path = '/'): string {
  return new URL(path, siteConfig.url).toString();
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(siteConfig.iconPath);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      images: [
        {
          url: imageUrl,
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
      title,
      description,
      images: [imageUrl],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
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
}

export function homeJsonLd(modelCount: number, providerCount: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: siteConfig.name,
        url: absoluteUrl('/'),
        logo: absoluteUrl(siteConfig.iconPath),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        name: siteConfig.name,
        url: absoluteUrl('/'),
        description: siteConfig.description,
        publisher: {
          '@id': absoluteUrl('/#organization'),
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${absoluteUrl('/models')}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': absoluteUrl('/#application'),
        name: siteConfig.name,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: absoluteUrl('/'),
        description: siteConfig.description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        additionalProperty: [
          {
            '@type': 'PropertyValue',
            name: 'Free models',
            value: String(modelCount),
          },
          {
            '@type': 'PropertyValue',
            name: 'Providers',
            value: String(providerCount),
          },
        ],
      },
    ],
  };
}
