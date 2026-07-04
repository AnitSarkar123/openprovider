import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourceRoots = ['app', 'lib', 'src'];
const ignoredDirs = new Set(['.git', '.next', 'dist', 'node_modules']);
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function walk(path) {
  const absolute = join(root, path);
  const stats = statSync(absolute);

  if (stats.isDirectory()) {
    if (ignoredDirs.has(path.split('/').at(-1))) {
      return [];
    }

    return readdirSync(absolute).flatMap(entry => walk(`${path}/${entry}`));
  }

  return [path];
}

const sourceFiles = [
  'proxy.ts',
  ...sourceRoots.flatMap(path => walk(path)),
].filter(path => /\.(?:ts|tsx|js|mjs|cjs)$/.test(path));

function fail(message) {
  failures.push(message);
}

function assertContains(file, pattern, message) {
  if (!pattern.test(read(file))) {
    fail(`${file}: ${message}`);
  }
}

function assertNotContains(files, pattern, message) {
  for (const file of files) {
    if (pattern.test(read(file))) {
      fail(`${file}: ${message}`);
    }
  }
}

assertNotContains(
  ['lib/auth.ts'],
  /allowDangerousEmailAccountLinking/,
  'dangerous OAuth account linking must stay disabled'
);

assertNotContains(
  sourceFiles,
  /request\.json\s*\(/,
  'use bounded JSON parsing instead of raw request.json()'
);

assertNotContains(
  ['proxy.ts', 'src/server/apiServer.ts'],
  /Access-Control-Allow-Origin['"]?\s*,\s*['"]\*/,
  'wildcard CORS is not allowed for OpenProvider APIs'
);

assertContains(
  'proxy.ts',
  /OPENPROVIDER_V1_CORS_ORIGINS/,
  'Next proxy must enforce the /v1 browser CORS allowlist'
);

assertContains(
  'src/server/apiServer.ts',
  /OPENPROVIDER_V1_CORS_ORIGINS/,
  'standalone gateway must enforce the /v1 browser CORS allowlist'
);

assertContains(
  'lib/openprovider/provider-keys.ts',
  /NODE_ENV === 'production'[\s\S]*OPENPROVIDER_KEY_ENCRYPTION_SECRET/,
  'production provider credentials must require a dedicated encryption secret'
);

assertContains(
  'lib/openprovider/api-keys.ts',
  /OPENPROVIDER_API_KEY_HASH_SECRET[\s\S]*hmac-sha256:/,
  'OpenProvider API keys must support peppered HMAC hashes'
);

assertContains(
  'app/api/cron/model-status/route.ts',
  /CRON_SECRET[\s\S]*NODE_ENV === 'production'/,
  'production cron access must require CRON_SECRET'
);

assertContains(
  'src/server/providerImageToText.ts',
  /safeRemoteImage/,
  'remote image analysis must use SSRF-safe image fetching'
);

assertContains(
  'lib/openprovider/request-body.ts',
  /readJsonObject/,
  'OpenProvider request body parsing must stay bounded'
);

for (const route of [
  'app/api/chat/route.ts',
  'app/api/media/image/route.ts',
  'app/api/media/speech/route.ts',
  'app/api/media/vision/route.ts',
]) {
  assertContains(
    route,
    /getServerSession[\s\S]*status:\s*401/,
    'interactive provider-backed API routes must require a signed-in user'
  );
}

assertNotContains(
  ['lib/openprovider/route-errors.ts', 'app/v1/chat/completions/route.ts', 'app/api/chat/route.ts', 'src/server/apiServer.ts'],
  /detail:\s*error/,
  'client errors must not expose raw provider exception details'
);

if (failures.length > 0) {
  console.error('Security audit failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Security audit passed (${sourceFiles.length} source files scanned).`);
