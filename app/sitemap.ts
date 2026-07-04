import type { MetadataRoute } from 'next';
import { getShowcaseCatalogSnapshot } from '@/lib/openprovider/catalog';
import { absoluteUrl } from '@/lib/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/models'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.95,
    },
    {
      url: absoluteUrl('/docs'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: absoluteUrl('/playground'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: absoluteUrl('/speech'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.65,
    },
    {
      url: absoluteUrl('/vision'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.65,
    },
  ];

  const snapshot = await getShowcaseCatalogSnapshot();
  const seenUrls = new Set(staticRoutes.map(route => route.url));
  const modelRoutes = snapshot.models.flatMap(model => {
    const url = absoluteUrl(`/models/${model.provider}/${encodeURIComponent(model.modelId)}`);
    if (seenUrls.has(url)) {
      return [];
    }

    seenUrls.add(url);
    return [{
      url,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: model.provider === 'openprovider' ? 0.9 : 0.7,
    }];
  });

  return [...staticRoutes, ...modelRoutes];
}
