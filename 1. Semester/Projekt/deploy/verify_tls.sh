#!/usr/bin/env bash
# TLS handshake proof for CRYME demo — baseline or after migration step N.
#
# Usage:
#   bash deploy/verify_tls.sh baseline
#   bash deploy/verify_tls.sh step=2
#
# Checks TLS handshake (openssl/curl) and live migration state via:
#   curl -sk https://127.0.0.1:8443/api/status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="${1:-baseline}"
NGINX_HOST="${CRYME_TLS_HOST:-127.0.0.1}"
NGINX_PORT="${CRYME_TLS_PORT:-8443}"
BASE="https://${NGINX_HOST}:${NGINX_PORT}"
NGINX_CONTAINER="${CRYME_NGINX_CONTAINER:-cryme-nginx-classic}"
CURL_CONTAINER="${CRYME_CURL_CONTAINER:-cryme-curl-client}"
VERIFY_FAILED=0

print_header() {
  echo ""
  echo "================================================================"
  echo " CRYME TLS Verification — ${MODE}"
  echo " Target: ${NGINX_HOST}:${NGINX_PORT}"
  echo "================================================================"
}

verify_openssl() {
  echo ""
  echo "--- openssl s_client (server endpoint) ---"
  echo | openssl s_client -connect "${NGINX_HOST}:${NGINX_PORT}" -servername localhost 2>/dev/null \
    | openssl x509 -noout -subject -issuer 2>/dev/null || true
  echo | openssl s_client -connect "${NGINX_HOST}:${NGINX_PORT}" -servername localhost 2>&1 \
    | grep -E 'Protocol|Cipher|subject=|issuer=' || true
}

verify_curl_host() {
  echo ""
  echo "--- curl from host ---"
  curl -skv "https://${NGINX_HOST}:${NGINX_PORT}/health" 2>&1 \
    | grep -E 'SSL connection|TLSv|subject:|server certificate|CRYME|HTTP/' || true
}

verify_curl_client() {
  if ! docker ps --format '{{.Names}}' | grep -qx "${CURL_CONTAINER}"; then
    echo ""
    echo "[!] curl-client container not running — skipping in-network probe"
    return 0
  fi

  echo ""
  echo "--- curl from Client_Browser container (cryme-curl-client) ---"
  local tlsflags=""
  if [[ -f "${SCRIPT_DIR}/client/expect.env" ]]; then
    # Do not `source` expect.env — unquoted multi-word values break bash (e.g. --tls-max).
    tlsflags="$(grep -E '^CRYME_CURL_TLSFLAGS=' "${SCRIPT_DIR}/client/expect.env" | tail -1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
  fi
  # shellcheck disable=SC2086
  docker exec "${CURL_CONTAINER}" sh -c \
    "curl -skv ${tlsflags} https://nginx-classic/health" 2>&1 \
    | grep -E 'SSL connection|TLSv|subject:|server certificate|CRYME|HTTP/' || true
}

verify_nginx_profile() {
  if docker ps --format '{{.Names}}' | grep -qx "${NGINX_CONTAINER}"; then
    echo ""
    echo "--- nginx TLS profile header ---"
    curl -skI "${BASE}/health" 2>/dev/null \
      | grep -i 'x-cryme-tls-profile' || true
  fi
}

expected_migration_step() {
  if [[ "${MODE}" == "baseline" ]]; then
    echo "0"
  elif [[ "${MODE}" =~ ^step=([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

verify_api_status() {
  echo ""
  echo "--- API migration status (curl -sk ${BASE}/api/status) ---"

  local body
  if ! body="$(curl -sk "${BASE}/api/status" 2>/dev/null)"; then
    echo "[-] Failed to reach ${BASE}/api/status"
    VERIFY_FAILED=1
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    echo "${body}" | python3 -m json.tool 2>/dev/null || echo "${body}"
  else
    echo "${body}"
  fi

  local expected actual
  expected="$(expected_migration_step)"
  if [[ -z "${expected}" ]]; then
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    actual="$(echo "${body}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('migration_step', ''))" 2>/dev/null || true)"
  else
    actual="$(echo "${body}" | grep -o '"migration_step"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || true)"
  fi

  echo ""
  if [[ -z "${actual}" ]]; then
    echo "[-] Could not read migration_step from API response"
    VERIFY_FAILED=1
    return 0
  fi

  if [[ "${actual}" != "${expected}" ]]; then
    echo "[-] migration_step mismatch: expected ${expected} (${MODE}), got ${actual}"
    echo "    Run: cryme deploy step=${expected}   (after a successful migrate)"
    VERIFY_FAILED=1
    return 0
  fi

  echo "[+] migration_step=${actual} matches ${MODE}"
}

print_header
verify_openssl
verify_curl_host
verify_curl_client
verify_nginx_profile
verify_api_status
echo ""
if [[ "${VERIFY_FAILED}" -eq 1 ]]; then
  echo "[-] TLS verification failed (${MODE})"
  echo ""
  exit 1
fi
echo "[+] TLS verification complete (${MODE})"
echo ""
