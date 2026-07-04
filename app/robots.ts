import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/models',
          '/models/',
          '/docs',
          '/playground',
          '/speech',
          '/vision',
        ],
        disallow: [
          '/account',
          '/account/',
          '/api/',
          '/v1/',
          '/chat',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
