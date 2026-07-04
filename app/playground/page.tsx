import { Suspense } from 'react';
import { MediaPlayground } from '@/components/media/media-playground';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({
  title: 'Image and Speech Playground',
  description: 'Generate images and speech through OpenProvider media routes using configured free providers.',
  path: '/playground',
});

export default function PlaygroundPage() {
  return (
    <Suspense fallback={null}>
      <MediaPlayground />
    </Suspense>
  );
}
