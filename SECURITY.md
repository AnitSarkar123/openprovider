# Security

OpenProvider keeps provider credentials on the server and exposes an OpenAI-compatible gateway through generated OpenProvider API keys.

## Supported Versions

Security fixes are applied to the default branch and active release branches. If you deploy from a fork, keep your branch current before reporting an issue.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities that expose credentials, authentication bypasses, SSRF paths, or data leaks.

Send a private report to the project maintainer with:

- the affected route, component, or provider adapter
- clear reproduction steps
- expected and actual behavior
- any logs with secrets removed

## Deployment Secrets

Production deployments must configure these platform secrets:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OPENPROVIDER_KEY_ENCRYPTION_SECRET`
- `OPENPROVIDER_API_KEY_HASH_SECRET`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Provider credentials should be saved from Account -> Provider setup. They are encrypted before storage. The VS Code sign-in flow posts the signed-in user's direct provider credential bundle once to the local loopback callback so VS Code can call providers directly.

## API Security Model

- Browser calls to `/v1/*` require an allowed origin through `OPENPROVIDER_V1_CORS_ORIGINS`.
- Server-to-server clients call `/v1/*` with generated OpenProvider API keys.
- Browser and server clients should call `/v1/*` with OpenProvider API keys. The VS Code extension is the provider-native exception: it receives credentials during sign-in and stores them in VS Code SecretStorage.
- Interactive app APIs such as chat and media playground routes require a signed-in session.
- Remote image analysis uses SSRF-safe fetching and blocks private network targets.
- `proxy.ts` applies an app-level rate guard before route handlers run. By default, `/v1/*` allows the OpenProviderVSCode client profile but temporarily blocks a client/API-key identity after `100` requests in `1` second or `600` requests in `60` seconds. Tune the `OPENPROVIDER_RATE_LIMIT_*` environment variables for your deployment.

App-level rate limiting is a last-mile guard inside the running app. Production deployments should still enable provider/platform DDoS protection or WAF rules for volumetric network attacks before traffic reaches the app runtime.

## Verification

Run these checks before deployment or security-sensitive changes:

```sh
npm run production:check
npm run typecheck
npm run security:audit
npm run verify
```

`npm run security:audit` is a static guard for high-risk regressions such as wildcard CORS, raw request bodies, dangerous OAuth linking, missing production secrets, and unsafe image fetching.

`npm run production:check` validates required production secrets, checks public URLs, and warns when browser CORS origins are not configured.
