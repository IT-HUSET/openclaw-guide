#!/bin/bash
set -euo pipefail

# === Verify Egress Filtering ===
# Runs test containers on the egress network to confirm:
#   1. Allowlisted hosts are reachable
#   2. Non-allowlisted hosts are blocked
#
# Usage: bash verify-egress.sh [network-name] [allowlist-file]
#
# Requires: Docker running, network created, firewall rules applied.

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
NETWORK="${1:-openclaw-egress}"
ALLOWLIST="${2:-$SCRIPT_DIR/allowlist.conf}"
TIMEOUT=5
PASS=0
FAIL=0

echo ""
echo -e "${BOLD}=== Egress Verification ===${NC}"
echo "Network:   $NETWORK"
echo "Allowlist: $ALLOWLIST"
echo ""

# ── Preflight ──────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
    echo -e "${RED}Docker not found${NC}"
    exit 1
fi

if ! docker network inspect "$NETWORK" &>/dev/null; then
    echo -e "${RED}Network '$NETWORK' not found — run setup-network.sh first${NC}"
    exit 1
fi

# ── Helper: test connectivity from container ───────────────────

# TCP connect test — uses timeout + nc without -z (BusyBox nc -z is unreliable)
test_tcp() {
    local host="$1"
    local port="$2"
    local expect="$3"
    local label="$host:$port"

    local result
    if docker run --rm --network "$NETWORK" alpine \
        sh -c "echo | timeout $TIMEOUT nc $host $port 2>/dev/null" &>/dev/null; then
        result="reachable"
    else
        result="blocked"
    fi

    if [[ "$expect" == "pass" && "$result" == "reachable" ]]; then
        echo -e "  ${GREEN}PASS${NC}  $label (expected: reachable, got: reachable)"
        PASS=$((PASS + 1))
    elif [[ "$expect" == "block" && "$result" == "blocked" ]]; then
        echo -e "  ${GREEN}PASS${NC}  $label (expected: blocked, got: blocked)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC}  $label (expected: $expect, got: $result)"
        FAIL=$((FAIL + 1))
    fi
}

# ── Test 1: Allowlisted hosts should be reachable ──────────────

echo -e "${BOLD}--- Allowlisted hosts (should be reachable) ---${NC}"

# Pick first 3 entries from allowlist for testing
TESTED=0
while IFS= read -r line; do
    line="${line%%#*}"
    line="${line// /}"
    [[ -z "$line" ]] && continue

    host="${line%%:*}"
    port="${line#*:}"
    [[ "$port" == "$host" ]] && port="443"

    test_tcp "$host" "$port" "pass"
    TESTED=$((TESTED + 1))
    [[ "$TESTED" -ge 3 ]] && break
done < "$ALLOWLIST"

if [[ "$TESTED" -eq 0 ]]; then
    echo -e "  ${YELLOW}No allowlist entries to test${NC}"
fi
echo ""

# ── Test 2: Non-allowlisted hosts should be blocked ────────────

echo -e "${BOLD}--- Non-allowlisted hosts (should be blocked) ---${NC}"

# These should not be in any reasonable allowlist
BLOCKED_HOSTS=(
    "example.com:443"
    "httpbin.org:443"
    "ifconfig.me:443"
)

for entry in "${BLOCKED_HOSTS[@]}"; do
    host="${entry%%:*}"
    port="${entry#*:}"
    test_tcp "$host" "$port" "block"
done
echo ""

# ── Test 3: DNS should work (containers need it) ──────────────

echo -e "${BOLD}--- DNS resolution (should work) ---${NC}"
if docker run --rm --network "$NETWORK" alpine \
    sh -c "nslookup github.com 2>&1" &>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}  DNS resolution works"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC}  DNS resolution failed"
    FAIL=$((FAIL + 1))
fi
echo ""

# ── Summary ────────────────────────────────────────────────────

TOTAL=$((PASS + FAIL))
echo -e "${BOLD}=== Results ===${NC}"
echo "  Total:   $TOTAL"
echo -e "  Passed:  ${GREEN}$PASS${NC}"
if [[ "$FAIL" -gt 0 ]]; then
    echo -e "  Failed:  ${RED}$FAIL${NC}"
else
    echo -e "  Failed:  $FAIL"
fi
echo ""

if [[ "$FAIL" -gt 0 ]]; then
    echo -e "${RED}Some tests failed — review firewall rules${NC}"
    if [[ "$(uname)" == "Darwin" ]]; then
        echo "  Check pf: sudo pfctl -a openclaw-egress -sr"
    else
        echo "  Check nftables: sudo nft list table inet openclaw_egress"
    fi
    exit 1
else
    echo -e "${GREEN}All tests passed — egress filtering is working${NC}"
fi
echo ""
