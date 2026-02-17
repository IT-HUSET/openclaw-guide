---
title: "computer-use"
description: "OpenClaw plugin that enables VM-based macOS computer interaction via Lume and cua-computer-server."
weight: 137
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/computer-use/)

OpenClaw plugin that registers 7 `vm_*` tools for VM-based macOS computer interaction via [Lume](https://cua.ai/docs/lume) VMs and [cua-computer-server](https://github.com/trycua/cua). Enables computer-use agents for macOS GUI, Xcode, and iOS workflows without sacrificing Docker sandboxing for the main agent.

## Architecture

```
Main Agent (Docker) --sessions_send--> Worker Agent --vm_*--> WebSocket --> Lume VM (cua-computer-server)
```

The main agent stays Docker-sandboxed while delegating GUI tasks to a worker agent via `sessions_send`. The worker agent controls the Lume VM through WebSocket-connected `vm_*` tools.

## Prerequisites

- **Apple Silicon Mac** — Lume requires Apple Virtualization.framework (Apple Silicon only)
- **Lume** installed — `brew install --cask lume`
- **cua-computer-server** running inside the VM — `pip install cua-computer`
- **OpenClaw 2026.2.1+** — for `before_tool_call` hook support

## Setup

### 1. Create and prepare the Lume VM

```bash
# Create VM (see Phase 8 for recommended CPU/memory/disk settings)
lume create openclaw-vm --os macos --ipsw latest

# Start and SSH in
lume run openclaw-vm --no-display
lume ssh openclaw-vm

# Inside the VM: install cua-computer-server
pip install cua-computer  # provides cua-computer-server binary
```

### 2. Enable Lume HTTP server

The plugin uses the Lume HTTP API to look up VM IP addresses. Enable it with a LaunchAgent on the host:

```bash
# Verify Lume HTTP server is running (default port 7777)
curl -s http://localhost:7777/lume/vms | jq .
```

### 3. Install the plugin

```bash
cd extensions/computer-use
npm install
openclaw plugins install -l ./extensions/computer-use
```

### 4. Enable in openclaw.json

```json5
{
  plugins: {
    entries: {
      "computer-use": {
        enabled: true,
        config: {
          vmName: "openclaw-vm",
          lumeApiUrl: "http://localhost:7777",
          serverPort: 5000,
          connectTimeoutMs: 30000,
          commandTimeoutMs: 60000,
          screenshotScale: 0.5,
          logVerbose: false,
          maxScreenshotBytes: 10485760
        }
      }
    }
  }
}
```

Restart the gateway. The plugin connects to the VM lazily on the first `vm_*` tool call.

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `vmName` | `"openclaw-vm"` | Lume VM name for IP lookup |
| `lumeApiUrl` | `"http://localhost:7777"` | Lume HTTP server URL |
| `serverPort` | `5000` | `cua-computer-server` WebSocket port inside VM |
| `connectTimeoutMs` | `30000` | Max ms for WebSocket connect + Lume HTTP call |
| `commandTimeoutMs` | `60000` | Max ms per command execution |
| `screenshotScale` | `0.5` | Informational only (no server-side scaling in MVP) |
| `logVerbose` | `false` | Extra protocol debug logs (never logs screenshots) |
| `maxScreenshotBytes` | `10485760` | Max screenshot size in bytes (10 MB) |

## Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `vm_screenshot` | _(none)_ | PNG image content block |
| `vm_exec` | `command` (string, required) | stdout/stderr text |
| `vm_click` | `x`, `y` (number, required), `button?` (`"left"` \| `"right"` \| `"double"`, default `"left"`) | Confirmation text |
| `vm_type` | `text` (string, required) | Confirmation text |
| `vm_key` | `keys` (string, required — e.g. `"escape"`, `"command+s"`) | Confirmation text |
| `vm_launch` | `app` (string, required — e.g. `"Xcode"`, `"Safari"`), `args?` (string[]) | Confirmation text |
| `vm_scroll` | `direction` (`"up"` \| `"down"`, required), `clicks?` (number, default 5) | Confirmation text |

## How it works

1. **Lazy connection** — WebSocket to `cua-computer-server` is not created until the first `vm_*` tool call. On connection, the plugin fetches the VM's IP from Lume HTTP API (`GET /lume/vms/{vmName}`), verifies the VM is running, then connects via `ws://{vm-ip}:{serverPort}`.

2. **Command serialization** — All tool calls are serialized through a mutex (promise queue). The WebSocket protocol uses request/response pairs without correlation IDs, so concurrent calls would mismatch responses.

3. **Reconnection** — If the WebSocket closes (VM restart, server crash), the connection singleton is reset. The next tool call triggers a fresh IP lookup and reconnect.

4. **VM health** — Before connecting, the plugin checks VM status via the Lume HTTP API. If the VM is not running, the tool returns an actionable error with startup instructions.

## Security notes

- **`vm_exec` command injection** — the tool intentionally provides shell access inside the VM. Do NOT pass unsanitized user input directly to `vm_exec`. The VM isolation boundary contains command injection — a compromised command runs inside the VM, not on the host.

- **Shared directory trust boundary** — files exchanged via the shared directory (`workspace/vm-shared/` on host, `/Volumes/My Shared Files/` in VM) are bidirectional. Treat files from either side as untrusted input.

- **VM network egress** — `vm_exec` enables network access from the VM. If the VM has unrestricted egress, a compromised worker agent can exfiltrate data. Recommend firewall rules or egress allowlisting on the VM (see [Phase 8](../phases/phase-8-computer-use.md)).

- **WebSocket unencrypted** — the connection uses `ws://` (not `wss://`). Acceptable for localhost/VM-local network. Consider TLS if the VM is on a different network segment.

- **Plugin runs in gateway process** — the plugin makes HTTP/WebSocket calls from the gateway process, bypassing agent-level network restrictions. This is by design: sandboxed agents can't make network calls, but plugin tools can.

- **`sessions_send` delegation risk** — inter-agent messages bypass per-agent tool restrictions. A compromised worker agent can delegate arbitrary operations to the main agent. The main agent's AGENTS.md is the last line of defense.

## Testing

```bash
cd extensions/computer-use
npm install
npm test
```

Unit tests use mocked WebSocket and Lume HTTP responses. No real VM needed for unit tests.

Integration tests (in `.openclaw-test/`) verify plugin loading and tool registration in a running gateway.

## Limitations

- **Lume 2 macOS VM limit** — Lume free tier supports max 2 concurrent macOS VMs (Apple's Virtualization.framework limit)
- **No rate limiting** — no sustained rate limit between commands (only per-command timeout). Runaway tool loops are possible
- **English-only keyboard** — key input assumes US English keyboard layout (macOS input source limitation)
- **Screenshot size** — full-resolution Retina screenshots may exceed the 10 MB default limit. `screenshotScale` is informational only (no server-side scaling in MVP)
- **One tool at a time** — WebSocket serializes all commands per worker agent. No concurrent `vm_*` tool calls
- **WebSocket stale after idle** — no keepalive/heartbeat. Long-idle connections may go stale; the plugin reconnects on the next call
- **VM state edge cases** — VM suspend/resume, snapshots, and multiple gateways connecting to the same VM produce undefined behavior

## SDK migration path

The plugin uses a direct WebSocket client to `cua-computer-server` (no SDK dependency). When `@trycua/computer` adds a local Lume provider for TypeScript (currently only available in the Python SDK), migration to the official SDK will simplify the connection layer. Watch [trycua/cua](https://github.com/trycua/cua) for updates.
