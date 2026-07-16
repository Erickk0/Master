#!/usr/bin/env bash
# CRYME full demo: migrate → deploy → verify
# Matches GUIDE.md § End-to-End Demo
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

if command -v cryme &>/dev/null; then
  CRYME="cryme"
elif [[ -f "${PROJECT_ROOT}/cryme" ]]; then
  CRYME="node ${PROJECT_ROOT}/cryme"
else
  echo "[-] cryme not found. Run: bash deploy/setup_shell.sh && source ~/.bashrc"
  exit 1
fi

echo "=============================================="
echo " CRYME Demo — migrate / deploy / verify"
echo "=============================================="

run_step() {
  local label="$1"
  shift
  echo ""
  echo "=== ${label} ==="
  "$@"
}

run_step "[0] Initialize" ${CRYME} init
run_step "[baseline] Verify" bash deploy/verify_service.sh baseline

run_step "Step 1: KEX migrate (expect FAIL)" \
  ${CRYME} migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768 || true

run_step "Step 2: KEX co-migrate (expect SUCCESS)" \
  ${CRYME} migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768

run_step "Step 2: deploy" ${CRYME} deploy step=2
run_step "Step 2: verify" ${CRYME} verify service step=2

run_step "Step 3: cert ML-DSA-44" \
  ${CRYME} migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44

run_step "Step 3: deploy" ${CRYME} deploy step=3
run_step "Step 3: verify" ${CRYME} verify service step=3

run_step "Step 4: TLS 1.3 only" \
  ${CRYME} migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3

run_step "Step 4: deploy" ${CRYME} deploy step=4
run_step "Step 4: verify" ${CRYME} verify service step=4

echo ""
echo "=== Migration tree ==="
${CRYME} show tree

echo ""
echo "=== System state at HEAD ==="
${CRYME} show state

echo ""
echo "[+] CRYME demo complete. See GUIDE.md for details."
