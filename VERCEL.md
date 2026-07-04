# Deploying to Vercel

This project supports automated deployment on **Vercel** with full database integration and zero-configuration schema migrations.

---

## 1. Quick Deploy (One-Click)

To deploy OpenProvider directly to Vercel, you can click the **Deploy** button in the repository README.

The Deploy Button will:
- Clone this repository into your GitHub account.
- Prompt you for the necessary environment variables.
- Connect to Vercel's build pipeline and deploy the application.

---

## 2. Setting Up a Database

Database features like user keys, models, history, and API keys require a PostgreSQL database.

1. Once your project is created in Vercel, go to your project dashboard.
2. Select the **Storage** tab.
3. Click **Connect Database** and choose a Postgres provider (we recommend **Neon**).
4. Vercel will automatically provision the database and inject `DATABASE_URL` and `POSTGRES_URL` into your project's Environment Variables.
5. Trigger a new deployment (or Vercel will do it automatically) to apply the database schema.

---

## 3. Automatic Migrations

OpenProvider is configured to run database migrations automatically. During the build phase (`npm run build`), a script `scripts/db-migrate.mjs` checks for database variables:
- If `DATABASE_URL` or `POSTGRES_URL` is configured, it automatically runs `drizzle-kit migrate` before building the Next.js app.
- If no database connection is configured, it skips the migration step gracefully, allowing the app to run in a public-gateway mode without database persistence.

---

## 4. Environment Variables Reference

When deploying, Vercel automatically populates `VERCEL_URL` and `NEXT_PUBLIC_VERCEL_URL`, which OpenProvider uses as fallbacks. You only need to manually configure the following variables in Vercel:

| Variable | Description | Required? | Example / Notes |
| :--- | :--- | :--- | :--- |
| `NEXTAUTH_SECRET` | Secret key used to encrypt Auth cookies | Yes | Generate using `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Optional | For enabling Google Account login |
| `GOOGLE_CLIENT_SECRET`| Google OAuth Client Secret | Optional | For enabling Google Account login |
| `OPENROUTER_API_KEY` | OpenRouter gateway credentials | Optional | For routing calls to OpenRouter |
| `OPENPROVIDER_FREE_MODELS_ONLY` | If true, only exposes free models | Optional | Defaults to `true` |
| `OPENPROVIDER_KEY_ENCRYPTION_SECRET` | Key used to encrypt provider keys | Optional | Generate using `openssl rand -base64 32` (Required for DB-backed features) |
| `OPENPROVIDER_API_KEY_HASH_SECRET` | Key used to hash client API keys | Optional | Generate using `openssl rand -base64 32` (Required for DB-backed features) |
| `CRON_SECRET` | Secret key for cron update routes | Optional | Generate using `openssl rand -base64 32` |

---

## 5. Custom Domain & Production Setup

If you attach a custom domain (e.g. `example.com`) to your Vercel project, update the following environment variables in your Vercel Project Settings to ensure CORS and authentication callback URLs resolve correctly:
- `NEXT_PUBLIC_SITE_URL=https://example.com`
- `NEXTAUTH_URL=https://example.com`
- `OPENPROVIDER_BASE_URL=https://example.com/v1`

Redeploy the project after modifying these variables to apply them.
