#!/usr/bin/env bash
# CRYME full demo loop: migrate → deploy → verify TLS
# Follows migration_demo_commands.md with live nginx TLS changes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

CRYME="node cryme"

echo "=============================================="
echo " CRYME Server Demo — migrate / deploy / verify"
echo "=============================================="

echo ""
echo "[0] Initialize graph from YAML ..."
${CRYME} init

echo ""
echo "[baseline] Verify live service ..."
bash deploy/verify_service.sh baseline

run_step() {
  local label="$1"
  shift
  echo ""
  echo "=== ${label} ==="
  "$@"
}

# Step 1 — expected failure (hidden dependency)
run_step "Step 1: migrate KeyExchange (expect FAIL)" \
  ${CRYME} migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768 || true

# Step 2 — success + deploy
run_step "Step 2: migrate KeyExchange (expect SUCCESS)" \
  ${CRYME} migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768

run_step "Step 2: deploy TLS" \
  ${CRYME} deploy step=2

run_step "Step 2: verify live service" \
  ${CRYME} verify service step=2

# Step 3 — redundant
run_step "Step 3: redundant migrate (expect ABORT)" \
  ${CRYME} migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768 || true

# Step 4 — cert ML-DSA-44
run_step "Step 4: migrate Cert to ML-DSA-44" \
  ${CRYME} migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44

run_step "Step 4: deploy TLS" \
  ${CRYME} deploy step=4

run_step "Step 4: verify live service" \
  ${CRYME} verify service step=4

# Step 5 — cert upgrade ML-DSA-65
run_step "Step 5: upgrade Cert to ML-DSA-65" \
  ${CRYME} migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-65

run_step "Step 5: deploy TLS" \
  ${CRYME} deploy step=5

# Step 6 — TLS 1.3 only
run_step "Step 6: migrate TLS control to TLS1.3" \
  ${CRYME} migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3

run_step "Step 6: deploy TLS" \
  ${CRYME} deploy step=6

run_step "Step 6: verify live service" \
  ${CRYME} verify service step=6

echo ""
echo "=== Migration tree ==="
${CRYME} show tree

echo ""
echo "=== Step 6 diff ==="
${CRYME} show diff step=6

echo ""
echo "[+] CRYME server demo complete."
