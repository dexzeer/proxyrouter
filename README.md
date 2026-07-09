<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./src-tauri/icons/proxyrouter-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="./src-tauri/icons/proxyrouter-light.png">
  <img alt="ProxyRouter" src="./src-tauri/icons/proxyrouter-light.png" width="600">
</picture>

# ProxyRouter

**A lightweight local AI proxy that unifies multiple providers behind a single OpenAI-compatible endpoint.**

</div>

---

## What it does

ProxyRouter sits between your AI tools and provider APIs. You add providers (OpenAI, Anthropic, Google, DeepSeek, Xiaomi, Mistral, and 150+ more via models.dev), pick which models to expose, and point your tools at `localhost:7144` — one API key, one endpoint, every model.

## Features

- **150+ providers** pulled from [models.dev](https://models.dev) — OpenAI, Anthropic, Google, DeepSeek, Xiaomi, Mistral, Cohere, Meta, and many more
- **Single OpenAI-compatible endpoint** — works with any tool that speaks the OpenAI API format
- **One API key** — generate, copy, reset. Your tools only need this one key
- **Model routing** — route requests to any provider by model name
- **Duplicate resolution** — when multiple providers serve the same model, pick which one handles it
- **Dark minimal UI** — 400×500 window with custom title bar, sidebar navigation
- **Persistent config** — everything saved to `~/.ai-gateway/config.json`
- **Zero dependencies for users** — just install and run

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (for building the Tauri app)

### Install & run

```bash
git clone https://github.com/dexzeer/proxyrouter.git
cd proxyrouter
npm install
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

The installer will be in `src-tauri/release/`.

### Download standalone .exe from [Releases](https://github.com/dexzeer/proxyrouter/releases)

## Usage

1. **Add a provider** — go to Providers, pick one from the list, enter your API key
2. **Select models** — check the models you want to route through the proxy
3. **Start the server** — go to Server, click Start
4. **Point your tools** at `http://localhost:7144/v1` with your proxy API key

### Example: curl

```bash
curl http://localhost:7144/v1/chat/completions \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "hello"}]}'
```

### Example: OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:7144/v1",
    api_key="YOUR_PROXY_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "hello"}],
)
print(response.choices[0].message.content)
```

### Example: OpenCode

Add to your config:

```json
{
  "provider": {
    "proxyrouter": {
      "name": "Proxy Router",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7144/v1",
        "apiKey": "YOUR_PROXY_KEY"
      },
      "models": {
        "gpt-4o": { "name": "GPT-4o" },
        "claude-sonnet-4-0": { "name": "Claude Sonnet 4" },
        "gemini-2.5-pro": { "name": "Gemini 2.5 Pro" }
      }
    }
  }
}
```

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Your Tools  │────▶│  ProxyRouter  │────▶│  Provider APIs  │
│  (localhost) │     │  :7144        │     │  OpenAI, etc.   │
└─────────────┘     └──────────────┘     └─────────────────┘
```

1. Your tool sends a request to `localhost:7144/v1/chat/completions`
2. ProxyRouter authenticates with your proxy API key
3. It looks up which provider handles the requested model
4. Forwards the request to the upstream provider with their API key
5. Returns the response back to your tool

## Configuration

Config is saved at `~/.ai-gateway/config.json`:

```json
{
  "proxyPort": 7144,
  "proxyApiKey": "sk-...",
  "modelPriorities": {
    "deepseek-v4-flash": "deepseek"
  },
  "providers": [
    {
      "id": "...",
      "name": "OpenAI",
      "providerId": "openai",
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true,
      "selectedModels": ["openai/gpt-4o", "openai/gpt-4o-mini"]
    }
  ]
}
```

## Tech stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Rust, Tauri v2, Hyper (HTTP server), Reqwest (HTTP client)
- **Provider database**: [models.dev](https://models.dev)

## License

[Apache 2.0](LICENSE)
