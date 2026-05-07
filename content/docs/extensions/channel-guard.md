---
title: "channel-guard"
description: "OpenClaw plugin that scans incoming WhatsApp/Signal/Google Chat messages for prompt injection using an OpenRouter LLM."
weight: 132
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/channel-guard/)

Scans incoming channel messages (WhatsApp, Signal, Google Chat) for prompt injection using an OpenRouter-hosted LLM. Companion to [content-guard](content-guard.md) which scans content at the inter-agent sessions_send boundary — channel-guard protects the **inbound message** surface instead.

## How it works

Hooks into `before_dispatch` (fires after channel routing and before the agent processes the message) and classifies message text with an LLM via OpenRouter (default model: `anthropic/claude-haiku-4-5`). OpenClaw 2026.5.6 treats `message_received` as fire-and-forget, so blocking must happen in `before_dispatch`.

**Three-tier response based on detection score:**

| Score range | Action | Behavior |
|---|---|---|
| Below `warnThreshold` | **Pass** | Message delivered normally |
| `warnThreshold` - `blockThreshold` | **Warn** | Message delivered with security advisory injected into agent context |
| Above `blockThreshold` | **Block** | Message rejected entirely |

## Install

```bash
openclaw plugins install -l ./extensions/channel-guard
```

Requires `OPENROUTER_API_KEY` (or `openRouterApiKey` in plugin config).

## Configuration

Add to your `openclaw.json`:

```json5
{
  "plugins": {
    "load": { "paths": ["path/to/extensions/channel-guard"] },
    "entries": {
      "channel-guard": {
        "enabled": true,
        "config": {
          "model": "anthropic/claude-haiku-4-5",
          "maxContentLength": 10000,
          "timeoutMs": 10000,
          "warnThreshold": 0.4,   // Score to trigger warning
          "blockThreshold": 0.8,  // Score to hard-block
          "failOpen": false,      // Block when model unavailable
          "logDetections": true   // Log flagged messages to console
        }
      }
    }
  }
}
```

### Config reference

| Option | Type | Default | Description |
|---|---|---|---|
| `openRouterApiKey` | string | `$OPENROUTER_API_KEY` | OpenRouter API key. Falls back to env var |
| `model` | string | `anthropic/claude-haiku-4-5` | LLM model for classification |
| `maxContentLength` | number | 10000 | Max chars per classifier request (longer text is scanned in sequential chunks) |
| `timeoutMs` | number | 10000 | API request timeout in ms |
| `sensitivity` | number | - | Deprecated. Legacy compatibility only; used as `warnThreshold` fallback |
| `warnThreshold` | number | 0.4 | Score above which to inject warning |
| `blockThreshold` | number | 0.8 | Score above which to hard-block |
| `failOpen` | boolean | false | Allow messages when model unavailable |
| `logDetections` | boolean | true | Log flagged messages to gateway console |

## Testing

```bash
npm test
```

Tests use mocked HTTP responses (no API key required).

## Architecture

```
WhatsApp/Signal/Google Chat message
        |
        v
  +-----------------+
  | before_         |
  | dispatch        |--> OpenRouter LLM classifier
  | hook            |         |
  +-----------------+         v
        |          score < 0.4 --> pass
        |          score 0.4-0.8 --> warn (advisory injected)
        |          score > 0.8 --> block (message rejected)
        v
  Agent processes
  message (or not)
```

## Relationship to content-guard

| | content-guard | channel-guard |
|---|---|---|
| **Hook** | `before_tool_call` | `before_dispatch` |
| **Intercepts** | `sessions_send` | Inbound channel messages |
| **Protects** | Inter-agent sessions_send boundary | Inbound channel messages |
| **Threat** | Poisoned web content crossing agent boundary | Adversarial user messages |
| **Model** | LLM (OpenRouter) | LLM (OpenRouter) |

## Limitations

- **Channel messages only**: The `before_dispatch` hook runs for configured channel messages (WhatsApp, Signal, Google Chat bridges). It does **not** protect HTTP chat completions API requests or Control UI messages. This is by design — channel-guard protects the channel perimeter, not the API surface. (Reviewed against OpenClaw 2026.5.6.)
- **TOCTOU**: The model sees the message text at hook time. If the platform modifies the message after the hook fires, the classification may not match the final content the agent sees. In practice this is unlikely for channel messages.
- **Probabilistic detection**: LLM classification can still produce false positives/negatives. Tune `warnThreshold`/`blockThreshold` for your risk tolerance.
- **Warn mechanism**: Warnings are queued with `enqueueNextTurnInjection` when OpenClaw provides a `sessionKey` for the dispatch. If warning injection fails while `failOpen: false`, the message is blocked; if the runtime cannot provide a session key, warnings are logged and the message passes without injected context. Blocking uses `before_dispatch` handling and is the primary defense.
