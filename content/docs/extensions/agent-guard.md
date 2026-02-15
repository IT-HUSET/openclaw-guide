---
title: "agent-guard"
description: "OpenClaw plugin that scans inter-agent sessions_send messages for prompt injection using a local DeBERTa ONNX model."
weight: 137
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/agent-guard/)

Scans inter-agent `sessions_send` messages for prompt injection using a local DeBERTa ONNX model. Companion to [channel-guard](channel-guard.md) (inbound channel messages) and [web-guard](web-guard.md) (outbound web fetches) — agent-guard protects the **inter-agent communication** surface.

## How it works

Hooks into `before_tool_call` (same hook as web-guard, filtering for `sessions_send` instead of `web_fetch`) and runs the message payload through [ProtectAI/deberta-v3-base-prompt-injection-v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2).

**Three-tier response based on detection score:**

| Score range | Action | Behavior |
|---|---|---|
| Below `warnThreshold` | **Pass** | Message delivered normally |
| `warnThreshold` - `blockThreshold` | **Warn** | Message delivered with security advisory injected into target agent context |
| Above `blockThreshold` | **Block** | `sessions_send` call rejected entirely |

## Install

```bash
cd extensions/agent-guard
npm install
```

The DeBERTa ONNX model (~370MB, fp32) downloads automatically on first use and is cached locally.

## Configuration

Add to your `openclaw.json`:

```json5
{
  "plugins": {
    "load": { "paths": ["path/to/extensions/agent-guard"] },
    "entries": {
      "agent-guard": {
        "enabled": true,
        "config": {
          "sensitivity": 0.5,       // Model threshold for INJECTION label
          "warnThreshold": 0.4,     // Score to trigger warning
          "blockThreshold": 0.8,    // Score to hard-block
          "failOpen": false,        // Block when model unavailable
          "logDetections": true,    // Log flagged messages to console
          "guardAgents": [],        // Agent IDs to scan (empty = all)
          "skipTargetAgents": []    // Target agent IDs to skip
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
| `guardAgents` | string[] | [] | Agent IDs to scan. Empty = scan all agents |
| `skipTargetAgents` | string[] | [] | Target agent IDs to skip. Messages to these agents always pass |

## Testing

```bash
npm test
```

Tests use the real DeBERTa model (first run downloads it). Timeout is 120s to accommodate model loading.

## Architecture

```
Agent A ──sessions_send──> before_tool_call hook ──> DeBERTa ONNX
                                                         │
                                    score < 0.4 ── pass ─┤
                                    score 0.4-0.8 ── warn ┤
                                    score > 0.8 ── block ──┘
                                                         │
                                                         v
                                                      Agent B
```

## Guard plugin comparison

| | channel-guard | web-guard | agent-guard |
|---|---|---|---|
| **Hook** | `message_received` | `before_tool_call` | `before_tool_call` |
| **Filters** | Channel messages | `web_fetch` calls | `sessions_send` calls |
| **Protects** | Inbound channel surface | Outbound web fetches | Inter-agent messages |
| **Threat** | Adversarial user messages | Malicious web content | Cross-agent injection |
| **Tiers** | pass/warn/block | pass/block | pass/warn/block |
| **Fail default** | Closed | Closed | Closed |

All three plugins share the same DeBERTa model cache — if one has already downloaded the model, the others reuse it.

## Limitations

- **`event.agentId` availability**: May not be present in all OpenClaw versions. When absent, `guardAgents` filtering is bypassed (all agents scanned).
- **Latency**: ~100-500ms per classification. Use `guardAgents` to limit which agents are scanned.
- **English only**: The model does not detect injections in other languages.
- **Not a complete solution**: Prompt injection detection is probabilistic. This is a defense-in-depth layer, not a guarantee.

## Security notes

- **All data stays local** — no API calls, no telemetry. Content is classified on-device via ONNX Runtime.
- **Fail-closed by default** — if the model fails to load, all `sessions_send` calls are blocked. This is intentional: a broken guard shouldn't silently disable protection.
