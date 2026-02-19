---
title: "channel-guard"
description: "OpenClaw plugin that scans incoming WhatsApp/Signal/Google Chat messages for prompt injection using a local DeBERTa ONNX model."
weight: 132
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/channel-guard/)

Scans incoming channel messages (WhatsApp, Signal, Google Chat) for prompt injection using a local DeBERTa ONNX model. Companion to [content-guard](content-guard.md) which scans content at the inter-agent sessions_send boundary — channel-guard protects the **inbound message** surface instead.

## How it works

Hooks into `message_received` (fires when a channel message arrives, before the agent processes it) and runs the message text through [ProtectAI/deberta-v3-base-prompt-injection-v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2).

**Three-tier response based on detection score:**

| Score range | Action | Behavior |
|---|---|---|
| Below `warnThreshold` | **Pass** | Message delivered normally |
| `warnThreshold` - `blockThreshold` | **Warn** | Message delivered with security advisory injected into agent context |
| Above `blockThreshold` | **Block** | Message rejected entirely |

## Install

```bash
cd extensions/channel-guard
npm install
```

The DeBERTa ONNX model (~370MB, fp32) downloads automatically on first use and is cached locally.

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
          "sensitivity": 0.5,     // Model threshold for INJECTION label
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
| `sensitivity` | number | 0.5 | Model confidence threshold (0-1). Lower = more aggressive |
| `warnThreshold` | number | 0.4 | Score above which to inject warning |
| `blockThreshold` | number | 0.8 | Score above which to hard-block |
| `failOpen` | boolean | false | Allow messages when model unavailable |
| `cacheDir` | string | - | ONNX model cache directory |
| `logDetections` | boolean | true | Log flagged messages to gateway console |

## Testing

```bash
npm test
```

Tests use the real DeBERTa model (first run downloads it). Timeout is 120s to accommodate model loading.

## Architecture

```
WhatsApp/Signal/Google Chat message
        |
        v
  +-----------------+
  | message_        |
  | received        |--> DeBERTa ONNX classifier
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
| **Hook** | `before_tool_call` | `message_received` |
| **Intercepts** | `sessions_send` | Inbound channel messages |
| **Protects** | Inter-agent sessions_send boundary | Inbound channel messages |
| **Threat** | Poisoned web content crossing agent boundary | Adversarial user messages |
| **Model** | LLM (OpenRouter) | DeBERTa ML |

## Limitations

- **Channel messages only**: The `message_received` hook fires only for configured channel messages (WhatsApp, Signal, Google Chat bridges). It does **not** fire for HTTP chat completions API requests or Control UI messages. This is by design — channel-guard protects the channel perimeter, not the API surface. (Tested against OpenClaw 2026.2.12.)
- **TOCTOU**: The model sees the message text at hook time. If the platform modifies the message after the hook fires, the classification may not match the final content the agent sees. In practice this is unlikely for channel messages.
- **Model accuracy**: DeBERTa has a false positive rate of ~1-3% on benign messages. Tune `sensitivity` and thresholds for your use case.
- **Warn mechanism**: The `warn` return value depends on OpenClaw's `message_received` hook supporting `{ warn: true, warnMessage }`. If unsupported, warnings are logged but not injected into agent context. Blocking (`{ block: true }`) is the primary defense.
