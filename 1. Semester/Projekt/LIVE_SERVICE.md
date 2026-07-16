# CRYME Live Service Migration

> **See [GUIDE.md](GUIDE.md) § Live Service** for the full picture.

CRYME migrates a **real running HTTPS service** on the university server.

## What runs live

| Service | Container | Port | Role |
|---------|-----------|------|------|
| **nginx** | `cryme-nginx-classic` | `8443` | TLS terminator + live API |
| **Memgraph** | `cryme-memgraph` | `7687` | Oracle graph (planning) |
| **curl-client** | `cryme-curl-client` | — | Client_Browser TLS probe |

## Architecture

```
cryme migrate  →  Oracle (Memgraph) validates plan
cryme deploy   →  Ansible cryme_tls role
                 →  openssl certs, nginx reload
                 →  runtime.json + data.json updated
curl / openssl →  https://127.0.0.1:8443/api/status  (independent proof)
```

## Quick test

```bash
cd ~/cryme
sudo docker-compose -f deploy/docker-compose.yml up -d
cryme init
cryme verify service baseline

cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768   # fail
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768   # success
cryme deploy step=2
cryme verify service step=2

cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3

cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
cryme verify service step=4
```

Automated: `bash deploy/run_demo.sh`

## Proof commands

```bash
curl -skI https://127.0.0.1:8443/health | grep -i x-cryme
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
openssl s_client -connect 127.0.0.1:8443 </dev/null 2>/dev/null | grep -E 'Protocol|Cipher'
```

## What changes per step

| Step | Graph | Live service |
|------|-------|--------------|
| 2 | KEX → X25519_MLKEM768 | Hybrid cipher profile |
| 3 | Cert → ML-DSA-44 | New cert (ECDSA stand-in) |
| 4 | TLS → TLS1.3 | TLS 1.3 only |

Mapping: `deploy/host_mapping.yml`

## Phase C (future)

Current service uses classical TLS with graph-accurate algorithm labels. Real PQC handshakes require OQS nginx (see [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md)).
