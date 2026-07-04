import Link from 'next/link';
import { Bookmark, ExternalLink } from 'lucide-react';
import { ProviderMark } from '@/components/providers/provider-mark';
import { providerName } from '@/lib/provider-meta';
import { getSavedModelsPageData } from '../account-data';

export const dynamic = 'force-dynamic';

export default async function AccountSavedModelsPage() {
  const { saved, signedIn } = await getSavedModelsPageData();

  return (
    <section className="account-list-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Model shortcuts</span>
          <h1>Saved models</h1>
          <p>{saved.length} {saved.length === 1 ? 'model' : 'models'} saved in this workspace.</p>
        </div>
      </div>

      <div className="account-list-panel">
        {saved.length === 0 ? (
          <div className="account-empty-state">
            <Bookmark size={18} />
            {signedIn ? 'No saved models yet. Bookmark models from the explore page.' : 'Sign in to save models to this workspace.'}
          </div>
        ) : saved.map(model => (
          <div className="account-item-row" key={model.id}>
            <div className="account-item-mark">
              <ProviderMark provider={model.provider} />
            </div>
            <div className="account-item-body">
              <strong className="account-item-title">{model.modelName}</strong>
              <div className="account-item-meta">
                <span className="account-item-chip">{providerName(model.provider)}</span>
                <span className="account-item-id">{model.modelId}</span>
              </div>
            </div>
            <Link
              aria-label={`Open ${model.modelName} in chat`}
              className="account-item-action"
              href={`/chat?model=${encodeURIComponent(model.modelId)}`}
            >
              <ExternalLink size={15} />
              <span>Open in chat</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
