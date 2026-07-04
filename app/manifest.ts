import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.title,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#645ff2',
    icons: [
      {
        src: siteConfig.iconPath,
        sizes: '1024x1024',
        type: 'image/png',
      },
    ],
  };
}
