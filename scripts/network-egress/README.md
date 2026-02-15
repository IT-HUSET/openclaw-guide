# Network Egress Control

Restricts outbound traffic from the hardened computer agent to an allowlist of approved hosts. Part of the [Hardened Multi-Agent Architecture](../../content/docs/hardened-multi-agent.md).

## How It Works

1. A custom Docker bridge network (`openclaw-egress`) is created
2. The computer agent's sandbox joins this network (`docker.network: "openclaw-egress"`)
3. Host firewall rules (pf on macOS, nftables on Linux) restrict outbound traffic on the bridge interface to allowlisted host:port pairs
4. DNS is allowed (containers need name resolution)
5. Everything else is blocked — even a fully compromised agent can only reach pre-approved hosts

## Prerequisites

- Docker or OrbStack running
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

Then configure the computer agent in `openclaw.json`:
```json5
{
  "id": "computer",
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

## Updating the Allowlist

When the agent needs access to a new host:

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

**OrbStack note:** OrbStack uses its own networking stack. The bridge interface name may differ from standard Docker. If rules aren't working, inspect the actual interface with `ifconfig` or `ip link` and verify it matches what the apply script detected.

## Risks and Limitations

- **DNS is point-in-time:** IP changes (CDN rotation) can break allowed hosts or allow new IPs. Re-run `apply-rules.sh` periodically or on a schedule
- **DNS poisoning:** An attacker controlling DNS could point an allowed hostname at a malicious IP. Use IP addresses for critical entries where possible
- **UDP not filtered:** Only TCP is allowlisted. UDP egress (except DNS) is not explicitly blocked in the current rules. Add UDP rules if your threat model requires it
- **Not a substitute for tool policy:** Network egress is defense-in-depth alongside `tools.deny` — both layers are needed
