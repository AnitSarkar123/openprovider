import Link from 'next/link';
import {
  ArrowUpRight,
  Activity,
  Bookmark,
  Braces,
  CheckCircle2,
  CircleAlert,
  Code2,
  Database,
  Gauge,
  KeyRound,
  Layers3,
  MessageSquareText,
  PlugZap,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { UserAvatar } from '@/components/auth/user-avatar';
import { getAccountOverviewData } from './account-data';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const {
    apiKeyCount,
    authReady,
    catalog,
    configuredCount,
    conversationCount,
    databaseReady,
    missingProviderCount,
    savedCount,
    session,
  } = await getAccountOverviewData();

  const accountName = session?.user ? session.user.name ?? session.user.email : 'Guest workspace';
  const providerTotal = configuredCount + missingProviderCount;
  const providerPercent = providerTotal > 0 ? Math.round((configuredCount / providerTotal) * 100) : 0;
  const readyChecks = [authReady, databaseReady, Boolean(session?.user)].filter(Boolean).length;
  const setupPercent = Math.round((readyChecks / 3) * 100);
  const textModelCount = catalog.categoryCounts.text ?? 0;
  const imageModelCount = catalog.categoryCounts.image ?? 0;
  const speechModelCount = catalog.categoryCounts.audio ?? 0;
  const routeModelTotal = Math.max(textModelCount + imageModelCount + speechModelCount, 1);
  const modelMix = [
    { label: 'Text', value: textModelCount, className: 'text' },
    { label: 'Image', value: imageModelCount, className: 'image' },
    { label: 'Speech', value: speechModelCount, className: 'speech' },
  ];
  const workspaceStatus = session?.user ? 'Personal workspace' : 'Guest preview';
  const healthCards = [
    {
      icon: KeyRound,
      label: 'Google OAuth',
      value: authReady ? 'Configured' : 'Missing env',
      detail: authReady ? 'Sign-in route is ready' : 'Add Google client credentials',
      state: authReady ? 'ready' : 'missing',
    },
    {
      icon: Database,
      label: 'Database',
      value: databaseReady ? 'Neon ready' : 'Missing URL',
      detail: databaseReady ? 'Workspace data can persist' : 'Add DATABASE_URL to enable storage',
      state: databaseReady ? 'ready' : 'missing',
    },
    {
      icon: ShieldCheck,
      label: 'Session',
      value: session?.user ? 'Signed in' : 'Guest',
      detail: session?.user ? 'Personal workspace active' : 'Sign in to unlock saved state',
      state: session?.user ? 'ready' : 'neutral',
    },
  ];
  const routeCards = [
    {
      href: '/account/apikey',
      icon: KeyRound,
      label: 'API keys',
      value: apiKeyCount,
      detail: 'Create and delete OpenProvider keys',
      meta: 'Server-side auth',
    },
    {
      href: '/account/requests',
      icon: Activity,
      label: 'Request logs',
      value: 'Trace',
      detail: 'Inspect routes, latency, and failures',
      meta: 'Debug traffic',
    },
    {
      href: '/account/providersetup',
      icon: PlugZap,
      label: 'Provider setup',
      value: `${configuredCount}/${providerTotal}`,
      detail: `${catalog.models.length} free models synced`,
      meta: `${providerPercent}% configured`,
    },
    {
      href: '/account/savedmodels',
      icon: Bookmark,
      label: 'Saved models',
      value: savedCount,
      detail: 'Pinned models and shortcuts',
      meta: 'Workspace routes',
    },
    {
      href: '/account/conversations',
      icon: MessageSquareText,
      label: 'Conversations',
      value: conversationCount,
      detail: 'Recent chat history',
      meta: 'Chat memory',
    },
  ];
  const apiUsageStats = [
    {
      icon: KeyRound,
      label: 'Active keys',
      value: apiKeyCount,
      detail: apiKeyCount > 0
        ? (apiKeyCount === 1 ? 'OpenProvider key ready' : 'OpenProvider keys ready')
        : 'Create a key before calling the API',
    },
    {
      icon: PlugZap,
      label: 'Provider coverage',
      value: `${providerPercent}%`,
      detail: `${configuredCount} of ${providerTotal} providers configured`,
    },
    {
      icon: Braces,
      label: 'Available routes',
      value: '4',
      detail: 'Chat, image, analysis, speech',
    },
  ];

  return (
    <>
      <div className="account-panel">
        <div className="account-panel-main">
          <div className="account-identity">
            <UserAvatar
              className="account-avatar"
              email={session?.user?.email}
              iconSize={24}
              image={session?.user?.image}
              name={session?.user ? accountName : null}
            />
            <div>
              <span className="eyebrow">Account settings</span>
              <h1>{accountName}</h1>
              <p>Manage provider credentials, OpenProvider API keys, saved models, and chat history for this workspace.</p>
            </div>
          </div>
          <div className="account-hero-pills" aria-label="Workspace status">
            <span><CheckCircle2 size={14} /> {readyChecks}/3 checks ready</span>
            <span><Sparkles size={14} /> {workspaceStatus}</span>
            <span><Layers3 size={14} /> {catalog.models.length} synced models</span>
          </div>
        </div>
        <div className="account-hero-actions">
          <Link href="/account/providersetup">Provider setup <ArrowUpRight size={15} /></Link>
        </div>
      </div>

      <div className="account-overview-grid">
        <div className="account-setup-card">
          <div className="account-card-title">
            <span><Gauge size={16} /> Setup progress</span>
            <strong>{setupPercent}%</strong>
          </div>
          <div className="account-setup-diagram">
            <div className="account-ring-figure">
              <svg aria-hidden="true" viewBox="0 0 112 112">
                <circle className="account-ring-track" cx="56" cy="56" r="44" pathLength="100" />
                <circle
                  className="account-ring-progress"
                  cx="56"
                  cy="56"
                  r="44"
                  pathLength="100"
                  strokeDasharray={`${setupPercent} ${100 - setupPercent}`}
                />
              </svg>
              <div>
                <strong>{readyChecks}/3</strong>
                <span>ready</span>
              </div>
            </div>
            <p>{readyChecks === 3 ? 'Workspace setup is ready.' : `${3 - readyChecks} setup checks need attention.`}</p>
          </div>
          <div className="account-check-list">
            {healthCards.map(card => (
              <span className={card.state} key={card.label}>
                {card.state === 'missing' ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
                {card.label}
              </span>
            ))}
          </div>
        </div>

        <Link className="account-coverage-card" href="/account/providersetup">
          <div className="account-card-title">
            <span><PlugZap size={16} /> Provider coverage</span>
            <ArrowUpRight size={17} />
          </div>
          <div className="account-coverage-layout">
            <div className="account-coverage-value">
              <strong>{configuredCount}</strong>
              <span>of {providerTotal} providers configured</span>
            </div>
            <div className="account-provider-meter" aria-hidden="true">
              <svg viewBox="0 0 96 96">
                <circle className="account-ring-track" cx="48" cy="48" r="38" pathLength="100" />
                <circle
                  className="account-ring-progress"
                  cx="48"
                  cy="48"
                  r="38"
                  pathLength="100"
                  strokeDasharray={`${providerPercent} ${100 - providerPercent}`}
                />
              </svg>
              <span>{providerPercent}%</span>
            </div>
          </div>
          <div className="account-model-bars" aria-label="Synced model category distribution">
            {modelMix.map(item => (
              <span
                className={`account-model-bar ${item.className}`}
                title={`${item.value} ${item.label.toLowerCase()} models`}
                key={item.label}
                style={{ width: `${Math.max(6, Math.round((item.value / routeModelTotal) * 100))}%` }}
              />
            ))}
          </div>
          <div className="account-route-breakdown">
            <span>{textModelCount} text</span>
            <span>{imageModelCount} image</span>
            <span>{speechModelCount} speech</span>
          </div>
        </Link>

        <div className="account-health-grid">
          {healthCards.map(card => {
            const Icon = card.icon;

            return (
              <div className={`account-health-card ${card.state}`} key={card.label}>
                <Icon size={18} />
                <div>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.detail}</small>
                </div>
                {card.state === 'missing' ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
              </div>
            );
          })}
        </div>
      </div>

      <section className="account-api-usage" aria-labelledby="api-usage-title">
        <div className="account-api-copy">
          <span className="eyebrow">API usage</span>
          <h2 id="api-usage-title">Ready for app traffic.</h2>
          <p>Use one OpenProvider key for OpenAI-style routes while provider credentials stay server-side.</p>
          <div className="account-api-actions">
            <Link href="/account/apikey">Manage keys <ArrowUpRight size={15} /></Link>
            <Link href="/docs">View docs <ArrowUpRight size={15} /></Link>
          </div>
        </div>

        <div className="account-api-board">
          <div className="account-api-flow" aria-label="API request path">
            <span>App</span>
            <i />
            <span>OpenProvider key</span>
            <i />
            <span>Auto route</span>
            <i />
            <span>Provider</span>
          </div>

          <div className="account-api-stat-grid">
            {apiUsageStats.map(stat => {
              const Icon = stat.icon;

              return (
                <div className="account-api-stat" key={stat.label}>
                  <Icon size={18} />
                  <div>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.detail}</small>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="account-api-snippet" aria-label="Example API request">
            <Code2 size={16} />
            <code>POST /v1/chat/completions</code>
            <span>model: openprovider/auto-free</span>
          </div>
        </div>
      </section>

      <div className="account-route-grid" aria-label="Account sections">
        {routeCards.map(card => {
          const Icon = card.icon;

          return (
            <Link className="account-route-card" href={card.href} key={card.label}>
              <div className="account-card-title">
                <span><Icon size={17} /> {card.label}</span>
                <ArrowUpRight size={16} />
              </div>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
              <em>{card.meta}</em>
            </Link>
          );
        })}
      </div>
    </>
  );
}
