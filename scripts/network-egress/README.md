# Network Egress Control

Restricts outbound traffic from sandboxed agents to an allowlist of approved hosts. Used by the main agent in the [recommended configuration](../../content/docs/examples/config.md) and by the computer agent in the [hardened variant](../../content/docs/hardened-multi-agent.md).

## How It Works

1. A custom Docker bridge network (`openclaw-egress`) is created
2. Sandboxed agents join this network (`docker.network: "openclaw-egress"`)
3. Host firewall rules (pf on macOS, nftables on Linux) restrict outbound traffic on the bridge interface to allowlisted host:port pairs
4. DNS is allowed (containers need name resolution)
5. Everything else is blocked — even a fully compromised agent can only reach pre-approved hosts

## Prerequisites

- Docker running
- `dig` for DNS resolution (`brew install bind` on macOS, `apt install dnsutils` on Linux)
- Root/sudo access (firewall rules need privileges)
- `nft` on Linux (`apt install nftables`)

## Quick Start

```bash
# 1. Create the Docker network
bash scripts/network-egress/setup-network.sh

# 2. Edit the allowlist (add hosts your agent needs)
vi scripts/network-egress/allowlist.conf

# 3. Apply firewall rules
# macOS:
sudo bash scripts/network-egress/apply-rules.sh
# Linux:
sudo bash scripts/network-egress/apply-rules-linux.sh

# 4. Verify filtering works
bash scripts/network-egress/verify-egress.sh
```

Then configure the agent in `openclaw.json`:
```json5
{
  "id": "main",  // or "computer" in the hardened variant
  "sandbox": {
    "mode": "all",
    "docker": { "network": "openclaw-egress" }
  }
}
```

## Scripts

| Script | Purpose | Needs sudo |
|--------|---------|------------|
| `setup-network.sh` | Creates Docker bridge network | No |
| `allowlist.conf` | Template allowlist (edit before applying) | - |
| `apply-rules.sh` | Applies pf rules (macOS) | Yes |
| `apply-rules-linux.sh` | Applies nftables rules (Linux) | Yes |
| `verify-egress.sh` | Tests allowed/blocked connectivity | No |
| `allow-domain.sh` | Adds host:port to allowlist and applies rules | Yes |

## Allowlist Format

One entry per line in `allowlist.conf`:

```conf
# host:port — specific port
registry.npmjs.org:443
github.com:22

# host (no port) — all ports on that host
internal-api.example.com

# Comments start with #
# Blank lines are ignored
```

DNS resolution happens at rule-apply time. For stability with CDN-hosted services, prefer IP ranges over hostnames where possible.

## Persistence

**macOS (pf):** Rules do not survive reboot. Options:
- Add `apply-rules.sh` to a LaunchDaemon that runs before the OpenClaw gateway
- Run manually after each restart

**Linux (nftables):** Save and enable:
```bash
sudo nft list ruleset > /etc/nftables.conf
sudo systemctl enable nftables
```

### macOS LaunchDaemon for Persistence

```xml
<!-- /Library/LaunchDaemons/ai.openclaw.egress-rules.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.egress-rules</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/path/to/scripts/network-egress/apply-rules.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Load: `sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.egress-rules.plist`

## Updating the Allowlist

When the agent needs access to a new host:

**Quick method** (recommended):
```bash
sudo bash scripts/network-egress/allow-domain.sh api.example.com:443 "Example API"
```

**Manual method:**
1. Add the entry to `allowlist.conf`
2. Re-run the apply script (it replaces existing rules atomically)
3. Re-run `verify-egress.sh` to confirm

No gateway restart needed — firewall rules are independent of the Docker containers.

## Troubleshooting

**Agent can't reach an allowed host:**
```bash
# Check if rules are active
# macOS:
sudo pfctl -a openclaw-egress -sr
# Linux:
sudo nft list table inet openclaw_egress

# Test from a container directly
docker run --rm --network openclaw-egress alpine nc -z -w 5 registry.npmjs.org 443

# DNS might have changed — re-resolve and re-apply
sudo bash scripts/network-egress/apply-rules.sh
```

**Agent can reach hosts it shouldn't:**
```bash
# Verify rules are loaded
bash scripts/network-egress/verify-egress.sh

# Check pf is enabled (macOS)
sudo pfctl -si | grep Status

# Check the bridge interface name matches
docker network inspect openclaw-egress --format '{{.Id}}'
```

**Docker Desktop / OrbStack:** These tools run containers inside a Linux VM. The bridge interface lives inside that VM — not on the macOS host — so host-level pf rules cannot filter container egress traffic. The apply script detects this and exits with an error. Use a Linux VM with `apply-rules-linux.sh` inside the VM, or Colima with bridged networking.

## Risks and Limitations

- **DNS is point-in-time:** IP changes (CDN rotation) can break allowed hosts or allow new IPs. Re-run `apply-rules.sh` periodically or on a schedule
- **DNS poisoning:** An attacker controlling DNS could point an allowed hostname at a malicious IP. Use IP addresses for critical entries where possible
- **UDP is blocked by default.** The default-deny rules (pf: `block out on $IFACE all`; nftables: final `drop`) block all protocols including UDP. Only DNS (UDP 53) is explicitly allowed. To restrict DNS to a specific resolver, see the DNS tunneling mitigation in [Hardened Multi-Agent](../../content/docs/hardened-multi-agent.md#accepted-risks)
- **IPv6 disabled by design.** The Docker network is created with `--ipv6=false` to prevent IPv6 traffic from bypassing IPv4-only firewall rules. Do not re-create the network with IPv6 enabled unless you also add IPv6 firewall rules
- **Not a substitute for tool policy:** Network egress is defense-in-depth alongside `tools.deny` — both layers are needed
