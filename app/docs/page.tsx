import { ApiDocs } from '@/components/docs/api-docs';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({
  title: 'API Docs',
  description: 'OpenProvider API docs for the web app, OpenAI compatibility, SDK examples, chat, image, vision, speech, auth, errors, and routing.',
  path: '/docs',
});

export default function DocsPage() {
  return <ApiDocs />;
}
