# OpenProvider Architecture

This codebase uses the Next.js App Router. Keep route files thin and move implementation into domain modules.

## App Routes

`app/` owns route entrypoints only:

- `app/**/page.tsx` should compose page-level UI.
- `app/**/route.ts` should parse HTTP boundaries and delegate to `lib/**`.
- Route handlers with shared behavior should call a helper in `lib/routes`.

## Components

`components/` is grouped by product domain:

- `components/account` account settings and provider setup UI.
- `components/auth` session, sign-in, and avatar UI.
- `components/chat` chat console, transcript rendering, and chat sidebar.
- `components/layout` app shell and global layout controls.
- `components/media` image and speech playground UI.
- `components/models` model explorer, model detail, filters, snippets, and health UI.
- `components/providers` provider identity UI.
- `components/search` global model search.

Prefer direct domain imports such as `@/components/models/model-explorer` over broad barrel exports. This keeps bundle ownership clearer during upgrades.

## Library Code

`lib/openprovider` contains OpenProvider application services and provider-facing orchestration.

`lib/db` contains database client and schema.

`lib/http` contains HTTP response and cache helpers that are not tied to one route.

`lib/routes` contains shared route handlers used by multiple App Router endpoints.

`src/` contains the reusable gateway/runtime package: provider adapters, model discovery, routing core, CLI/server utilities, and low-level types.

## Validation

Use `npm run verify` before dependency upgrades, deployment changes, or broad refactors. It runs TypeScript validation, the security audit, and the production web and gateway builds.
