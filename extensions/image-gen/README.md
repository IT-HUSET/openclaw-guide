# image-gen

OpenClaw plugin that registers a `generate_image` tool for text-to-image generation via [OpenRouter](https://openrouter.ai).

## Setup

```bash
# 1. Install (no npm install needed — zero dependencies)
openclaw plugins install -l ./extensions/image-gen

# 2. Set API key
echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.openclaw/.env

# 3. Enable in openclaw.json
```

```json5
{
  plugins: {
    entries: {
      "image-gen": {
        enabled: true,
        config: {
          defaultModel: "openai/gpt-5-image-mini",
          defaultAspectRatio: "1:1",
          defaultImageSize: "2K"
        }
      }
    }
  }
}
```

Restart the gateway. Any agent that doesn't explicitly deny `generate_image` can now use it.

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `apiKey` | `$OPENROUTER_API_KEY` | OpenRouter API key |
| `baseUrl` | `https://openrouter.ai/api/v1` | API base URL (must be HTTPS) |
| `defaultModel` | `openai/gpt-5-image-mini` | Default model ID |
| `defaultAspectRatio` | `1:1` | Default aspect ratio |
| `defaultImageSize` | `2K` | Default resolution (`1K`, `2K`, `4K`) |
| `maxPromptLength` | `4000` | Max prompt chars (1–10000) |
| `timeoutMs` | `60000` | Request timeout in ms (1000–300000) |
| `maxImageBytes` | `10485760` | Max decoded image size in bytes (10 MB) |
| `allowedModels` | _(all)_ | Restrict to specific model IDs |
| `allowedImageHosts` | `["<baseUrl-host>"]` | Allowlist for remote image URLs (`*.example.com` supported) |

## Models

| Model | ~Cost | Notes |
|-------|-------|-------|
| `openai/gpt-5-image-mini` | varies | Default — fast, good quality |
| `openai/gpt-5-image` | varies | Higher quality GPT-5 |
| `black-forest-labs/flux.2-pro` | $0.03/MP | High quality FLUX |
| `black-forest-labs/flux.2-klein-4b` | $0.014/MP | Cheapest FLUX |
| `black-forest-labs/flux.2-max` | $0.07/MP | Highest quality FLUX |
| `google/gemini-2.5-flash-image-preview` | varies | Text + image output |
| `sourceful/riverflow-v2-fast` | $0.02/1K | Fast iterations |

Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

## Security notes

- **Prompt data leaves the host** — prompts are sent to OpenRouter's API for image generation. Do not include secrets, PII, or sensitive context in prompts. Ensure this aligns with your organization's data handling policy.
- **Plugin code runs in the gateway process** — the HTTP call to OpenRouter works even for sandboxed agents. The sandbox restricts agent shell/filesystem access, not plugin tool execution.
- **HTTPS enforced** — `baseUrl` must use HTTPS (except `localhost` for local dev). The plugin rejects insecure endpoints at startup to prevent API key leakage.
- **Remote image URL hardening** — if a model returns an image URL instead of inline base64, the plugin validates HTTPS, DNS-resolved IPs (must be public), and every redirect hop before downloading. By default only the `baseUrl` host is allowed; extend `allowedImageHosts` when needed.
- **Output size guard** — images exceeding `maxImageBytes` (default 10 MB) are rejected to prevent memory pressure and transport failures.
- **Cost control** — use `allowedModels` to restrict to cheaper models, or deny `generate_image` on agents that shouldn't generate images.

## CLI — local image generation

Generate images directly from the terminal (no OpenClaw gateway needed):

```bash
export OPENROUTER_API_KEY=sk-or-...

npx tsx extensions/image-gen/generate.ts "a cat wearing a top hat"
npx tsx extensions/image-gen/generate.ts "sunset" --ratio 16:9 --size 4K
npx tsx extensions/image-gen/generate.ts "logo" --model black-forest-labs/flux.2-pro --output logo.png
```

Options: `--ratio`, `--size`, `--model`, `--output`, `--help`

## Tests

```bash
cd extensions/image-gen

# Unit tests (no API key needed — uses mocked fetch)
npx tsx --test test/*.test.ts

# Include integration test (real API call, needs OPENROUTER_API_KEY)
OPENROUTER_API_KEY=sk-or-... npx tsx --test test/*.test.ts
```
