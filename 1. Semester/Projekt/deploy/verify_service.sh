#!/usr/bin/env bash
# Verify CRYME live service — TLS + cryme-api runtime state after migration.
#
# Usage:
#   bash deploy/verify_service.sh baseline
#   bash deploy/verify_service.sh step=2

set -euo pipefail

MODE="${1:-baseline}"
TLS_HOST="${CRYME_TLS_HOST:-127.0.0.1}"
TLS_PORT="${CRYME_TLS_PORT:-8443}"
BASE="https://${TLS_HOST}:${TLS_PORT}"

echo ""
echo "================================================================"
echo " CRYME Live Service Verification — ${MODE}"
echo " API: ${BASE}/api/status"
echo "================================================================"

echo ""
echo "--- TLS + API status ---"
curl -sk "${BASE}/api/status" | python3 -m json.tool 2>/dev/null || curl -sk "${BASE}/api/status"

echo ""
echo "--- TLS + API data ---"
curl -sk "${BASE}/api/data" | python3 -m json.tool 2>/dev/null || curl -sk "${BASE}/api/data"

echo ""
echo "--- TLS profile header ---"
curl -skI "${BASE}/health" | grep -i 'x-cryme' || true

echo ""
echo "--- TLS handshake ---"
echo | openssl s_client -connect "${TLS_HOST}:${TLS_PORT}" 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null || true
echo | openssl s_client -connect "${TLS_HOST}:${TLS_PORT}" 2>&1 \
  | grep -E 'Protocol|Cipher' | head -2 || true

echo ""
echo "[+] Live service verification complete (${MODE})"
echo ""
