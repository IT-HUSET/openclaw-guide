#!/bin/bash
set -euo pipefail

# === Apply Egress Firewall Rules (Linux nftables) ===
# Reads allowlist.conf, resolves hostnames to IPs, and applies nftables
# rules to the Docker bridge interface. Only allowlisted host:port pairs
# can receive outbound TCP connections from the egress network.
#
# Usage: sudo bash apply-rules-linux.sh [allowlist-file] [network-name]
#
# Requires: sudo, Docker running, nft, dig (or host) for DNS resolution.
#
# To persist across reboots: enable nftables service and save rules.
#   sudo nft list ruleset > /etc/nftables.conf
#   sudo systemctl enable nftables

# Color output (disabled when not writing to a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BOLD='' NC=''
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWLIST="${1:-$SCRIPT_DIR/allowlist.conf}"
NETWORK_NAME="${2:-openclaw-egress}"
TABLE="openclaw_egress"
CHAIN="egress_filter"

echo ""
echo -e "${BOLD}=== Apply Egress Rules (Linux nftables) ===${NC}"
echo ""

# ── Preflight ──────────────────────────────────────────────────

if [[ "$(uname)" != "Linux" ]]; then
    echo -e "${RED}This script is for Linux only${NC}"
    echo "Use apply-rules.sh for macOS"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Must run with sudo${NC}"
    echo "Usage: sudo bash $0 [allowlist] [network-name]"
    exit 1
fi

if [[ ! -f "$ALLOWLIST" ]]; then
    echo -e "${RED}Allowlist not found: $ALLOWLIST${NC}"
    exit 1
fi

if ! command -v docker &>/dev/null; then
    echo -e "${RED}Docker not found${NC}"
    exit 1
fi

if ! docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo -e "${RED}Network '$NETWORK_NAME' not found — run setup-network.sh first${NC}"
    exit 1
fi

if ! command -v nft &>/dev/null; then
    echo -e "${RED}nft not found — install nftables: apt install nftables${NC}"
    exit 1
fi

# Prefer dig, fall back to host
DNS_CMD=""
if command -v dig &>/dev/null; then
    DNS_CMD="dig"
elif command -v host &>/dev/null; then
    DNS_CMD="host"
else
    echo -e "${RED}Neither dig nor host found — install dnsutils: apt install dnsutils${NC}"
    exit 1
fi

# ── Resolve bridge interface ───────────────────────────────────

IFACE=$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}' 2>/dev/null || echo "")
if [[ -z "$IFACE" ]]; then
    NETWORK_ID=$(docker network inspect "$NETWORK_NAME" --format '{{.Id}}' 2>/dev/null || echo "")
    if [[ -n "$NETWORK_ID" ]]; then
        IFACE="br-${NETWORK_ID:0:12}"
    fi
fi

if [[ -z "$IFACE" ]]; then
    echo -e "${RED}Cannot determine bridge interface for network '$NETWORK_NAME'${NC}"
    echo "Start a container on the network first, then re-run"
    exit 1
fi

echo "Network:   $NETWORK_NAME"
echo "Interface: $IFACE"
echo "Allowlist: $ALLOWLIST"
echo ""

# ── Resolve hostnames ──────────────────────────────────────────

resolve_host() {
    local host="$1"
    if [[ "$DNS_CMD" == "dig" ]]; then
        dig +short "$host" A 2>/dev/null | grep -E '^[0-9]+\.' || true
    else
        host -t A "$host" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || true
    fi
}

echo -e "${BOLD}Resolving allowlist entries...${NC}"

# Collect rules as arrays
declare -a NFT_RULES=()
ENTRY_COUNT=0
RESOLVE_FAILURES=0

while IFS= read -r line; do
    line="${line%%#*}"
    line="${line// /}"
    [[ -z "$line" ]] && continue

    host="${line%%:*}"
    port="${line#*:}"

    IPS=$(resolve_host "$host")

    if [[ -z "$IPS" ]]; then
        echo -e "  ${YELLOW}WARN: $host — no A records, skipping${NC}"
        RESOLVE_FAILURES=$((RESOLVE_FAILURES + 1))
        continue
    fi

    for ip in $IPS; do
        if [[ "$port" != "$host" ]]; then
            NFT_RULES+=("ip daddr $ip tcp dport $port accept comment \"$host:$port\"")
        else
            NFT_RULES+=("ip daddr $ip accept comment \"$host (all ports)\"")
        fi
    done
    ENTRY_COUNT=$((ENTRY_COUNT + 1))
    echo "  $host:${port:-*} -> $(echo "$IPS" | tr '\n' ' ')"
done < "$ALLOWLIST"

echo ""

if [[ "$ENTRY_COUNT" -eq 0 ]]; then
    echo -e "${RED}No valid allowlist entries — refusing to apply (would block all traffic)${NC}"
    exit 1
fi

# ── Apply nftables rules ──────────────────────────────────────

# Remove existing table if present (atomic replace)
nft delete table inet "$TABLE" 2>/dev/null || true

# Build ruleset
RULESET="table inet $TABLE {\n"
RULESET+="  chain $CHAIN {\n"
RULESET+="    type filter hook forward priority 0; policy accept;\n\n"
RULESET+="    # Only filter traffic from the egress network interface\n"
RULESET+="    iifname != \"$IFACE\" accept\n\n"
RULESET+="    # Allow DNS\n"
RULESET+="    udp dport 53 accept\n"
RULESET+="    tcp dport 53 accept\n\n"
RULESET+="    # Allow established/related connections\n"
RULESET+="    ct state established,related accept\n\n"
RULESET+="    # Allowlist entries\n"

for rule in "${NFT_RULES[@]}"; do
    RULESET+="    $rule\n"
done

RULESET+="\n    # Default deny outbound from egress network\n"
RULESET+="    log prefix \"openclaw-egress-deny: \" drop\n"
RULESET+="  }\n"
RULESET+="}\n"

echo -e "$RULESET" | nft -f -

echo -e "${GREEN}nftables rules applied to table: $TABLE${NC}"
echo "  Entries: $ENTRY_COUNT"
if [[ "$RESOLVE_FAILURES" -gt 0 ]]; then
    echo -e "  ${YELLOW}DNS failures: $RESOLVE_FAILURES (review warnings above)${NC}"
fi
echo ""

# ── Show active rules ──────────────────────────────────────────

echo -e "${BOLD}Active rules in table '$TABLE':${NC}"
nft list table inet "$TABLE" 2>/dev/null || echo "  (no rules — nft error)"
echo ""

echo -e "${BOLD}Verify with:${NC}"
echo "  bash $(dirname "$0")/verify-egress.sh"
echo ""
echo -e "${BOLD}To persist across reboots:${NC}"
echo "  sudo nft list ruleset > /etc/nftables.conf"
echo "  sudo systemctl enable nftables"
echo ""
