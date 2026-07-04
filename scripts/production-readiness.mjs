const required = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXTAUTH_SECRET',
  'OPENPROVIDER_KEY_ENCRYPTION_SECRET',
  'OPENPROVIDER_API_KEY_HASH_SECRET',
  'CRON_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

const secretNames = [
  'NEXTAUTH_SECRET',
  'OPENPROVIDER_KEY_ENCRYPTION_SECRET',
  'OPENPROVIDER_API_KEY_HASH_SECRET',
  'CRON_SECRET',
];

const failures = [];
const warnings = [];

function value(name) {
  if (name === 'DATABASE_URL') {
    return (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim() ?? '';
  }
  if (name === 'NEXTAUTH_URL') {
    return (process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''))?.trim() ?? '';
  }
  if (name === 'NEXT_PUBLIC_SITE_URL') {
    return (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')))?.trim() ?? '';
  }
  return process.env[name]?.trim() ?? '';
}

function isPlaceholder(raw) {
  return /replace_|your_|example|changeme|change_me|placeholder/i.test(raw);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function validateHttpsUrl(name) {
  const raw = value(name);
  if (!raw) {
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${name} must be a valid absolute URL.`);
    return;
  }

  if (url.protocol !== 'https:') {
    fail(`${name} must use https:// in production.`);
  }

  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    fail(`${name} must not point to a local development host in production.`);
  }
}

for (const name of required) {
  const raw = value(name);
  if (!raw) {
    fail(`${name} is required.`);
  } else if (isPlaceholder(raw)) {
    fail(`${name} still looks like a placeholder value.`);
  }
}

for (const name of secretNames) {
  const raw = value(name);
  if (raw && raw.length < 32) {
    fail(`${name} should be at least 32 characters.`);
  }
}

if (value('NEXTAUTH_SECRET') && value('OPENPROVIDER_KEY_ENCRYPTION_SECRET') === value('NEXTAUTH_SECRET')) {
  fail('OPENPROVIDER_KEY_ENCRYPTION_SECRET must be separate from NEXTAUTH_SECRET.');
}

if (value('NEXTAUTH_SECRET') && value('OPENPROVIDER_API_KEY_HASH_SECRET') === value('NEXTAUTH_SECRET')) {
  fail('OPENPROVIDER_API_KEY_HASH_SECRET must be separate from NEXTAUTH_SECRET.');
}

if (value('OPENPROVIDER_API_KEY_HASH_SECRET') && value('OPENPROVIDER_API_KEY_HASH_SECRET') === value('OPENPROVIDER_KEY_ENCRYPTION_SECRET')) {
  fail('OPENPROVIDER_API_KEY_HASH_SECRET must be separate from OPENPROVIDER_KEY_ENCRYPTION_SECRET.');
}

validateHttpsUrl('NEXTAUTH_URL');
validateHttpsUrl('NEXT_PUBLIC_SITE_URL');

if (!value('OPENPROVIDER_V1_CORS_ORIGINS')) {
  warn('OPENPROVIDER_V1_CORS_ORIGINS is empty. Browser apps will not be allowed to call /v1/* cross-origin.');
}

if (failures.length > 0) {
  console.error('Production readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  if (warnings.length > 0) {
    console.error('\nWarnings:');
    for (const message of warnings) {
      console.error(`- ${message}`);
    }
  }

  process.exit(1);
}

console.log('Production readiness check passed.');
if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const message of warnings) {
    console.log(`- ${message}`);
  }
}
