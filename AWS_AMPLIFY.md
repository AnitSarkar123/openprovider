# AWS Amplify Hosting

This project is prepared for AWS Amplify Hosting as the closest AWS equivalent to a Vercel-style GitHub deploy.

Amplify will:

- connect to the GitHub repository
- run the root `amplify.yml` build
- deploy the Next.js app from `.next`
- manage HTTPS for the default `amplifyapp.com` domain and custom domains
- store environment variables in the Amplify app settings

## Current Compatibility Note

The app currently uses Next.js 16.2.4. As of May 20, 2026, AWS Amplify's official Next.js SSR docs list managed support through Next.js 15. If the first Amplify deployment fails because of framework support, the least risky fix is to deploy from a test branch that downgrades `next`, `react`, and `react-dom` to supported Next.js 15 versions, then verify the app before merging.

## Build Settings

The repository includes `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm use 22
        - npm ci
    build:
      commands:
        - env | grep -e DATABASE_URL -e NEXTAUTH_URL -e NEXTAUTH_SECRET -e AUTH_SECRET -e GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET -e NEXT_PUBLIC_SITE_URL -e NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT -e OPENPROVIDER_BASE_URL -e OPENPROVIDER_V1_CORS_ORIGINS -e OPENPROVIDER_KEY_ENCRYPTION_SECRET -e OPENPROVIDER_API_KEY_HASH_SECRET -e OPENROUTER_API_KEY -e CRON_SECRET -e OPENPROVIDER_DEFAULT_MODEL -e OPENPROVIDER_AUTO_MODEL -e OPENPROVIDER_TIMEOUT_MS -e OPENPROVIDER_MODEL_SYNC_TTL_MS -e OPENPROVIDER_FREE_MODELS_ONLY -e OPENPROVIDERGATEWAY_URL -e OPENPROVIDER_FREE_ROUTE_CATALOG_URLS -e OPENPROVIDER_FREE_ROUTE_BASE_URLS -e OPENPROVIDER_RATE_LIMIT_ -e OPENPROVIDER_STATUS_BASE_URL -e NVIDIA_IMAGE_BASE_URL -e MODEL_STATUS_ >> .env.production || true
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

Use the Amazon Linux 2023 build image in Amplify. Node.js 22 is pinned because Amplify supports Node.js 20, 22, and 24 for Next.js compute apps.

The `.env.production` line is required for Next.js SSR on Amplify. Amplify makes variables available during the build, but server-side Next.js runtime code does not receive them automatically unless they are written into a Next.js env file before the build.

## Minimum Production Environment Without Database

For a public deployment without saved user data, do not set `DATABASE_URL`.

Set these in Amplify: `App settings -> Environment variables`.

```env
NEXTAUTH_URL=https://openprovider.mimika.in
NEXT_PUBLIC_SITE_URL=https://openprovider.mimika.in
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
OPENPROVIDER_BASE_URL=https://openprovider.mimika.in/v1
OPENPROVIDER_V1_CORS_ORIGINS=https://openprovider.mimika.in
OPENPROVIDER_DEFAULT_MODEL=auto
OPENPROVIDER_AUTO_MODEL=auto
OPENPROVIDER_TIMEOUT_MS=60000
OPENPROVIDER_MODEL_SYNC_TTL_MS=3600000
OPENPROVIDER_FREE_MODELS_ONLY=true
```

Optional, only if Google sign-in should work:

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

Optional, only useful when database-backed account features are enabled later:

```env
OPENPROVIDER_KEY_ENCRYPTION_SECRET=generate_with_openssl_rand_base64_32
OPENPROVIDER_API_KEY_HASH_SECRET=generate_with_openssl_rand_base64_32
CRON_SECRET=generate_with_openssl_rand_base64_32
```

## AWS Console Steps

1. Open AWS Amplify Hosting and choose `Create new app`.
2. Choose GitHub, authorize the repository, and select the production branch.
3. On app settings, confirm framework detection is Next.js SSR / Web Compute.
4. Use the existing `amplify.yml` from the repo.
5. Choose `Create and use a new service role`.
6. Add the production environment variables above.
7. Choose `Save and deploy`.
8. After the default Amplify URL works, open `Hosting -> Custom domains`.
9. Add `openprovider.mimika.in` as the custom domain.
10. Set `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, and `OPENPROVIDER_BASE_URL` to `https://openprovider.mimika.in`, then redeploy.

## No-Database Limitations

Without `DATABASE_URL`, the public pages and `/v1/*` routes can still run, but database-backed account features cannot persist data. That means saved provider keys, generated OpenProvider API keys, saved models, and chat history need a database before they can work reliably in production.
