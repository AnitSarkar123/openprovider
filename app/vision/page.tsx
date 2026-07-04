import { Suspense } from 'react';
import { MediaPlayground } from '@/components/media/media-playground';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({
  title: 'Image Analysis Playground',
  description: 'Analyze images and extract text with OpenProvider image-analysis models.',
  path: '/vision',
});

export default function VisionPage() {
  return (
    <Suspense fallback={null}>
      <MediaPlayground mode="vision" />
    </Suspense>
  );
}
