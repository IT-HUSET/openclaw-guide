#!/bin/bash
set -euo pipefail

# === Setup Docker Network for Egress Allowlisting ===
# Creates a custom Docker bridge network that the computer agent joins.
# Firewall rules (applied separately by apply-rules.sh) restrict outbound
# traffic on this network to an allowlist.
#
# Usage: bash setup-network.sh [network-name]
#
# Requires: Docker or OrbStack running.

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

NETWORK_NAME="${1:-openclaw-egress}"
SUBNET="${SUBNET:-172.30.0.0/24}"

echo ""
echo -e "${BOLD}=== Docker Network Setup: Egress Allowlisting ===${NC}"
echo ""

# ── Preflight ──────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
    echo -e "${RED}Docker not found — install Docker or OrbStack first${NC}"
    exit 1
fi

if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}Docker daemon not running — start Docker or OrbStack${NC}"
    exit 1
fi

# Validate network name (alphanumeric, hyphens, underscores)
if [[ ! "$NETWORK_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
    echo -e "${RED}Invalid network name: $NETWORK_NAME${NC}"
    echo "Use alphanumeric characters, hyphens, and underscores only"
    exit 1
fi

# ── Create network ─────────────────────────────────────────────

if docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo -e "${YELLOW}Network '$NETWORK_NAME' already exists${NC}"
    EXISTING_SUBNET=$(docker network inspect "$NETWORK_NAME" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "unknown")
    echo "  Subnet: $EXISTING_SUBNET"
else
    # --ipv6=false prevents IPv6 bypass of IPv4 firewall rules
    docker network create \
        --driver bridge \
        --subnet "$SUBNET" \
        --ipv6=false \
        "$NETWORK_NAME"
    echo -e "${GREEN}Created network: $NETWORK_NAME (subnet: $SUBNET)${NC}"
fi

# ── Show bridge interface ──────────────────────────────────────

IFACE=$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}' 2>/dev/null || echo "")
if [[ -z "$IFACE" ]]; then
    # Docker auto-generates bridge names like br-<short-id>
    NETWORK_ID=$(docker network inspect "$NETWORK_NAME" --format '{{.Id}}' 2>/dev/null || echo "")
    if [[ -n "$NETWORK_ID" ]]; then
        IFACE="br-${NETWORK_ID:0:12}"
    fi
fi

echo ""
echo "Network details:"
echo "  Name:      $NETWORK_NAME"
echo "  Subnet:    $SUBNET"
echo "  Interface: ${IFACE:-unknown (will be assigned when first container joins)}"
echo ""
echo -e "${BOLD}Next: Apply firewall rules${NC}"
if [[ "$(uname)" == "Darwin" ]]; then
    echo "  sudo bash $(dirname "$0")/apply-rules.sh"
else
    echo "  sudo bash $(dirname "$0")/apply-rules-linux.sh"
fi
echo ""
echo "Then set in openclaw.json for the computer agent:"
echo "  \"sandbox\": { \"docker\": { \"network\": \"$NETWORK_NAME\" } }"
echo ""
