import { Activity } from 'lucide-react';
import { RequestTraceDashboard } from '@/components/account/request-trace-dashboard';
import { getRequestTracePageData } from '../account-data';

export const dynamic = 'force-dynamic';

export default async function AccountRequestsPage() {
  const { databaseReady, signedIn, trace } = await getRequestTracePageData();

  return (
    <section className="account-provider-setup account-request-traces">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Route trace</span>
          <h1>Request logs</h1>
          <p>Inspect API and web chat requests by endpoint, routed model, provider, latency, status, and token usage.</p>
        </div>
        <div className="api-route-chip">
          <Activity size={16} />
          Last 30 days
        </div>
      </div>

      <RequestTraceDashboard
        databaseReady={databaseReady}
        signedIn={signedIn}
        trace={trace}
      />
    </section>
  );
}
