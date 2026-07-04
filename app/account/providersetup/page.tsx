import { ProviderSetupList } from '@/components/account/provider-setup-list';
import { getProviderSetupPageData } from '../account-data';

export const dynamic = 'force-dynamic';

export default async function AccountProviderSetupPage() {
  const { catalog, configuredCount, missingProviderCount, providerRows } = await getProviderSetupPageData();

  return (
    <section className="account-provider-setup">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Provider keys</span>
          <h1>Provider setup</h1>
          <p>{configuredCount} configured, {missingProviderCount} missing, {catalog.models.length} free models synced.</p>
        </div>
      </div>

      <ProviderSetupList providers={providerRows} />
    </section>
  );
}
