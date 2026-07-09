# CRYME Live Service Migration

CRYME migrates a **real running HTTPS service** on the university server — not placeholder repo demo files.

## What runs live

| Service | Container | Port | Role |
|---------|-----------|------|------|
| **nginx** | `cryme-nginx-classic` | `8443` | Real TLS terminator + live API |
| **Memgraph** | `cryme-memgraph` | `7687` | Oracle graph (planning) |
| **curl-client** | `cryme-curl-client` | — | Client_Browser TLS probe |

**nginx is the live migratable service.** Ansible changes:
- Real TLS certificates (generated with `openssl`)
- Cipher suites and protocols
- Live API state at `/api/status` and `/api/data`

State files (updated on every `cryme deploy`):
- `deploy/state/runtime.json` → `https://127.0.0.1:8443/api/status`
- `deploy/state/data.json` → `https://127.0.0.1:8443/api/data`

Mapping: `deploy/host_mapping.yml`

## Architecture

```
cryme migrate  →  Oracle (Memgraph) validates plan
cryme deploy   →  Ansible cryme_tls role
                 →  openssl new certs
                 →  nginx TLS config reload
                 →  runtime.json + data.json updated
curl / browser →  https://127.0.0.1:8443/api/status  (live proof)
```

## Full live test

```bash
cd ~/cryme
sudo docker-compose -f deploy/docker-compose.yml up -d

# Baseline
node cryme init
node cryme verify service baseline

# Step 1-2: KEX migration
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768   # fail
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768   # success
node cryme deploy step=2
node cryme verify service step=2

# Step 4: Certificate
node cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
node cryme deploy step=4
node cryme verify service step=4

# Step 6: TLS 1.3 only
node cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
node cryme deploy step=6
node cryme verify service step=6
```

Automated: `bash deploy/run_demo.sh`

## Proof commands

```bash
# TLS changed?
curl -skI https://127.0.0.1:8443/health | grep -i x-cryme

# Service state matches graph?
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
curl -sk https://127.0.0.1:8443/api/data | python3 -m json.tool

# TLS handshake
openssl s_client -connect 127.0.0.1:8443 </dev/null 2>/dev/null | grep -E 'Protocol|Cipher'
```

## What changes per migration step

| Step | Graph (Memgraph) | Live service (nginx) |
|------|------------------|----------------------|
| 2 | KEX nodes → X25519_MLKEM768 | Hybrid cipher profile, API shows new KEX algos |
| 4 | Cert → ML-DSA-44 | New ECDSA cert (openssl), API shows ML-DSA-44 |
| 6 | TLS control → TLS1.3 | TLS 1.3 only, API shows TLS1.3 |

## vs. old demo files

| Old (repo demo) | New (live service) |
|-----------------|-------------------|
| Write `/etc/pqc/keys_step_N.conf` | Update nginx + live API JSON |
| Static certs in git | `openssl` generates certs per deploy |
| No HTTP service | Real HTTPS API reflects migration state |

## Phase C: real PQC on the wire

Current live service uses classical TLS with graph-accurate algorithm labels.
For real ML-KEM/ML-DSA handshakes, add OQS nginx (see SERVER_DEPLOYMENT.md Phase C).
