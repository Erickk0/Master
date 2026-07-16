# CRYME Live Demo Cheat Sheet

> **Full guide:** [GUIDE.md](GUIDE.md) · **Print this page** for the live meeting.

**Server:** `ilmare.local.cs.hs-rm.de` · **Project:** `~/cryme` · **Live service:** `https://127.0.0.1:8443`

Print this page and keep it open during the demo.

---

## Opening line (10 sec)

> “CRYME plans crypto migrations in a graph database. When the Oracle approves a step, Ansible deploys it to a **running HTTPS server** — you can query that server and see the state change.”

---

## Before the meeting — start stack

```bash
cd ~/cryme
sudo docker-compose -f deploy/docker-compose.yml up -d
sudo docker ps --filter name=cryme
```

Expect 4 containers: `cryme-nginx-classic`, `cryme-memgraph`, `cryme-memgraph-lab`, `cryme-curl-client`.

---

## Demo flow (≈ 5 minutes)

### 1. Show it's a real service (30 sec)

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

**Say:** “This is a live HTTPS endpoint on port 8443 — not CRYME output, standard `curl` and `openssl`.”

| Check | Baseline value |
|-------|----------------|
| `migration_step` | `0` |
| `profile` | `classic-rsa-ecdhe` |
| Cert subject | `CN=CRYME Classic RSA` |

---

### 2. Reset graph **and live service** (10 sec)

```bash
cryme init
cryme show node
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

**Say:** “`cryme init` resets **both** Memgraph and the live HTTPS service to baseline (step 0, classic TLS).”

---

### 3. Oracle blocks unsafe migration (45 sec)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Expect:** ❌ `FAILED` — client browser still classic.

```bash
cryme show tree
```

**Say:** “Hidden dependency between server and client — Oracle refuses unsafe migration.”

---

### 4. Oracle approves co-migration (30 sec)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Expect:** ✅ `SUCCESS` — both server + client migrated.

**Say:** “Same command, but Oracle now knows the dependency — SCC co-migration.”

---

### 5. Deploy to live nginx (60 sec) — **main proof**

```bash
cryme deploy step=2
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

**Point at the screen — these changed:**

| Field | Before | After step 2 |
|-------|--------|--------------|
| `migration_step` | 0 | **2** |
| `profile` | `classic-rsa-ecdhe` | **`hybrid-kex-classic-cert`** |
| KEX algorithms | `ECDHE` | **`X25519_MLKEM768`** |

**Say:** “Same URL. Different response. The live service changed.”

---

### 6. Certificate migration on the wire (60 sec)

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

**Expect:** `subject=CN=CRYME ML-DSA Demo` (was `CN=CRYME Classic RSA`)

**Say:** “Real certificate swap — visible with `openssl`, independent of CRYME.”

---

### 7. TLS 1.3 only (45 sec)

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
cryme show tree
```

**Expect:** `profile: tls13-only`, all 4 nodes migrated, tree shows Step 4 as HEAD.

---

## Two views of the same truth (15 sec)

```bash
cryme show node          # Graph (Memgraph)
curl -sk https://127.0.0.1:8443/api/status   # Live service
```

**Say:** “Oracle graph and HTTPS API agree — planning and runtime are linked.”

---

## If something breaks

| Problem | Fix |
|---------|-----|
| Connection refused on 8443 | `sudo docker-compose -f deploy/docker-compose.yml up -d` |
| `cryme deploy` fails (docker) | Run with sudo: `sudo -E cryme deploy step=N` |
| Empty graph | `cryme init` |
| Wrong step number | `cryme show tree` — use actual SUCCESS step numbers |

Quick check: `bash deploy/check_memgraph.sh`

---

## Honest limitation (say this if asked)

> “Migration **logic and deploy** are fully live. ML-DSA / ML-KEM names map to classical TLS on the wire today. Real PQC handshakes = Phase C (OQS nginx).”

---

## Key URLs & commands reference

| What | Command / URL |
|------|----------------|
| Live API status | `curl -sk https://127.0.0.1:8443/api/status` |
| Live API data | `curl -sk https://127.0.0.1:8443/api/data` |
| TLS cert check | `openssl s_client -connect 127.0.0.1:8443` |
| Migration tree | `cryme show tree` |
| Step diff | `cryme show diff step=4` |
| Memgraph Lab | Port `3000` (Cursor forward or SSH tunnel) |
| Full report | `DEMO_REPORT_FOR.md` |

---

## Architecture (draw on whiteboard if needed)

```
YAML twin → cryme migrate → Oracle (Memgraph) → cryme deploy → Ansible → nginx :8443
                                              ↘ verify: curl / openssl
```

---

*CRYME — Post-Quantum Migration Oracle · hs-rm.de · 2026*
