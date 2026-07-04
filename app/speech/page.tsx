import { Suspense } from 'react';
import { MediaPlayground } from '@/components/media/media-playground';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({
  title: 'Speech Playground',
  description: 'Generate text-to-speech audio with OpenProvider speech models and compatible provider routes.',
  path: '/speech',
});

export default function SpeechPage() {
  return (
    <Suspense fallback={null}>
      <MediaPlayground mode="speech" />
    </Suspense>
  );
}
