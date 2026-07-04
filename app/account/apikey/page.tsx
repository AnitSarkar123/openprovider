import { TerminalSquare } from 'lucide-react';
import { ApiKeysPanel } from '@/components/account/api-keys-panel';
import { getApiKeyPageData, openProviderApiActions } from '../account-data';

export const dynamic = 'force-dynamic';

export default async function AccountApiKeyPage() {
  const { apiKeyRows, databaseReady, signedIn, usage } = await getApiKeyPageData();

  return (
    <section className="account-provider-setup account-api-keys">
      <div className="section-heading">
        <div>
          <span className="eyebrow">OpenProvider API</span>
          <h1>API keys</h1>
          <p>Create OpenProvider keys for your own apps. Each key can call all API actions while provider credentials stay saved in your account.</p>
        </div>
        <div className="api-route-chip">
          <TerminalSquare size={16} />
          Authorization: Bearer opk_live_...
        </div>
      </div>

      <div className="api-scope-grid" aria-label="OpenProvider API actions">
        {openProviderApiActions.map(action => (
          <div className="api-scope-card" key={action.path}>
            <code>{action.method}</code>
            <strong>{action.path}</strong>
            <span>{action.label}</span>
          </div>
        ))}
      </div>

      <ApiKeysPanel
        databaseReady={databaseReady}
        initialKeys={apiKeyRows}
        signedIn={signedIn}
        usage={usage}
      />
    </section>
  );
}
