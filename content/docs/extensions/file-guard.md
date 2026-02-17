---
title: "file-guard"
description: "OpenClaw plugin that enforces path-based file protection with three levels (no_access, read_only, no_delete). Deterministic pattern matching, <10ms latency."
weight: 135
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/file-guard/)

Deterministic file protection plugin that intercepts file-access tool calls and enforces path-based, multi-level policies. Companion to [channel-guard](channel-guard.md), [web-guard](web-guard.md) — file-guard covers the **file system** attack surface using pattern matching instead of ML.

## How it works

Hooks into `before_tool_call` for file tools (`read`, `write`, `edit`, `apply_patch`) and shell tools (`exec`, `bash`):

```
Tool call --> before_tool_call --> path normalize --> pattern match --> allow/block
```

1. Extracts file paths from tool parameters (or parses bash commands for indirect file access)
2. Normalizes paths (resolve `~`, `../`, symlinks, relative paths)
3. Matches against protection patterns using `picomatch` globs
4. Returns block verdict if a protected path is accessed inappropriately

## Protection levels

| Level | Read | Write/Edit | Delete | Use case |
|---|---|---|---|---|
| `no_access` | Blocked | Blocked | Blocked | Secrets, credentials, keys |
| `read_only` | Allowed | Blocked | Blocked | Lock files, generated files |
| `no_delete` | Allowed | Allowed | Blocked | Git internals, LICENSE, README |

## Bash command parsing

Detects indirect file access via shell commands:

| Category | Commands detected |
|---|---|
| **Read** | `cat`, `head`, `tail`, `less`, `more`, `grep`, `rg`, `<` (input redirect) |
| **Write** | `sed -i`, `tee`, `>`, `>>` (output redirects), `cp`/`mv` (destination) |
| **Delete** | `rm`, `unlink`, `shred` |
| **Copy/Move** | `cp`, `mv` — source classified as read, destination as write |

Shell operators (`|`, `&&`, `||`, `;`) are split before parsing. Quoted paths are handled.

**Known limitations:**
- Language-level file access (`python3 -c "open('.env').read()"`) is not detected
- `file://` protocol, `tar`/`zip` archival, `find -exec` are not covered
- Shell variable expansion (`$HOME/.env`) cannot be resolved statically
- `cp`/`mv` detection is heuristic — complex flag combinations may confuse argument parsing

## Install

```bash
cd extensions/file-guard
npm install
```

No model download — this plugin uses deterministic pattern matching only.

## Configuration

Add to your `openclaw.json`:

```json5
{
  "plugins": {
    "entries": {
      "file-guard": {
        "enabled": true,
        "config": {
          "failOpen": false,
          "configPath": "./file-guard.json",
          "logBlocks": true
        }
      }
    }
  }
}
```

### Config reference

| Option | Type | Default | Description |
|---|---|---|---|
| `configPath` | string | `"./file-guard.json"` | Path to protection patterns JSON (relative to plugin dir or absolute) |
| `failOpen` | boolean | `false` | Allow access when config is malformed. Default: block |
| `logBlocks` | boolean | `true` | Log blocked access attempts to gateway console |
| `agentOverrides` | object | `{}` | Per-agent config overrides. Key = agent ID, value = `{ configPath }` |

## Protection config file

External JSON file defining protected patterns. Default location: `file-guard.json` in plugin directory.

```json
{
  "protection_levels": {
    "no_access": {
      "description": "Blocked from all access",
      "patterns": [
        "**/.env", "**/.env.*",
        "**/.ssh/*",
        "**/.aws/credentials", "**/.aws/config",
        "**/credentials.json", "**/credentials.yaml",
        "**/*.pem", "**/*.key",
        "**/.kube/config",
        "**/secrets.yml", "**/secrets.yaml"
      ]
    },
    "read_only": {
      "description": "Read allowed, write/edit blocked",
      "patterns": [
        "**/package-lock.json", "**/yarn.lock",
        "**/pnpm-lock.yaml", "**/Cargo.lock",
        "**/poetry.lock", "**/go.sum"
      ]
    },
    "no_delete": {
      "description": "Read/edit allowed, deletion blocked",
      "patterns": [
        "**/.git/*", "**/LICENSE", "**/README.md"
      ]
    }
  }
}
```

### Default patterns

| Level | Patterns |
|---|---|
| `no_access` | `.env`, `.env.*`, `.ssh/*`, `.aws/credentials`, `.aws/config`, `credentials.json`, `credentials.yaml`, `*.pem`, `*.key`, `.kube/config`, `secrets.yml`, `secrets.yaml` |
| `read_only` | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `go.sum` |
| `no_delete` | `.git/*`, `LICENSE`, `README.md` |

When no config file exists, these defaults are used. When config is malformed and `failOpen: false`, all file access is blocked.

## Self-protection

The plugin hardcodes protection of its own directory and config file at `no_access` level for write/edit/delete operations. Read access is allowed (the plugin needs to read its own config). This prevents an agent from modifying file-guard to disable protections.

Self-protection patterns are **not** configurable — they are always enforced regardless of the external config file.

## Per-agent overrides

Different agents can have additional protection rules:

```json5
{
  "file-guard": {
    "enabled": true,
    "config": {
      "configPath": "./file-guard.json",
      "agentOverrides": {
        "search": {
          "configPath": "./file-guard-search.json"
        }
      }
    }
  }
}
```

**Merge semantics:** Agent override configs are merged additively with the base config. Each protection level's patterns array is unioned. Agent overrides can add patterns but cannot remove base patterns.

## Guard plugin family

| | channel-guard | web-guard | file-guard | network-guard | command-guard |
|---|---|---|---|---|---|
| **Hook** | `message_received` | `before_tool_call` | `before_tool_call` | `before_tool_call` | `before_tool_call` |
| **Method** | DeBERTa ML | DeBERTa ML | Deterministic patterns | Deterministic regex + glob | Regex patterns |
| **Protects** | Inbound channels | Web fetches | File system | Network access | Shell execution |
| **Latency** | ~100-500ms | ~100-500ms + fetch | <10ms | <5ms | <5ms |

## Testing

```bash
cd extensions/file-guard
npm install
npm test
```

No model download needed — tests run in <1s.

## Security notes

- **Fail-closed by default** — if config is malformed and `failOpen: false`, all file access is blocked
- **Self-protection** — plugin directory and config file are hardcoded as protected; cannot be disabled via config
- **Path normalization** — resolves `~`, `../`, and symlinks to prevent bypass via path manipulation
- **Case sensitivity** — uses case-insensitive matching on macOS (case-insensitive filesystem)
- **No network calls** — pure local pattern matching, no dependencies beyond `picomatch`
