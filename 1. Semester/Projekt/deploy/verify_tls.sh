#!/usr/bin/env bash
# TLS handshake proof for CRYME demo — baseline or after migration step N.
#
# Usage:
#   bash deploy/verify_tls.sh baseline
#   bash deploy/verify_tls.sh step=2
#   bash deploy/verify_tls.sh step=6

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="${1:-baseline}"
NGINX_HOST="${CRYME_TLS_HOST:-127.0.0.1}"
NGINX_PORT="${CRYME_TLS_PORT:-8443}"
NGINX_CONTAINER="${CRYME_NGINX_CONTAINER:-cryme-nginx-classic}"
CURL_CONTAINER="${CRYME_CURL_CONTAINER:-cryme-curl-client}"

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
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/client/expect.env"
    tlsflags="${CRYME_CURL_TLSFLAGS:-}"
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
    curl -skI "https://${NGINX_HOST}:${NGINX_PORT}/health" 2>/dev/null \
      | grep -i 'x-cryme-tls-profile' || true
  fi
}

print_header
verify_openssl
verify_curl_host
verify_curl_client
verify_nginx_profile
echo ""
echo "[+] TLS verification complete (${MODE})"
echo ""
