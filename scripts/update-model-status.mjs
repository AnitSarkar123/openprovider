#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const optionAliases = new Map([
  ['base-url', 'baseUrl'],
  ['batch-size', 'batchSize'],
  ['budget-ms', 'budgetMs'],
  ['env-provider-keys', 'envProviderKeys'],
  ['finalize-unknown', 'finalizeUnknown'],
  ['provider-delay-ms', 'providerDelayMs'],
  ['single-request', 'singleRequest'],
  ['split-providers', 'splitProviders'],
  ['slow-retry-concurrency', 'slowRetryConcurrency'],
  ['slow-retry-timeout-ms', 'slowRetryTimeoutMs'],
  ['soft-failure-threshold', 'softFailureThreshold'],
  ['stale-hours', 'staleHours'],
  ['timeout-ms', 'timeoutMs'],
  ['user-id', 'userId'],
]);

const queryOptions = [
  'force',
  'limit',
  'budgetMs',
  'concurrency',
  'envProviderKeys',
  'finalizeUnknown',
  'providerDelayMs',
  'slowRetryConcurrency',
  'slowRetryTimeoutMs',
  'softFailureThreshold',
  'staleHours',
  'status',
  'timeoutMs',
  'userId',
];

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const equalsIndex = normalized.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, equalsIndex).trim();
    let value = normalized.slice(equalsIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function normalizeOptionName(name) {
  return optionAliases.get(name) ?? name;
}

function parseArgs(argv) {
  const options = {
    force: 'true',
    batchSize: process.env.MODEL_STATUS_BATCH_SIZE ?? '25',
    envProviderKeys: process.env.MODEL_STATUS_ENV_PROVIDER_KEYS ?? 'true',
    finalizeUnknown: process.env.MODEL_STATUS_FINALIZE_UNKNOWN ?? 'false',
    providers: [],
    json: false,
    singleRequest: false,
    splitProviders: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--single-request') {
      options.singleRequest = true;
      continue;
    }

    if (arg === '--no-split-providers') {
      options.splitProviders = false;
      continue;
    }

    if (arg === '--no-force') {
      options.force = 'false';
      continue;
    }

    if (arg === '--force') {
      options.force = 'true';
      continue;
    }

    if (arg === '--env-provider-keys') {
      options.envProviderKeys = 'true';
      continue;
    }

    if (arg === '--no-env-provider-keys') {
      options.envProviderKeys = 'false';
      continue;
    }

    if (arg === '--finalize-unknown') {
      options.finalizeUnknown = 'true';
      continue;
    }

    if (arg === '--no-finalize-unknown') {
      options.finalizeUnknown = 'false';
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}". Use --help for usage.`);
    }

    const optionText = arg.slice(2);
    const [rawName, inlineValue] = optionText.split(/=(.*)/s, 2);
    const name = normalizeOptionName(rawName);
    const value = inlineValue ?? argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawName}.`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    if (name === 'provider') {
      options.providers.push(value);
    } else if (name === 'providers') {
      options.providers.push(...value.split(',').map(provider => provider.trim()).filter(Boolean));
    } else {
      options[name] = value;
    }
  }

  return options;
}

function usage() {
  return `Usage:
  npm run status:models -- [options]
  node scripts/update-model-status.mjs [options]

Defaults:
  --base-url  MODEL_STATUS_BASE_URL, OPENPROVIDER_STATUS_BASE_URL, NEXTAUTH_URL, NEXT_PUBLIC_SITE_URL, or http://localhost:3000
  --force     true
  --batch-size 25, keeping long all-model refreshes below server request limits

Options:
  --batch-size <n>                Models to check per request. Use 0 with --single-request for one large request.
  --provider <id>                 Check one provider. Can be repeated.
  --providers <id,id>             Check several providers sequentially.
  --user-id <id>                  Use this saved-key user when CRON_SECRET is present.
  --env-provider-keys             Use provider keys from .env/.env.local. Default: true.
  --no-env-provider-keys          Ignore env provider keys and use signed-in/saved/public config.
  --finalize-unknown              After retries, persist hard model/route failures as failing and inconclusive/account failures as unknown.
  --no-finalize-unknown           Keep exhausted soft probe failures as unknown. Default.
  --no-force                      Only check stale models.
  --single-request                Call the status endpoint once instead of chunking.
  --no-split-providers            For all-provider runs, batch against provider=all instead of one provider at a time.
  --limit <n>                     Endpoint limit for --single-request mode.
  --concurrency <n>
  --timeout-ms <ms>
  --budget-ms <ms>
  --provider-delay-ms <ms>
  --slow-retry-concurrency <n>
  --slow-retry-timeout-ms <ms>
  --soft-failure-threshold <n>
  --stale-hours <n>
  --status <unknown|working|failing> Only check models currently in one status.
  --json                          Print raw JSON response.`;
}

function normalizeBaseUrl(raw) {
  if (!raw) {
    return 'http://localhost:3000';
  }

  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/i.test(trimmed);
  return `${isLocal ? 'http' : 'https'}://${trimmed}`;
}

function selectedBaseUrl(options) {
  return normalizeBaseUrl(
    options.baseUrl ||
    process.env.MODEL_STATUS_BASE_URL ||
    process.env.OPENPROVIDER_STATUS_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL
  );
}

function statusUrl(baseUrl, options, provider) {
  const url = new URL('/api/cron/model-status', baseUrl);
  if (provider) {
    url.searchParams.set('provider', provider);
  }

  for (const option of queryOptions) {
    const value = options[option];
    if (value !== undefined && value !== '') {
      url.searchParams.set(option, value);
    }
  }

  return url;
}

function printRunSummary(data) {
  const statusLine = [
    `provider=${data.provider}`,
    `credentialSource=${data.credentialSource}`,
    `selected=${data.selectedCount}`,
    `checked=${data.checkedCount}`,
    `working=${data.workingCount}`,
    `failing=${data.failingCount}`,
    `unknown=${data.unknownCount}`,
    `softFailures=${data.softFailureCount}`,
    `remainingDue=${data.remainingDueCount}`,
  ].join(' ');

  console.log(statusLine);

  const failedDiscovery = data.providerResults
    ?.filter(result => !result.ok && !result.skipped)
    .map(result => `${result.provider}: ${result.error ?? `status ${result.status ?? 'unknown'}`}`);

  if (failedDiscovery?.length) {
    console.log('\nDiscovery warnings:');
    for (const warning of failedDiscovery) {
      console.log(`- ${warning}`);
    }
  }
}

async function fetchStatusUpdate(baseUrl, options, provider, overrides = {}) {
  const url = statusUrl(baseUrl, options, provider);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {};
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message ?? data?.error ?? text;
    throw new Error(`Status update failed (${response.status}): ${message}`);
  }

  return data;
}

async function runSingleStatusUpdate(baseUrl, options, provider) {
  console.log(`\nChecking ${provider ?? 'all providers'} via ${baseUrl}`);
  const data = await fetchStatusUpdate(baseUrl, options, provider);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    printRunSummary(data);
  }
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function collectOutcomes(target, data) {
  for (const result of data.results ?? []) {
    if (result.modelId) {
      target.set(result.modelId.toLowerCase(), result.outcome ?? 'unknown');
    }
  }
}

function aggregateOutcomeCounts(outcomes) {
  const counts = { working: 0, failing: 0, unknown: 0 };
  for (const outcome of outcomes.values()) {
    if (outcome === 'working') {
      counts.working += 1;
    } else if (outcome === 'failing') {
      counts.failing += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

async function runBatchedStatusUpdate(baseUrl, options, provider) {
  const batchSize = positiveInt(options.batchSize, 25);
  const outcomes = new Map();
  let targetCount = 0;
  let pass = 0;
  let maxPasses = 1;

  console.log(`\nChecking ${provider ?? 'all providers'} via ${baseUrl} in batches of ${batchSize}`);

  while (pass < maxPasses) {
    pass += 1;
    const beforeCount = outcomes.size;
    const data = await fetchStatusUpdate(baseUrl, options, provider, {
      limit: batchSize,
      exclude: outcomes.size > 0 ? [...outcomes.keys()].join(',') : undefined,
    });

    targetCount = Math.max(targetCount, data.checkableCount ?? 0);
    maxPasses = Math.max(maxPasses, Math.ceil((targetCount || batchSize) / batchSize) + 3);
    collectOutcomes(outcomes, data);

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(
        `batch=${pass} selected=${data.selectedCount} checked=${data.checkedCount} ` +
        `unique=${outcomes.size}/${targetCount || '?'} working=${data.workingCount} ` +
        `failing=${data.failingCount} softFailures=${data.softFailureCount}`
      );
    }

    const madeProgress = outcomes.size > beforeCount;
    const complete = targetCount > 0 && outcomes.size >= targetCount;
    if (complete || data.checkedCount === 0 || !madeProgress) {
      break;
    }
  }

  const counts = aggregateOutcomeCounts(outcomes);
  console.log(
    `Finished ${provider ?? 'all providers'}: uniqueChecked=${outcomes.size}/${targetCount || '?'} ` +
    `working=${counts.working} failing=${counts.failing} unknown=${counts.unknown} passes=${pass}`
  );
}

async function discoverProvidersForStatus(baseUrl, options) {
  console.log(`\nDiscovering providers via ${baseUrl}`);
  const data = await fetchStatusUpdate(baseUrl, options, undefined, { limit: 1 });
  const providers = (data.providerResults ?? [])
    .filter(result => !result.skipped && result.modelCount > 0)
    .map(result => result.provider)
    .filter(Boolean);

  return [...new Set(providers)];
}

loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, '.env'));

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const baseUrl = selectedBaseUrl(options);
let providers = options.providers.length > 0 ? options.providers : [undefined];

if (options.userId && !process.env.CRON_SECRET?.trim()) {
  console.warn('Warning: --user-id is only honored by the API when CRON_SECRET is configured.');
}

try {
  if (
    providers.length === 1 &&
    providers[0] === undefined &&
    options.splitProviders &&
    !options.singleRequest &&
    options.batchSize !== '0'
  ) {
    const discoveredProviders = await discoverProvidersForStatus(baseUrl, options);
    if (discoveredProviders.length > 0) {
      providers = discoveredProviders;
      console.log(`Discovered ${providers.length} providers with models.`);
    }
  }

  for (const provider of providers) {
    if (options.singleRequest || options.batchSize === '0') {
      await runSingleStatusUpdate(baseUrl, options, provider);
    } else {
      await runBatchedStatusUpdate(baseUrl, options, provider);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
