# <img src="./public/brand/openprovider-icon.png" width="38" valign="middle" /> OpenProvider

> **A unified, OpenAI-compatible LLM gateway with dynamic auto-routing across 24 free-tier AI providers.**

---

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![Next.js Version](https://img.shields.io/badge/Next.js-16.2.4-black.svg?style=flat&logo=nextdotjs)](https://nextjs.org/) [![Database](https://img.shields.io/badge/Database-PostgreSQL-blue?style=flat&logo=postgresql)](https://www.postgresql.org/) [![ORM](https://img.shields.io/badge/ORM-Drizzle-orange?style=flat&logo=drizzle)](https://orm.drizzle.team/) [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvkop007%2FOpenProvider&env=NEXTAUTH_SECRET,OPENPROVIDER_KEY_ENCRYPTION_SECRET,OPENPROVIDER_API_KEY_HASH_SECRET)

OpenProvider is a lightweight, local or cloud-hosted OpenAI-compatible gateway. It enables developers to access, explore, and route chat, image, audio, and vision requests across multiple AI providers using **one single API interface**. 

It automatically filters provider catalogs to **free and free-allocation models**, lets users manage their credentials securely via a web dashboard, and supports `model: "auto"` for intelligent, cost-free request routing.

---

## 📖 Table of Contents

- [🚀 Why OpenProvider?](#-why-openprovider)
- [✨ Features](#-features)
- [🏗️ Architecture](#-architecture)
- [🚀 One-Click Deployment](#-one-click-deployment)
- [📦 Quick Start](#-quick-start)
- [⚙️ Environment Configuration](#-environment-configuration)
- [🔌 Supported Providers](#-supported-providers)
- [🧪 API Endpoints & Usage](#-api-endpoints--usage)
- [📂 Source Layout](#-source-layout)
- [🛡️ Security & Production readiness](#️-security--production-readiness)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 🚀 Why OpenProvider?

Managing API keys, parsing dynamic catalogs, and handling rate limits across different AI companies is painful. OpenProvider handles the complexity for you:
* **One Client to Rule Them All:** Replace multiple SDKs with a single OpenAI client.
* **Zero Cost-by-Default:** Exposes only models marked as free, zero-priced, or covered by free trial quotas.
* **Auto-Routing:** Send `"model": "auto"` and the gateway will automatically pick an available free provider.
* **Privacy First:** Your API keys are encrypted in your database using AES-256 and never shared with the frontend.

---

## ✨ Features

- **Standardized API Surface:** Compatible with standard OpenAI clients for `/v1/chat/completions`, `/v1/models`, and more.
- **Auto-Discovery:** Automatically queries and normalizes models from 24 providers on the fly.
- **Multi-Modal Capabilities:** Supports Chat, Image Generation, Image Analysis (Vision/OCR), and Audio (Text-to-Speech).
- **Interactive UI:** Next.js dashboard featuring search, status sweeps, playgrounds, and account-level credential settings.
- **Failover & Retries:** Bypasses failing models dynamically to route to active providers.
- **Secured API Keys:** Generate local OpenProvider API keys to authenticate external local scripts or VS Code extensions.

---

## 🏗️ Architecture

```txt
  ┌────────────────────────────────────────────────────────┐
  │                   Client Application                   │
  │     (VS Code Extension, Terminal, Python Script)        │
  └──────────────────────────┬─────────────────────────────┘
                             │ (v1/chat/completions)
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │                 OpenProvider Gateway                   │
  │                                                        │
  │   1. Read cache (Disk/Memory)                          │
  │   2. Resolve "model: auto" or explicit model path      │
  │   3. Apply user-encrypted keys from Postgres           │
  │   4. Handle routing & downstream failures              │
  └───────────────┬──────────┬──────────┬──────────┬───────┘
                  │          │          │          │
                  ▼          ▼          ▼          ▼
             ┌─────────┐┌─────────┐┌─────────┐┌─────────┐
             │ NVIDIA  ││  Groq   ││MistralAI││  Z.AI   │ ...
             └─────────┘└─────────┘└─────────┘└─────────┘
```

---

## 🚀 One-Click Deployment

Deploy OpenProvider to Vercel with zero configuration:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvkop007%2FOpenProvider&env=NEXTAUTH_SECRET,OPENPROVIDER_KEY_ENCRYPTION_SECRET,OPENPROVIDER_API_KEY_HASH_SECRET)

For a detailed step-by-step guide on configuring a Postgres database on Vercel, running migrations, and setting up custom domains, see [VERCEL.md](file:///Users/vk/dev/OpenProvider/VERCEL.md).

For AWS deployments, see [AWS_AMPLIFY.md](file:///Users/vk/dev/OpenProvider/AWS_AMPLIFY.md).

---

## 📦 Quick Start

Follow these 4 simple steps to run OpenProvider locally:

### 1. Clone & Install
```bash
git clone https://github.com/your-username/OpenProvider.git
cd OpenProvider
npm install
```

### 2. Configure Environment
Create a `.env` file from the template:
```bash
cp .env.example .env
```
Open `.env` and fill in your PostgreSQL `DATABASE_URL` (e.g. from a free Neon Database instance) and OAuth secrets. See [Environment Configuration](#-environment-configuration) for help.

### 3. Deploy Database Schema
Deploy database tables and schemas via Drizzle:
```bash
npm run db:migrate
```

### 4. Start Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser. Go to `Account -> Provider Setup` to enter your free provider API keys.

---

## ⚙️ Environment Configuration

OpenProvider separates infrastructure secrets (.env) from provider credentials (managed securely in the Web UI).

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | | Yes |
| `NEXTAUTH_URL` | URL of your deployed application | `http://localhost:3000` | Yes |
| `NEXTAUTH_SECRET` | Auth.js secret key (`openssl rand -base64 32`) | | Yes |
| `OPENPROVIDER_KEY_ENCRYPTION_SECRET` | Key used to encrypt provider credentials | | Yes |
| `OPENPROVIDER_API_KEY_HASH_SECRET` | Pepper used to securely hash generated API keys | | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for sign-in | | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | | Yes |

---

## 🔌 Supported Providers (24 Total)

OpenProvider wraps **24 dynamic and static AI providers and proxies**. You can configure your own credentials for these services in the **Account -> Provider setup** tab of the web UI.

### 🔑 User-Configured Providers (Requires API Keys)

| Provider | Key Field Name | Where to get the key | Default Base URL |
| :--- | :--- | :--- | :--- |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | [NVIDIA build](https://build.nvidia.com/) | `https://integrate.api.nvidia.com/v1` |
| **Groq** | `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) | `https://api.groq.com/openai/v1` |
| **Cloudflare Workers AI** | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | [Cloudflare AI](https://developers.cloudflare.com/) | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` |
| **SambaNova Cloud** | `SAMBANOVA_API_KEY` | [SambaCloud Hub](https://cloud.sambanova.ai/) | `https://api.sambanova.ai/v1` |
| **SiliconFlow** | `SILICONFLOW_API_KEY` | [SiliconFlow Platform](https://cloud.siliconflow.com/) | `https://api.siliconflow.com/v1` |
| **Cohere** | `COHERE_API_KEY` | [Cohere Keys](https://dashboard.cohere.com/) | `https://api.cohere.ai/compatibility/v1` |
| **Mistral AI** | `MISTRAL_API_KEY` | [Mistral Studio](https://console.mistral.ai/) | `https://api.mistral.ai/v1` |
| **OpenRouter** | `OPENROUTER_API_KEY` | [OpenRouter Keys](https://openrouter.ai/settings/keys) | `https://openrouter.ai/api/v1` |
| **Cerebras** | `CERBES_API_KEY` or `CEREBRAS_API_KEY` | [Cerebras Cloud](https://cloud.cerebras.ai/) | `https://api.cerebras.ai/v1` |
| **Z.AI / GLM** | `ZAI_API_KEY` | [Z.AI Platform](https://z.ai/) | `https://api.z.ai/api/paas/v4` |
| **Google AI Studio** | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) | `https://generativelanguage.googleapis.com/v1beta/openai` |
| **ShuttleAI** | `SHUTTLEAI_API_KEY` | [ShuttleAI Dashboard](https://shuttleai.com/) | `https://api.shuttleai.com/v1` |
| **ATXP LLM Gateway** | `ATXP_CONNECTION` | [ATXP Accounts](https://accounts.atxp.ai) | `https://llm.atxp.ai/v1` |
| **FreeModel** | `FREEMODEL_API_KEY` | [FreeModel Dashboard](https://freemodel.dev/dashboard) | `https://api.freemodel.dev/v1` |
| **Puter** | `PUTER_AUTH_TOKEN` | [Puter Console](https://puter.com/dashboard) | `https://api.puter.com/puterai/openai/v1` |
| **Routeway** | `ROUTEWAY_API_KEY` | [Routeway Dashboard](https://routeway.ai/dashboard) | `https://api.routeway.ai/v1` |
| **LLMGateway** | `LLM_GATEWAY_API_KEY` | [LLMGateway Dashboard](https://llmgateway.io/dashboard) | `https://api.llmgateway.io/v1` |
| **ApiFreeLLM** | `APIFREELLM_API_KEY` | [ApiFreeLLM Access](https://apifreellm.com/en/api-access) | `https://apifreellm.com/api/v1` |
| **ZenMux** | `ZENMUX_API_KEY` | [ZenMux Dashboard](https://zenmux.ai/settings/keys) | `https://zenmux.ai/api/v1` |
| **Ollama (Ollama Cloud)** | `OLLAMA_API_KEY` | [Ollama Cloud Keys](https://ollama.com/settings/keys) | `https://ollama.com/v1` |
| **Hugging Face** | `HF_TOKEN` | [Hugging Face Settings](https://huggingface.co/settings/tokens) | `https://router.huggingface.co/v1` |

### 🌐 Optional-Key / Keyless Providers

These providers run out-of-the-box using public models or basic/local access, but accept optional keys to increase rate limits:

* **LLM7.io** (`LLM7_API_KEY`): Local or hosted OpenAI-compatible text/vision proxy.
* **Pollinations.ai** (`POLLINATIONS_API_KEY`): Image and text generation models (works keyless, but is rate-limited).
* **OpenProvider Auto-Free Router** (`OPENPROVIDER_FREE_API_KEY`): Dynamic routing using configured free model pools.
* **Ollama (Local)**: Can connect to a local instance running at `http://localhost:11434` without a key.

---

## 🧪 API Endpoints & Usage

OpenProvider runs a standard OpenAI-compatible web API server. Call it using standard curl requests, or point your LangChain, LlamaIndex, or OpenAI SDK client base URL to `http://localhost:3000/v1`.

### Endpoint Overview
* `GET  /health` — Basic health check (does not trigger syncs).
* `GET  /v1/models` — Lists all currently active free models.
* `POST /v1/chat/completions` — OpenAI-compatible chat.
* `POST /v1/images/generations` — Text-to-image generations.
* `POST /v1/images/analyze` — Image OCR & visual analysis.
* `POST /v1/audio/speech` — Text-to-speech generation.

---

### Code Examples

#### 1. Auto-Route Chat Request
Let OpenProvider automatically choose the best available free model to fulfill your request:
```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENPROVIDER_API_KEY" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": "Explain quantum computing in 1 sentence." }
    ]
  }'
```

#### 2. Explicitly Target a Specific Provider Model
You can specify a exact model ID in the format `provider/model-name`:
```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENPROVIDER_API_KEY" \
  -d '{
    "model": "cloudflare/@cf/meta/llama-3.2-3b-instruct",
    "messages": [
      { "role": "user", "content": "What is 2+2?" }
    ]
  }'
```

#### 3. Image Generation
```bash
curl http://127.0.0.1:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENPROVIDER_API_KEY" \
  -d '{
    "model": "auto",
    "prompt": "a high resolution render of a red apple on a desk",
    "steps": 4
  }'
```

---

## 📂 Source Layout

```txt
app/               # Next.js App Router (pages and API endpoints)
components/        # React components (Console, Playgrounds, Account panels)
lib/               # Library core utilities
  ├─ db/           # Database configurations, adapter, and schemas
  └─ openprovider/ # Catalog, key encryption, and api-key generation helpers
src/               # Gateway source files
  ├─ config/       # Environment variables validation
  ├─ core/         # Router logic, discovery, and registry
  ├─ providers/    # Individual provider API wrappers (NVIDIA, Groq, etc.)
  └─ server/       # Adaptors for Chat, Speech, Vision, and Image tasks
drizzle/           # Checked-in database SQL migration files
```

---

## 🛡️ Security & Production Readiness

If you are preparing to deploy this project in a production environment:
* **Encrypt Credentials:** Ensure `OPENPROVIDER_KEY_ENCRYPTION_SECRET` is generated securely (`openssl rand -base64 32`). This is required to encrypt provider keys using AES-256 before storing them in Postgres.
* **CORS Restrictions:** Configure `OPENPROVIDER_V1_CORS_ORIGINS` to allow only your web client domain to query `/v1/*` endpoints.
* **Run Verification Scripts:** Prior to pushing, execute the verification helper:
  ```bash
  npm run verify
  ```
  This runs typechecking, local Next.js builds, and a security audit sweep to enforce safety rules.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Ensure all code passes checks: `npm run verify`.
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## 📄 License

OpenProvider is open-source software licensed under the [MIT License](./LICENSE).
