import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { ProviderMark } from '@/components/providers/provider-mark';
import { providerName } from '@/lib/provider-meta';
import { getConversationsPageData } from '../account-data';

export const dynamic = 'force-dynamic';

const CONVERSATION_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

export default async function AccountConversationsPage() {
  const { conversations, signedIn } = await getConversationsPageData();

  return (
    <section className="account-list-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Chat history</span>
          <h1>Conversations</h1>
          <p>{conversations.length} recent {conversations.length === 1 ? 'conversation' : 'conversations'} in this workspace.</p>
        </div>
      </div>

      <div className="account-list-panel">
        {conversations.length === 0 ? (
          <div className="account-empty-state">
            <MessageSquareText size={18} />
            {signedIn ? 'No saved conversations yet. Start chatting to build history.' : 'Sign in to keep chat history in this workspace.'}
          </div>
        ) : conversations.map(conversation => (
          <Link className="account-item-row account-item-row--link" href={`/chat?conversation=${conversation.id}`} key={conversation.id}>
            <div className="account-item-mark">
              <ProviderMark provider={conversation.provider} />
            </div>
            <div className="account-item-body">
              <strong className="account-item-title">{conversation.title}</strong>
              <div className="account-item-meta">
                <span className="account-item-chip">{providerName(conversation.provider)}</span>
                <span className="account-item-id">{conversation.modelId}</span>
              </div>
            </div>
            <time className="account-item-time" dateTime={conversation.updatedAt.toISOString()}>
              {CONVERSATION_DATE_FORMATTER.format(conversation.updatedAt)}
            </time>
          </Link>
        ))}
      </div>
    </section>
  );
}
