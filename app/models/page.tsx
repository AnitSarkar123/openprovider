import { ModelExplorer } from '@/components/models/model-explorer';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({
  title: 'Free AI Model Catalog',
  description: 'Browse free text, image, speech, and image-analysis models from configured providers through OpenProvider.',
  path: '/models',
});

export default function ModelsPage() {
  return <ModelExplorer />;
}
