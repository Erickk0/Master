# CRYME — Memgraph Guide

This guide explains how **Memgraph** is used in CRYME: connection, graph structure, Cypher queries, and how those queries relate to the **demo migration steps 0–4**.

> Code architecture: [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md)  
> Graph versioning: [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md)  
> State diagrams: [MIGRATION_STATES.md](MIGRATION_STATES.md)

---

## 1. What Memgraph does in CRYME

Memgraph is the **persistence layer** for:

1. The **digital twin** (nodes + edges from `webserver_pqc_twin.yaml`)
2. **Runtime status** (`status`, `active_algorithm` per node)
3. **Migration history** (`MigrationStep` events, HEAD pointer)

CRYME uses the **Bolt protocol** (compatible with `neo4j-driver`) and **Cypher**.

The Oracle in `web_app/oracle.js` does **not** run graph algorithms as Memgraph procedures. It loads the graph into memory, runs Tarjan SCC / validation in JavaScript, then writes the result back with Cypher.

---

## 2. How to connect

### 2.1 Local (Mac / Linux)

```bash
docker compose -f deploy/docker-compose.yml up -d
bash deploy/check_memgraph.sh
```

| Service | Address | Credentials |
|---------|---------|-------------|
| Bolt (CLI / driver) | `bolt://localhost:7687` | no user, no password |
| Memgraph Lab (GUI) | http://localhost:3000 | Connect: `bolt://localhost:7687` |

### 2.2 SSH tunnel (university server `ilmare`)

```bash
ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare
```

In the browser: http://localhost:3000 → connect to `bolt://localhost:7687`

### 2.3 Through the CRYME CLI (no GUI)

```bash
cryme show node          # all crypto nodes
cryme show tree          # migration history
cryme show state step=2  # state at step 2
cryme show graph step=2  # dependency graph at step 2
```

### 2.4 Node.js connection test

```bash
cd web_app && node check_db.js
```

Prints all `MigrationStep` nodes and `TRANSITION_TO` edges.

---

## 3. Graph overview (CRYME demo)

After `cryme init` the graph looks like this:

```
Webserver_Classic                    Client_Browser
     │                                    │
     ├── KeyExchange_ECDHE                ├── KeyExchange_ECDHE
     ├── Cert_RSA2048                     │
     └── TLS_1.2_/_1.3_Communication      │
              │                           │
              └──── GLOBAL_DEPENDENCY ────┘
                    (server KEX ↔ browser KEX)
```

### 3.1 Node labels

| Label | Count (demo) | Example ID |
|-------|--------------|------------|
| `Component` | 2 | `Webserver_Classic` |
| `CryptoAsset` | 3 | `Webserver_Classic.KeyExchange_ECDHE` |
| `SecurityControl` | 1 | `Webserver_Classic.TLS_1.2_/_1.3_Communication` |
| `PQCVariant` | several | target algorithms per asset |
| `MigrationStep` | grows with every migration | step=0, 1, 2, … |
| `SystemMeta` | 1 (after first migrate) | `head_step` pointer |

### 3.2 Edge types

| Relationship | Meaning | Visible in |
|--------------|---------|------------|
| `HAS_ASSET` | Component → CryptoAsset | structure |
| `HAS_CONTROL` | Component → SecurityControl | structure |
| `HAS_VARIANT` | CryptoAsset → PQCVariant | structure |
| `GLOBAL_DEPENDENCY` | Server KEX ↔ browser KEX | `cryme show graph` |
| `IMPLICIT_DEPENDENCY` | SecurityControl → CryptoAsset | `cryme show graph` |
| `EXPLICIT_DEPENDENCY` | Declared functional dependency | `cryme show graph` |
| `TEMPORAL_CONSTRAINT` | Component phase ordering | structure |
| `TRANSITION_TO` | Step N → Step N+1 | `cryme show tree` |

---

## 4. Memgraph Lab — first steps

### 4.1 Show the whole graph

1. Open http://localhost:3000
2. Quick connect: `bolt://localhost:7687`
3. Run:

```cypher
MATCH (n)
RETURN n
LIMIT 80;
```

### 4.2 All CryptoAssets

```cypher
MATCH (a:CryptoAsset)
RETURN a.id AS asset,
       a.status AS status,
       a.algorithm AS baseline,
       a.active_algorithm AS active
ORDER BY a.id;
```

### 4.3 Dependency graph

```cypher
MATCH (a)-[r:GLOBAL_DEPENDENCY|EXPLICIT_DEPENDENCY|IMPLICIT_DEPENDENCY]->(b)
RETURN a.id AS from, type(r) AS rel, b.id AS to;
```

The `GLOBAL_DEPENDENCY` between server and browser KEX is why **step 1 fails**.

### 4.4 PQC target variants

```cypher
MATCH (a:CryptoAsset)-[:HAS_VARIANT]->(v:PQCVariant)
RETURN a.id AS asset, v.algorithm AS target_algo, v.security_level AS level
ORDER BY a.id, v.algorithm;
```

---

## 5. Query the migration history

### 5.1 All steps

```cypher
MATCH (s:MigrationStep)
RETURN s.step AS step,
       s.status AS status,
       s.action AS action,
       s.head AS head
ORDER BY s.step;
```

Equivalent CLI: `cryme show tree`

### 5.2 Migration tree

```cypher
MATCH (a:MigrationStep)-[:TRANSITION_TO]->(b:MigrationStep)
RETURN a.step AS parent, b.step AS child
ORDER BY parent, child;
```

### 5.3 HEAD pointer

```cypher
MATCH (m:SystemMeta {id: 'cryme'})
RETURN m.head_step AS head_step;
```

```cypher
MATCH (s:MigrationStep {head: true})
RETURN s.step AS head, s.status AS status, s.action AS action;
```

---

## 6. Demo steps 0–4 in Memgraph

Run the CLI commands first, then the Cypher next to each step. That is the intended pairing: **CLI mutates the graph, Lab inspects it**.

### Step 0 — Baseline (`cryme init`)

**CLI:**

```bash
cryme init
cryme show state step=0
```

**Cypher — are all nodes still classic?**

```cypher
MATCH (a:CryptoAsset)
RETURN a.id, a.status, a.algorithm, a.active_algorithm;
```

**Expected:**

| Node | status | algorithm | active_algorithm |
|------|--------|-----------|------------------|
| `Webserver_Classic.KeyExchange_ECDHE` | classic | ECDHE | null |
| `Webserver_Classic.Cert_RSA2048` | classic | RSA-2048 | null |
| `Client_Browser.KeyExchange_ECDHE` | classic | ECDHE | null |

```cypher
MATCH (s:MigrationStep {step: 0})
RETURN s.status, s.action, s.head;
```

**Expected after the first migrate (MERGE on step 0):** `status = 'init'`. Right after `cryme init` this node may not exist yet — only the twin topology is loaded.

**Live API** (reset by init, not by migrate):

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

**Expected:** `"migration_step": 0`, `"profile": "classic-rsa-ecdhe"`

---

### Step 1 — Isolated server KEX migration (FAILED)

**CLI:**

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
cryme show tree
```

**Cypher — failed step:**

```cypher
MATCH (s:MigrationStep {step: 1})
RETURN s.status, s.action, s.cluster, s.discovered_edge;
```

**Expected:**

| Field | Value |
|-------|-------|
| `status` | `failed` |
| `action` | `migrate_fail` |
| `cluster` | contains `Webserver_Classic.KeyExchange_ECDHE` |
| `discovered_edge` | server↔browser link |

**Cypher — node unchanged (still classic):**

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.KeyExchange_ECDHE'})
RETURN a.status, a.active_algorithm;
```

**Expected:** `status = 'classic'`, `active_algorithm = null`

**Cypher — newly discovered edge (Oracle learning):**

```cypher
MATCH (a)-[r:IMPLICIT_DEPENDENCY {discovered: true}]->(b)
RETURN a.id AS from, b.id AS to;
```

**HEAD** stays at step 0:

```cypher
MATCH (m:SystemMeta {id: 'cryme'}) RETURN m.head_step;
```

This is the example that shows why Memgraph stores **failed** events: the next migrate reuses the discovered implicit edge so both KEX nodes form one SCC.

---

### Step 2 — Co-migrate server + browser KEX (SUCCESS)

**CLI:**

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
cryme deploy step=2
cryme verify step=2
```

**Cypher — both KEX nodes migrated:**

```cypher
MATCH (a:CryptoAsset)
WHERE a.id CONTAINS 'KeyExchange'
RETURN a.id, a.status, a.active_algorithm, a.migrated_at_step;
```

**Expected:**

| Node | status | active_algorithm | migrated_at_step |
|------|--------|------------------|------------------|
| `Webserver_Classic.KeyExchange_ECDHE` | migrated | X25519_MLKEM768 | 2 |
| `Client_Browser.KeyExchange_ECDHE` | migrated | X25519_MLKEM768 | 2 |

**Cypher — step details:**

```cypher
MATCH (s:MigrationStep {step: 2})
RETURN s.status, s.cluster, s.variants, s.head;
```

**Expected:** `status = 'success'`, `head = true`, `cluster` contains both KEX nodes

**Live API after deploy:**

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

**Expected:** `"migration_step": 2`, KEX algorithms = `X25519_MLKEM768`

---

### Step 3 — Certificate ML-DSA-44 (SUCCESS)

**CLI:**

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
```

**Cypher:**

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.Cert_RSA2048'})
RETURN a.status, a.algorithm, a.active_algorithm, a.migrated_at_step;
```

**Expected:** `status = 'migrated'`, `active_algorithm = 'ML-DSA-44'`, `migrated_at_step = 3`

**Cypher — cumulative state (all migrated nodes so far):**

```cypher
MATCH (n)
WHERE (n:CryptoAsset OR n:SecurityControl) AND n.status = 'migrated'
RETURN n.id, n.active_algorithm, n.migrated_at_step
ORDER BY n.migrated_at_step;
```

**Expected:** 3 nodes (2× KEX + cert)

**TLS check (certificate changed):**

```bash
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

**Expected:** `CN=CRYME Live ML-DSA Demo` (ECDSA stand-in for ML-DSA)

---

### Step 4 — TLS 1.3 only (SUCCESS, everything migrated)

**CLI:**

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
cryme show state step=4
cryme verify step=4
```

**Cypher — SecurityControl:**

```cypher
MATCH (c:SecurityControl)
RETURN c.id, c.status, c.active_algorithm, c.migrated_at_step;
```

**Expected:** `active_algorithm = 'TLS1.3'`, `status = 'migrated'`

**Cypher — are all nodes migrated?**

```cypher
MATCH (n)
WHERE (n:CryptoAsset OR n:SecurityControl)
RETURN n.id, n.status, n.active_algorithm
ORDER BY n.id;
```

**Expected:** all 4 nodes `status = 'migrated'`

**Cypher — HEAD at step 4:**

```cypher
MATCH (s:MigrationStep {head: true})
RETURN s.step, s.status, s.action;
```

**Live API:**

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

**Expected:** `"migration_step": 4`, `"profile": "tls13-only"`

**Client simulation (curl-client container):**

```bash
docker exec cryme-curl-client sh -c '. /client/expect.env && curl -skv $CRYME_CURL_TLSFLAGS https://nginx-classic/health'
```

**Expected:** `CRYME_CURL_TLSFLAGS="--tlsv1.3 --tls-max 1.3"`

---

## 7. Two views: Memgraph vs. live API

| View | Source | When it updates |
|------|--------|-----------------|
| **Planning** | Memgraph (replay) | immediately after `cryme migrate` |
| **Live** | nginx `/api/status` | only after `cryme deploy step=N` |

### Example: step 2 migrated but not deployed

```bash
cryme show state step=2
# → KEX nodes: migrated

curl -sk https://127.0.0.1:8443/api/status
# → migration_step: 0  (not deployed yet!)
```

After `cryme deploy step=2` both must match.

**Check query — last successful step vs. live:**

```cypher
MATCH (m:SystemMeta {id: 'cryme'})
RETURN m.head_step AS memgraph_head;
```

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -c "import sys,json; print(json.load(sys.stdin)['migration_step'])"
```

Both values should be equal after deploy.

---

## 8. Useful queries for reviewers

### Node count per label

```cypher
MATCH (n)
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY count DESC;
```

### Variants of one asset

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.KeyExchange_ECDHE'})-[:HAS_VARIANT]->(v)
RETURN v.algorithm, v.security_level, v.performance;
```

### Failed steps

```cypher
MATCH (s:MigrationStep {status: 'failed'})
RETURN s.step, s.action, s.cluster, s.discovered_edge;
```

### Successful steps with algorithms

```cypher
MATCH (s:MigrationStep {status: 'success'})
RETURN s.step, s.cluster, s.variants
ORDER BY s.step;
```

### Visualize the graph (dependencies only)

```cypher
MATCH p=(a)-[r:GLOBAL_DEPENDENCY|IMPLICIT_DEPENDENCY|EXPLICIT_DEPENDENCY]->(b)
RETURN p;
```

---

## 9. Reset the graph

```bash
cryme init
```

Internally:

```cypher
MATCH (n) DETACH DELETE n;
```

Then `twin_loader.js` reloads the twin from YAML. **All migration history is lost** — that is intentional for demos.

---

## 10. Common problems

| Problem | Cause | Fix |
|---------|-------|-----|
| Connection refused :7687 | Memgraph container down | `docker compose -f deploy/docker-compose.yml up -d` |
| Empty graph | No `cryme init` | `cryme init` |
| Lab shows stale data | Cache / old session | Reload the page, run the query again |
| CLI cannot find Memgraph | Port not reachable | `bash deploy/check_memgraph.sh` |
| HEAD ≠ expected step | Wrong step number | `cryme show tree` |
| Memgraph ≠ live API | Deploy forgotten | `cryme deploy step=N` |

---

## 11. CLI ↔ Memgraph mapping

| CLI command | Memgraph operation |
|-------------|-------------------|
| `cryme init` | Clear graph + load YAML |
| `cryme show node` | `MATCH (n:CryptoAsset\|SecurityControl) …` |
| `cryme show tree` | `MATCH (s:MigrationStep) …` + `TRANSITION_TO` |
| `cryme show state step=N` | Replay via `reconstructStateAtStep()` |
| `cryme show graph step=N` | Replay + render edges |
| `cryme migrate …` | Writes `MigrationStep`, updates nodes |
| `cryme deploy step=N` | Reads replay state, **does not write** to Memgraph |

---

## 12. How the examples map to code

| Demo example | What to look at in Memgraph | Where it is written in code |
|--------------|-----------------------------|-----------------------------|
| Step 0 `cryme init` | `Component` / `CryptoAsset` / `SecurityControl` / `PQCVariant` | `twin_loader.js` via `initDatabase()` |
| Step 1 fail | `MigrationStep.status = failed`, `discovered_edge`, new `IMPLICIT_DEPENDENCY` | `migrateNodes()` + `checkOracleValidation()` |
| Step 2 success | both KEX `status = migrated`, HEAD = 2 | same functions; `updateHeadStep(2)` |
| Steps 3–4 | cert + SecurityControl `active_algorithm` | same write path, different node IDs |
| `cryme show state step=N` | reconstructed, not a stored snapshot | `reconstructStateAtStep()` in `oracle.js` |
| `cryme deploy` | graph unchanged | Ansible reads replay output only |

---

## 13. Further reading

| Document | Content |
|----------|---------|
| [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) | Event sourcing, HEAD, replay algorithm |
| [MIGRATION_STATES.md](MIGRATION_STATES.md) | State diagrams per step |
| [migration_explanation.md](migration_explanation.md) | Oracle SCC behaviour |
| [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) | Code architecture |
| [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) | 5-minute printable demo |
