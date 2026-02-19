---
title: "command-guard"
description: "OpenClaw plugin that blocks dangerous shell commands via regex pattern matching. Deterministic — no ML model, no external dependencies."
weight: 134
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/command-guard/)

Deterministic regex-based command blocker for `exec`/`bash` tool calls. Blocks destructive commands (rm -rf, fork bombs, force push, etc.) before execution. Companion to [content-guard](content-guard.md) and [channel-guard](channel-guard.md) — command-guard protects the **shell execution** surface.

## How it works

Hooks into `before_tool_call` for `exec` and `bash` tools:

1. Strips single-quoted string contents (bash literals are safe — `echo 'rm -rf /'` is harmless)
2. Matches the full command against compiled regex patterns (catches patterns spanning delimiters like fork bombs)
3. Splits on `&&`, `||`, `;` and matches each segment
4. For pipe-to-shell patterns, checks pipe targets against a safe list before blocking
5. On match: returns `{ block: true, blockReason }` to prevent execution

No ML model, no network calls, no heavy dependencies. Runs in <5ms.

## Pattern categories

| Category | Examples | Count |
|---|---|---|
| **destructive** | `rm -rf`, `sudo rm` | 2 |
| **system_damage** | Fork bombs, `chmod 777`, `dd of=/dev/`, `mkfs.`, `> /dev/sd` | 5 |
| **pipe_to_shell** | `curl url \| sh`, `wget url \| bash` | 1 |
| **git_destructive** | `--force` push, `reset --hard`, `branch -D`, `--global` config write, `rebase --skip`, `clean -f` | 6 |
| **interpreter_escape** | `bash -c`, `eval`, `python3 -c`, `node -e` | 3 |

## Install

```bash
cd extensions/command-guard
npm install
```

No model download — the plugin has zero runtime dependencies.

## Configuration

Add to your `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      "command-guard": {
        enabled: true,
        config: {
          guardedTools: ["exec", "bash"],
          failOpen: false,
          logBlocks: true
        }
      }
    }
  }
}
```

### Config reference

| Option | Type | Default | Description |
|---|---|---|---|
| `guardedTools` | string[] | `["exec", "bash"]` | Tool names to intercept |
| `failOpen` | boolean | `false` | Allow commands when config unavailable |
| `logBlocks` | boolean | `true` | Log blocked commands to gateway console |

## Customizing patterns

Edit `blocked-commands.json` in the plugin directory. Each entry:

```json
{
  "regex": "\\brm\\s+-rf\\b",
  "message": "Recursive force delete blocked.",
  "category": "destructive"
}
```

Patterns use JavaScript regex syntax. The plugin compiles them once at startup. If the config file is missing or malformed, hardcoded fallback patterns are used (fail-closed).

## Safe pipe targets

The `safe_pipe_targets` list prevents false positives on commands like `curl url | jq .`:

`jq`, `grep`, `sort`, `wc`, `head`, `tail`, `less`, `cat`, `tee`, `tr`, `uniq`

**Excluded:** `xargs`, `sed`, `awk` — these can execute arbitrary commands or write files, so they are not considered safe pipe targets.

A pipe-to-shell match is only blocked if at least one pipe target is **not** in the safe list. A chain like `curl url | transform | sh` is still blocked because `sh` is not safe.

## Guard plugin comparison

| | channel-guard | content-guard | file-guard | network-guard | command-guard |
|---|---|---|---|---|---|
| **Hook** | `message_received` | `before_tool_call` | `before_tool_call` | `before_tool_call` | `before_tool_call` |
| **Protects** | Inbound channel messages | Inter-agent boundary | File system | Network access | Shell execution |
| **Method** | DeBERTa ML model | LLM via OpenRouter | Deterministic patterns | Deterministic regex + glob | Regex patterns |
| **Dependencies** | ~370MB ONNX model | OpenRouter API key | None | None | None |
| **Latency** | ~100-500ms | ~500ms-2s | <10ms | <5ms | <5ms |

## Testing

```bash
cd extensions/command-guard && npm test
```

All tests run in <1s (no model download).

## Limitations

- **Regex bypass** — obfuscation via variables (`$CMD`), base64 encoding, or hex escapes can bypass pattern matching. Command-guard is a defense-in-depth layer, not a complete solution.
- **Heredocs and process substitution** — the command splitter handles `&&`, `||`, `;` but does not parse heredocs (`<<EOF`), newlines within strings, or process substitution (`<()`) correctly.
- **Double-quoted strings** — only single-quoted strings are stripped. Double-quoted strings allow variable expansion and are still checked (correctly, since they can contain executable content).
- **Best-effort interpreter detection** — `bash -c`, `eval`, `python3 -c` etc. are caught, but deeply nested or indirect invocations are not.
- **Not a sandbox** — command-guard blocks known dangerous patterns but does not provide process isolation. Use Docker sandboxing ([Phase 3](../phases/phase-3-security.md)) for defense-in-depth.
