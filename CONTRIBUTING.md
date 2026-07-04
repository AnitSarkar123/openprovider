# Contributing

Thanks for helping improve OpenProvider.

OpenProvider is a free-model LLM gateway, so contributions should keep provider keys server-side, preserve OpenAI-compatible behavior, and avoid exposing paid models when free-only mode is enabled.

## Development Setup

```sh
npm install
cp .env.example .env
npm run build
npm run test:providers
```

You only need keys for the providers you want to test. Providers without keys are skipped.

## Before Opening a Pull Request

- Run `npm run build`.
- Run `npm run lint`.
- Run `npm run security:audit` when changing auth, API routes, provider credentials, request parsing, CORS, or remote media fetching.
- Run `npm run verify` before dependency upgrades or production deploy changes.
- Run `npm run test:providers` when changing provider discovery, routing, env loading, or model filtering.
- Do not commit `.env` or provider API keys.
- Keep changes scoped to the provider, router, server, or docs area you are touching.
- Follow `ARCHITECTURE.md` when adding routes, components, or shared helpers.
- Update `README.md` and `.env.example` when adding or changing provider configuration.

## Adding a Provider

1. Add the provider id to `ProviderId` in `src/core/types.ts`.
2. Add env loading and default base URLs in `src/config/env.ts`.
3. Add discovery path handling in `src/core/providerDiscovery.ts`.
4. Add parser support in `src/core/modelDiscovery.ts` if the provider response shape is different.
5. Add a fallback provider definition under `src/providers/`.
6. Register the provider in `src/core/modelRegistry.ts`.
7. Document the provider in `README.md` and `.env.example`.
8. Verify with `npm run test:providers`.

## Free-Only Policy

OpenProvider should expose only free or free-allocation models by default.

- If a provider exposes pricing metadata, paid models must be filtered out.
- OpenRouter models should require explicit free markers or zero pricing.
- Non-chat models such as embeddings, rerank, OCR, audio, image, moderation, TTS, ASR, and transcription should be filtered out.
- If a provider has a free daily allocation but paid overage, document that clearly.

## Security

- Never print, log, or commit API keys.
- Keep platform secrets in `.env` or deployment secrets only.
- Save provider credentials through Account -> Provider setup so they stay encrypted per user.
- Do not add client-side code that talks directly to provider APIs.
- Treat provider response bodies carefully because error messages can sometimes include account details.
- Read `SECURITY.md` before changing authentication, API key handling, CORS, or credential storage.

## Commit Style

Use short, descriptive commit messages:

```txt
add cloudflare workers ai provider
fix cohere chat model discovery
document provider setup
```
