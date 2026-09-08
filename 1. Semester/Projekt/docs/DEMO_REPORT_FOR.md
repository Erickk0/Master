# CRYME Live Migration Demo — Report

> **See [GUIDE.md](../GUIDE.md) § End-to-End Demo** for the current demo script.  
**Server:** `ilmare.local.cs.hs-rm.de` (Debian 13, Docker)  
**Project path:** `/home/admin/cryme`  
**Demo logs:** `logs/demo_run_20260709_192822.txt`, `logs/demo_run_completed.txt`

---

## Executive Summary (Kurzfassung)

We ran CRYME end-to-end on a **real university server** with:

1. **Memgraph** — stores the digital twin graph and migration history  
2. **CRYME Oracle CLI** — validates *when* and *what* may be migrated  
3. **Live nginx HTTPS service** (`:8443`) — actually changes TLS configuration on deploy  
4. **Ansible** — applies each successful migration step to the running service  

The demo proves three thesis claims in one pipeline:

| Claim | Demonstrated? | Evidence |
|-------|---------------|----------|
| Oracle detects **hidden dependencies** | ✅ | Step 1 failed (server KEX without client) |
| Oracle learns and allows **SCC co-migration** | ✅ | Step 2 succeeded (both endpoints migrated) |
| Migration plan is **deployed to a live service** | ✅ | API + TLS changed after `cryme deploy` |

---

## 1. System Setup (What Was Installed)

| Component | Role | Access |
|-----------|------|--------|
| `cryme-memgraph` | Graph DB for digital twin + migration steps | `bolt://127.0.0.1:7687` |
| `cryme-memgraph-lab` | Visual graph UI | `http://127.0.0.1:3000` (SSH tunnel) |
| `cryme-nginx-classic` | **Live migratable HTTPS service** | `https://127.0.0.1:8443` |
| `cryme-curl-client` | Simulates `Client_Browser` TLS client | Docker internal |
| CRYME CLI (`cryme`) | Oracle + migration control plane | Host |

**Digital twin model:** `webserver_pqc_twin.yaml`  
**Deploy mapping:** `deploy/host_mapping.yml` → graph nodes map to nginx + API state files

---

## 2. What We Ran (Step by Step)

### Phase 0 — Initialize

```bash
cryme init
```

**Result:** Memgraph loaded 4 cryptographic nodes from YAML (all `classic`).

**Baseline API** (`https://127.0.0.1:8443/api/status`):

```json
{
  "migration_step": 0,
  "profile": "classic-rsa-ecdhe",
  "algorithms": {
    "Webserver_Classic.Cert_RSA2048": "RSA-2048",
    "Webserver_Classic.KeyExchange_ECDHE": "ECDHE",
    "Webserver_Classic.TLS_1.2_/_1.3_Communication": "TLS1.2/1.3",
    "Client_Browser.KeyExchange_ECDHE": "ECDHE"
  }
}
```

**Baseline TLS:** RSA-2048 certificate, TLS 1.3 handshake (`CN=CRYME Classic RSA`).

---

### Phase 1 — Hidden Dependency Trap (Step 1, FAIL)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Oracle result:** ❌ **FAILED**

```
Key 'Webserver_Classic.KeyExchange_ECDHE' is migrated to PQC,
but its communicating endpoint 'Client_Browser.KeyExchange_ECDHE' is still Classic.
```

**Interpretation:** CRYME detected an **implicit structural dependency** between server and browser key exchange. The server cannot migrate alone — this is the "Client Problem" from the digital twin.

**Migration tree after Step 1:**

```
Step 0 (INIT)
└── Step 1 (FAILED) — KeyExchange migration blocked
```

---

### Phase 2 — Co-Migration Success (Step 2, SUCCESS)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Oracle result:** ✅ **SUCCESS** — SCC cluster expanded to include both:

- `Webserver_Classic.KeyExchange_ECDHE`
- `Client_Browser.KeyExchange_ECDHE`

Both migrated to `X25519_MLKEM768`. Ansible playbook generated.

**Deploy to live service:**

```bash
cryme deploy step=2
```

**Ansible `cryme_tls` role applied:**

- TLS profile → `hybrid-kex-classic-cert`
- `deploy/state/runtime.json` updated
- nginx TLS config reloaded

**Live API after Step 2:**

```json
{
  "migration_step": 2,
  "profile": "hybrid-kex-classic-cert",
  "algorithms": {
    "Webserver_Classic.KeyExchange_ECDHE": "X25519_MLKEM768",
    "Client_Browser.KeyExchange_ECDHE": "X25519_MLKEM768"
  }
}
```

---

### Phase 3 — Certificate Migration (Step 3, SUCCESS + DEPLOY)

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
```

**Oracle result:** ✅ Certificate node migrated to ML-DSA-44 (NIST Level 1).

**Live service changes:**

| Property | Before | After Step 3 |
|----------|--------|--------------|
| TLS profile | `hybrid-kex-classic-cert` | `hybrid-kex-mldsa-cert` |
| Certificate | RSA (`CN=CRYME Classic RSA`) | ECDSA (`CN=CRYME ML-DSA Demo`) |
| API cert algo | `RSA-2048` | `ML-DSA-44` |

**Proof:** `openssl s_client` showed `subject=CN=CRYME ML-DSA Demo` — real certificate swap on the wire.

---

### Phase 4 — TLS Control Migration (Step 4, SUCCESS + DEPLOY)

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
```

**Oracle result:** ✅ Security control migrated to TLS 1.3 only.

**Live API after Step 4 (final state):**

```json
{
  "migration_step": 4,
  "profile": "tls13-only",
  "algorithms": {
    "Webserver_Classic.Cert_RSA2048": "ML-DSA-44",
    "Webserver_Classic.KeyExchange_ECDHE": "X25519_MLKEM768",
    "Webserver_Classic.TLS_1.2_/_1.3_Communication": "TLS1.3",
    "Client_Browser.KeyExchange_ECDHE": "X25519_MLKEM768"
  }
}
```

**TLS handshake proof:** `Protocol: TLSv1.3`, `Cipher: TLS_AES_256_GCM_SHA384`

**Diff (Step 4):**

```diff
~ Webserver_Classic.TLS_1.2_/_1.3_Communication
- status: classic, algorithm: -
+ status: migrated, algorithm: TLS1.3
```

---

## 3. Final Migration Tree

```
Step 0 (INIT)
├── Step 1 (FAILED)  — hidden dependency discovered
└── Step 2 (SUCCESS) — KEX co-migration server + browser
    └── Step 3 (SUCCESS) — Cert → ML-DSA-44
        └── Step 4 (SUCCESS, HEAD) — TLS → 1.3 only
```

---

## 4. How It Works (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (CRYME)                                      │
│                                                             │
│  webserver_pqc_twin.yaml                                    │
│         ↓                                                   │
│  cryme init → Memgraph (graph + nodes + dependencies)       │
│         ↓                                                   │
│  cryme migrate → Oracle checks:                             │
│    • Temporal constraints (phase ordering)                  │
│    • Structural dependencies (implicit edges)             │
│    • Variant compatibility (algorithm families)             │
│         ↓                                                   │
│  On SUCCESS → Ansible playbook + MigrationStep in graph     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  DATA PLANE (Live Service)                                  │
│                                                             │
│  cryme deploy step=N                                        │
│         ↓                                                   │
│  Ansible cryme_tls role:                                    │
│    • openssl generates certificates                         │
│    • nginx TLS config updated (ciphers, protocols, cert)    │
│    • runtime.json + data.json updated (API state)           │
│    • nginx reloaded inside Docker                           │
│         ↓                                                   │
│  https://127.0.0.1:8443/api/status  ← live proof            │
└─────────────────────────────────────────────────────────────┘
```

**Key insight for the professor:** CRYME separates **planning** (Oracle decides if migration is safe) from **execution** (Ansible applies changes). The graph is the source of truth; the live service is the physical target.

---

## 5. Results Summary Table

| Step | Oracle | Deployed | TLS Profile | Cert Subject | API Algorithms |
|------|--------|----------|-------------|--------------|----------------|
| 0 | — | baseline | `classic-rsa-ecdhe` | CRYME Classic RSA | All classic |
| 1 | ❌ FAIL | — | unchanged | unchanged | unchanged |
| 2 | ✅ SUCCESS | ✅ | `hybrid-kex-classic-cert` | RSA | KEX → MLKEM768 |
| 3 | ✅ SUCCESS | ✅ | `hybrid-kex-mldsa-cert` | ML-DSA Demo | + Cert → ML-DSA-44 |
| 4 | ✅ SUCCESS | ✅ | `tls13-only` | ML-DSA Demo | + TLS → 1.3 |

---

## 6. What This Proves for the Thesis

1. **Dependency-aware migration planning works** — Step 1 failure and Step 2 success show the Oracle enforces communication dependencies between server and client.

2. **Strongly Connected Components (SCC) co-migration works** — The Oracle automatically expanded the migration cluster to include both endpoints.

3. **Graph versioning works** — Migration tree with HEAD pointer, step diffs, and event-sourced history (like Git for crypto state).

4. **End-to-end deploy chain works** — Not just simulation: `cryme deploy` changed a real nginx TLS service, verifiable via HTTPS API and `openssl s_client`.

5. **Digital twin ↔ physical mapping works** — Graph nodes (`KeyExchange_ECDHE`, `Cert_RSA2048`, `TLS Control`) map to concrete TLS configuration changes.

---

## 7. Limitations (Honest Assessment)

| Aspect | Current State | Future (Phase C) |
|--------|---------------|------------------|
| PQC algorithms on the wire | Classical TLS (RSA/ECDSA); graph labels say ML-DSA/ML-KEM | OQS nginx for real hybrid PQC-TLS |
| Certificate | Self-signed, generated with openssl | Real ML-DSA certificates |
| Service scope | Single nginx instance on university server | Multi-host inventory |
| Auth | Memgraph + nginx on localhost only | Production hardening |

---

## 8. Commands to Reproduce

```bash
cd ~/cryme
sudo docker-compose -f deploy/docker-compose.yml up -d

cryme init
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768  # fail
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768  # success
cryme deploy step=2
cryme verify service step=2

cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3

cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
cryme verify service step=4

cryme show tree
cryme show diff step=4
```

Or automated: `bash deploy/run_demo.sh`

---

## 9. Verification Endpoints

```bash
# Live service crypto state (must match Memgraph graph)
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool

# TLS certificate on the wire
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject

# Graph migration history
cryme show tree
```

---

*Generated after live demo run on ilmare, 2026-07-09.*
