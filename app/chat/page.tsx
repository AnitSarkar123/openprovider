import { ChatConsole } from '@/components/chat/chat-console';
import { createPageMetadata } from '@/lib/seo';
import { OPENPROVIDER_AUTO_FREE_MODEL_ID } from '@/src/core/autoFreeRouter';

export const dynamic = 'force-dynamic';

export const metadata = createPageMetadata({
  title: 'Chat',
  description: 'Chat through OpenProvider auto routing and configured free model providers.',
  path: '/chat',
  noIndex: true,
});

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; conversation?: string }>;
}) {
  const resolved = await searchParams;
  return (
    <ChatConsole
      initialConversationId={resolved.conversation}
      initialModel={resolved.model ?? OPENPROVIDER_AUTO_FREE_MODEL_ID}
    />
  );
}
