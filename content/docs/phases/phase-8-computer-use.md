---
title: "Phase 8: Computer Use (Experimental)"
description: "VM-based computer-use deployment with Lume macOS VMs, agent-guard, and computer-use plugin."
weight: 80
---

{{< callout type="warning" >}}
**Experimental Feature**: This deployment model is under active development. Tested on Apple Silicon Macs with Lume 1.x. iOS Simulator behavior inside Lume VMs is unverified. For production use, test thoroughly in your specific environment.
{{< /callout >}}

## When to use

Use this deployment when agents need to interact with macOS GUI applications — Xcode, iOS Simulator, design tools, or any app that requires screen, keyboard, and mouse interaction. The worker agent operates inside a Lume VM while the main agent remains Docker-sandboxed on the host.

**Typical use cases:**
- Xcode builds + iOS Simulator testing
- GUI-based workflows (Figma, design tools, system preferences)
- Browser automation with full GUI context
- Any macOS-native app interaction

## Architecture

```
macOS Host (Apple Silicon)
├── Docker (OrbStack)
│   └── Main Agent (sandbox: all, network: none)
│        └── sessions_send ──> agent-guard scan ──> Worker Agent
│
├── OpenClaw Gateway (port 18789)
│   ├── agent-guard plugin (scans sessions_send)
│   └── computer-use plugin (vm_* tools via WebSocket)
│
└── Lume VM — "openclaw-vm"
    ├── cua-computer-server (WebSocket :5000)
    ├── macOS GUI + Xcode + toolchain
    └── /Volumes/My Shared Files/ ←→ workspace/vm-shared/ (host)
```

**Two agents, two isolation boundaries:**
- **Main agent** — Docker-sandboxed, workspace read/write, network disabled. Handles conversation, memory, filesystem tasks. Delegates GUI work to the worker via `sessions_send`.
- **Worker agent** — runs `vm_*` tools only, no `exec` access on host, no subagents. Controls the Lume VM through WebSocket. `agent-guard` scans all messages at the `sessions_send` boundary.

The **shared directory** (`workspace/vm-shared/` on host, `/Volumes/My Shared Files/` in VM) enables file exchange between agents and the VM.

## Prerequisites

- **Apple Silicon Mac** — Lume requires Apple Virtualization.framework
- **Homebrew** — `/opt/homebrew`
- **Docker or OrbStack** — for main agent sandboxing
- **Lume** — `brew install --cask lume`
- **OpenClaw 2026.2.1+**

## Setup

### Step 1: Install Lume and create the VM

```bash
brew install --cask lume

lume create openclaw-vm --os macos --ipsw latest \
  --cpu 8 --memory 16384 --disk-size 100 --unattended
```

Resource guidance:
- **CPU 8** — adjust based on your machine (leave cores for the host)
- **Memory 16GB** — minimum 8GB for Xcode workflows
- **Disk 100GB** — sparse disk, grows on demand

**Troubleshooting: DNS resolution inside VM**

If DNS fails inside the VM, add host entries to `/etc/hosts`:

```bash
# Inside the VM
echo "185.199.108.153 raw.githubusercontent.com" | sudo tee -a /etc/hosts
```

### Step 2: Install cua-computer-server in the VM

```bash
lume run openclaw-vm --no-display
lume ssh openclaw-vm

# Inside the VM:
pip install cua-computer  # provides cua-computer-server binary
```

Verify the server starts:
```bash
# Inside the VM:
cua-computer-server --port 5000
```

### Step 3: Enable Lume HTTP server

The computer-use plugin needs the Lume HTTP API to look up VM IP addresses. Verify it's running on the host:

```bash
curl -s http://localhost:7777/lume/vms | jq .
```

If not running, check Lume's documentation for enabling the HTTP server (default port 7777).

### Step 4: Install agent-guard plugin

```bash
cd /Users/openclaw/openclaw-guide  # Ensure project root
npm install --prefix extensions/agent-guard
openclaw plugins install -l ./extensions/agent-guard
```

See [agent-guard](../extensions/agent-guard.md) for configuration details.

### Step 5: Install computer-use plugin

```bash
cd /Users/openclaw/openclaw-guide  # Ensure project root
npm install --prefix extensions/computer-use
openclaw plugins install -l ./extensions/computer-use
```

### Step 6: Configure the 2-agent gateway

Add the following to your `openclaw.json`:

```json5
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    },
    "list": [
      {
        "id": "main",
        "name": "Main",
        "isDefault": true,
        "model": "claude-sonnet-4-20250514",
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceAccess": "rw",
          "network": "none"
        },
        "tools": {
          "allow": ["group:fs", "group:memory", "group:sessions", "message"],
          "deny": ["group:runtime", "group:web", "vm_*"]
        },
        "subagents": {
          "allowAgents": ["worker"]
        }
      },
      {
        "id": "worker",
        "name": "Computer Worker",
        "model": "claude-sonnet-4-20250514",
        "tools": {
          "allow": ["vm_*", "sessions_send", "session_status"],
          "deny": ["exec"]
        },
        "subagents": {
          "allowAgents": []
        }
      }
    ]
  },

  "plugins": {
    "load": {
      "paths": [
        "./extensions/agent-guard",
        "./extensions/computer-use"
      ]
    },
    "entries": {
      "agent-guard": {
        "enabled": true,
        "config": {
          "sensitivity": 0.5,
          "warnThreshold": 0.4,
          "blockThreshold": 0.8,
          "failOpen": false
        }
      },
      "computer-use": {
        "enabled": true,
        "config": {
          "vmName": "openclaw-vm",
          "lumeApiUrl": "http://localhost:7777",
          "serverPort": 5000,
          "connectTimeoutMs": 30000,
          "commandTimeoutMs": 60000,
          "screenshotScale": 0.5,
          "logVerbose": false,
          "maxScreenshotBytes": 10485760
        }
      }
    }
  }
}
```

{{< callout type="info" >}}
The worker agent inherits `agents.defaults.sandbox` (Docker-sandboxed). However, `vm_*` tools execute via the plugin's WebSocket connection in the gateway process, bypassing Docker. Docker sandboxing of the worker agent does not restrict VM access.
{{< /callout >}}

**Key config decisions:**
- Main agent: Docker sandbox, `network: none`, denies `vm_*` tools (can only delegate to worker)
- Worker agent: only `vm_*` + `sessions_send` + `session_status`, no `exec` on host, no subagents (prevents delegation chains)
- agent-guard: fail-closed (`failOpen: false`) — blocks all inter-agent messages if the model fails to load

### Step 7: Start the gateway and smoke test

```bash
openclaw start --port 18789
```

Verify by sending a message that triggers GUI interaction:
1. Main agent receives the message
2. Main delegates to worker via `sessions_send`
3. agent-guard scans the message
4. Worker calls `vm_launch` (e.g., TextEdit)
5. Worker calls `vm_type` to enter text
6. Worker calls `vm_screenshot` to verify
7. Worker returns result to main via `sessions_send`

**Example test:** "Open TextEdit, type 'Hello from worker agent', take a screenshot, and show me the result."

## Security model

### VM boundary

The Lume VM provides kernel-level isolation (Apple Virtualization.framework). Similar to Docker but running full macOS instead of Linux. A compromise inside the VM does not affect the host.

### Shared directory trust boundary

The shared directory is bidirectional write:
- **Host** → VM: `workspace/vm-shared/` mounted at `/Volumes/My Shared Files/`
- **VM** → Host: files written in the VM appear on the host

Treat all files from either side as **untrusted input**. A compromised VM could write malicious files that the main agent reads. A compromised main agent could write files that `vm_exec` processes.

### vm_exec command injection

`vm_exec` intentionally provides shell access inside the VM — this is required for file operations (`cat`, `ls`, `echo`), build commands, and system tasks. The VM isolation boundary contains command injection: a malicious command runs inside the VM, not on the host.

Do NOT pass unsanitized external input (user messages, web content) directly as `vm_exec` commands. The worker agent should construct commands from trusted logic, not relay arbitrary strings.

### agent-guard

All `sessions_send` messages between main and worker are scanned by [agent-guard](../extensions/agent-guard.md) for prompt injection. Three-tier response: pass, warn (message delivered with advisory), or block (message rejected).

### VM network egress

The VM has its own network stack. By default, Lume VMs have full internet access. A compromised worker agent with `vm_exec` could exfiltrate data from the VM.

**Mitigations:**
- Restrict VM egress with macOS firewall rules on the VM
- Use DNS-level blocking (e.g., `/etc/hosts` in the VM)
- For strict environments, disable VM networking entirely and use only the shared directory for data exchange

### WebSocket security

The plugin connects to `cua-computer-server` via `ws://` (unencrypted). This is acceptable when the VM network is host-local (Lume's default NAT). If the VM is on a different network segment or the connection crosses a network boundary, consider adding TLS.

## Limitations

All limitations verified as of 2026-02-15.

- **2 macOS VM limit** — Lume free tier supports max 2 concurrent macOS VMs (Apple Virtualization.framework limit). Plan agent topology accordingly.
- **iOS Simulator unverified** — iOS Simulator inside Lume VMs has not been tested. Xcode builds work, but Simulator rendering and interaction may have issues.
- **No rate limiting** — no sustained rate limit between `vm_*` calls. Runaway tool loops are possible if the agent enters a retry cycle.
- **Scanning latency** — agent-guard classification (~100-500ms) plus WebSocket round-trip adds latency to interactive workflows. For rapid GUI sequences, this may be noticeable.
- **DNS resolution** — Lume networking quirks may prevent hostname resolution inside the VM. See setup step for workaround.
- **One tool at a time** — WebSocket commands are serialized per worker agent. No concurrent `vm_*` tool calls.
- **VM state edge cases** — VM suspend/resume, snapshots, and multiple gateways connecting to the same VM produce undefined behavior. Restart the gateway after VM lifecycle changes.

## Comparison to Docker isolation

| | Docker isolation ([Phase 3](phase-3-security.md)) | Computer use (Phase 8) |
|--|---|---|
| **Agent sandbox** | Docker container (Linux) | Lume VM (macOS) |
| **Host access** | None (Docker boundary) | None (VM boundary) |
| **macOS tooling** | Not available | Full macOS + Xcode |
| **GUI interaction** | Not possible | Full screen/keyboard/mouse |
| **Resource overhead** | Low (~200MB per container) | High (~8-16GB per VM) |
| **VM limit** | None | 2 macOS VMs (Lume) |
| **Network isolation** | Docker `network: none` | VM firewall rules |

Docker isolation is lighter and sufficient for most workflows. Use computer-use only when agents need macOS GUI interaction.

## Troubleshooting

### VM not running

```
Error: VM 'openclaw-vm' is not running. Start it with: lume start openclaw-vm
```

Start the VM and wait for boot:
```bash
lume run openclaw-vm --no-display
# Wait ~30s for boot, then verify:
lume ssh openclaw-vm -- uname -a
```

### WebSocket connection refused

```
Error: WebSocket connection to ws://192.168.64.X:5000 failed
```

Verify `cua-computer-server` is running inside the VM:
```bash
lume ssh openclaw-vm -- pgrep -f cua-computer-server
# If not running:
lume ssh openclaw-vm -- cua-computer-server --port 5000 &
```

### Lume HTTP 404

```
Error: Lume API returned 404 for VM 'openclaw-vm'
```

The Lume HTTP server is not running or the VM name is wrong:
```bash
# Check Lume HTTP server
curl -s http://localhost:7777/lume/vms | jq .

# Verify VM name
lume list
```

### Screenshot too large

```
Error: Screenshot too large (12.3 MB). Max: 10 MB.
```

Reduce screen resolution inside the VM, or increase `maxScreenshotBytes` in config. Full-resolution Retina screenshots on large displays can exceed the default 10 MB limit.

---

## Next steps

- **[computer-use extension reference](../extensions/computer-use.md)** — full tool and config documentation
- **[agent-guard](../extensions/agent-guard.md)** — inter-agent prompt injection scanning
- **[Phase 6 — Deployment](phase-6-deployment.md)** — production service setup (LaunchDaemon, secrets, firewall)
- **[Reference](../reference.md)** — config cheat sheet, tool groups, gotchas
