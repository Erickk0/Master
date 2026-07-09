#!/usr/bin/env bash
# Generate self-signed demo certificates for CRYME TLS stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/nginx/certs"
mkdir -p "${CERT_DIR}"

gen_rsa() {
  local name="$1"
  local subj="$2"
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${CERT_DIR}/${name}.key" \
    -out "${CERT_DIR}/${name}.crt" \
    -subj "${subj}" 2>/dev/null
}

gen_ecdsa() {
  local name="$1"
  local subj="$2"
  openssl ecparam -genkey -name prime256v1 -out "${CERT_DIR}/${name}.key"
  openssl req -x509 -nodes -days 3650 \
    -key "${CERT_DIR}/${name}.key" \
    -out "${CERT_DIR}/${name}.crt" \
    -subj "${subj}"
}

if [[ ! -f "${CERT_DIR}/classic_rsa.crt" ]]; then
  echo "[+] Generating classic RSA-2048 certificate ..."
  gen_rsa classic_rsa "/CN=CRYME Classic RSA/O=CRYME Demo/C=DE"
fi

if [[ ! -f "${CERT_DIR}/migrated_ecdsa.crt" ]]; then
  echo "[+] Generating migrated ECDSA certificate (ML-DSA demo stand-in) ..."
  gen_ecdsa migrated_ecdsa "/CN=CRYME ML-DSA Demo/O=CRYME Demo/C=DE"
fi

chmod 644 "${CERT_DIR}"/*.crt 2>/dev/null || true
chmod 600 "${CERT_DIR}"/*.key 2>/dev/null || true
echo "[+] Certificates ready in ${CERT_DIR}"
