---
title: "web-guard"
description: "OpenClaw plugin that scans web_fetch content for prompt injection using a local DeBERTa ONNX model. No API key required."
weight: 131
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/web-guard/)

OpenClaw plugin that scans `web_fetch` content for prompt injection using a local [DeBERTa ONNX model](https://huggingface.co/ProtectAI/deberta-v3-base-prompt-injection-v2). No API key required — runs entirely on-device.

## Setup

```bash
# 1. Install (downloads @huggingface/transformers dependency)
openclaw plugins install -l ./extensions/web-guard

# 2. Enable in openclaw.json
```

```json5
{
  plugins: {
    entries: {
      "web-guard": {
        enabled: true,
        config: {
          failOpen: false,
          sensitivity: 0.5
        }
      }
    }
  }
}
```

Restart the gateway. The ONNX model (~370MB) is downloaded on the first `web_fetch` call and cached locally. Subsequent loads take ~1s.

> **Tip:** Set `failOpen: true` during initial setup to avoid silently blocking all web access if the model fails to load. Switch to `false` once confirmed working.

## How it works

Hooks into `before_tool_call` for `web_fetch`:

1. Validates the URL (blocks private/internal IPs — SSRF prevention)
2. Pre-fetches the URL and chunks content (~1500 chars per chunk)
3. Classifies each chunk with DeBERTa — if any chunk scores above the sensitivity threshold, the tool call is **blocked**
4. If all chunks are clean, the tool executes normally

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `sensitivity` | `0.5` | Detection threshold (0.0-1.0). Lower = more aggressive |
| `maxContentLength` | `50000` | Max chars to scan. Longer content is truncated |
| `timeoutMs` | `10000` | Pre-fetch timeout in ms |
| `failOpen` | `false` | If `true`, allow content when model unavailable |
| `cacheDir` | _(library default)_ | Directory to cache the ONNX model |
| `dtype` | `fp32` | ONNX precision (only `fp32` shipped by this model) |

## Model

| | |
|---|---|
| **Model** | [protectai/deberta-v3-base-prompt-injection-v2](https://huggingface.co/ProtectAI/deberta-v3-base-prompt-injection-v2) |
| **Size** | ~370MB (fp32 ONNX) |
| **F1** | 95.5% |
| **Recall** | 99.7% |
| **Precision** | 91.6% |
| **Inference** | ~30ms/chunk on CPU |
| **License** | Apache 2.0 |

## Limitations

- **Only guards `web_fetch`** — `web_search` results can't be intercepted until OpenClaw ships `after_tool_result` ([#6535](https://github.com/openclaw/openclaw/issues/6535))
- **TOCTOU** — the plugin pre-fetches to scan, then the tool fetches again. A server could return different content each time
- **English only** — the model does not detect injections in other languages
- **Not a complete solution** — prompt injection detection is probabilistic. This is a defense-in-depth layer, not a guarantee

## Testing

```bash
cd extensions/web-guard
npm install
npm test
```

First run downloads the model. Subsequent runs use the cache (~2s total).

## Security notes

- **All data stays local** — no API calls, no telemetry. Content is classified on-device via ONNX Runtime.
- **SSRF protection** — blocks pre-fetch to private/reserved IPv4+IPv6 ranges, localhost variants, and non-http/https schemes. Hostnames are DNS-resolved before fetch, and redirect hops are validated before following.
- **Fail-closed by default** — if the model fails to load, all `web_fetch` calls are blocked. This is intentional: a broken guard shouldn't silently disable protection.
