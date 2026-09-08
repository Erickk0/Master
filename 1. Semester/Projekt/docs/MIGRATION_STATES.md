# CRYME — Systemzustände pro Migrationsschritt

> **See [GUIDE.md](../GUIDE.md) § States vs. Steps** for the summary. This file has full state diagrams.

Legende (wie in den Handskizzen):

- 🟡 **classic** — noch nicht migriert
- 🟢 **migrated** — erfolgreich migriert
- 🔴 **failed attempt** — Migration versucht, Oracle hat abgelehnt (Zustand unverändert)
- ✓ / ✗ — Oracle-Antwort

---

## Übersicht: Zustandsübergänge

```mermaid
stateDiagram-v2
    direction LR
    S0: Step 0 Baseline
    S1: Step 1 FAIL
    S2: Step 2 SUCCESS
    S3: Step 3 SUCCESS
    S4: Step 4 SUCCESS

    S0 --> S1: migrate server KEX alone
    S1 --> S2: migrate server+client KEX
    S2 --> S3: migrate cert to ML-DSA-44
    S3 --> S4: migrate TLS to 1.3 only
```

---

## Step 0 — Baseline (Init)

**Befehl:** `cryme init`  
**HEAD:** Step 0 (init)  
**Live-API:** `migration_step: 0`, `profile: classic-rsa-ecdhe`

### Knotenzustand

```mermaid
flowchart TB
  subgraph ws [Webserver_Classic]
    KEX_S["KeyExchange_ECDHE<br/>classic / ECDHE"]
    CERT["Cert_RSA2048<br/>classic / RSA-2048"]
    TLS["TLS 1.2/1.3 Communication<br/>classic / TLS1.2/1.3"]
    TLS --> CERT
    TLS --> KEX_S
  end
  subgraph cb [Client_Browser]
    KEX_C["KeyExchange_ECDHE<br/>classic / ECDHE"]
  end
  KEX_S <-.->|"GLOBAL_DEP (hidden)"| KEX_C
```

| Knoten | Status | Baseline | Active |
|--------|--------|----------|--------|
| `Webserver_Classic.KeyExchange_ECDHE` | classic | ECDHE | — |
| `Webserver_Classic.Cert_RSA2048` | classic | RSA-2048 | — |
| `Webserver_Classic.TLS_1.2_/_1.3_Communication` | classic | TLS1.2/1.3 | — |
| `Client_Browser.KeyExchange_ECDHE` | classic | ECDHE | — |

### Verifikation

```bash
cryme show state step=0
curl -sk https://127.0.0.1:8443/api/status
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

**Erwartung:** `CN=CRYME Classic RSA`, TLS 1.2/1.3, KEX ECDHE.

---

## Step 1 — Isolierte Server-KEX-Migration (FAILED)

**Befehl:**
```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Oracle:** ✗ FAILED — versteckte Abhängigkeit entdeckt

### Knotenzustand (unverändert, aber Kante gelernt)

```mermaid
flowchart TB
  subgraph ws [Webserver_Classic]
    KEX_S["KeyExchange_ECDHE<br/>classic / ECDHE"]
    CERT["Cert_RSA2048<br/>classic / RSA-2048"]
    TLS["TLS 1.2/1.3 Communication<br/>classic"]
    TLS --> CERT
    TLS --> KEX_S
  end
  subgraph cb [Client_Browser]
    KEX_C["KeyExchange_ECDHE<br/>classic / ECDHE"]
  end
  KEX_S <-->|"discovered IMPLICIT"| KEX_C
```

| Ereignis | Wirkung |
|----------|---------|
| Migration versucht | Server-KEX allein → PQC |
| Oracle blockiert | Browser noch classic → TLS bricht |
| Entdeckung | Bidirektionale Kante Server ↔ Browser in `E_known` |
| Zustand | **Unverändert** (rollback auf Step 0) |

**Migrationsbaum nach Step 1:**
```
Step 0 (INIT)
└── Step 1 (FAILED)
```

**Live-API:** unverändert (kein Deploy) — `migration_step: 0`

---

## Step 2 — Co-Migration Server + Client KEX (SUCCESS)

**Befehl:** gleicher migrate-Befehl (Oracle kennt jetzt die Kante)  
**Deploy:** `cryme deploy step=2`  
**Oracle:** ✓ SUCCESS

### Knotenzustand

```mermaid
flowchart TB
  subgraph ws [Webserver_Classic]
    KEX_S["KeyExchange_ECDHE<br/>migrated / X25519_MLKEM768"]
    CERT["Cert_RSA2048<br/>classic / RSA-2048"]
    TLS["TLS 1.2/1.3 Communication<br/>classic"]
    TLS --> CERT
    TLS --> KEX_S
  end
  subgraph cb [Client_Browser]
    KEX_C["KeyExchange_ECDHE<br/>migrated / X25519_MLKEM768"]
  end
  KEX_S <-->|"IMPLICIT discovered"| KEX_C
```

| Knoten | Status | Baseline | Active |
|--------|--------|----------|--------|
| `Webserver_Classic.KeyExchange_ECDHE` | migrated | ECDHE | X25519_MLKEM768 |
| `Client_Browser.KeyExchange_ECDHE` | migrated | ECDHE | X25519_MLKEM768 |
| `Webserver_Classic.Cert_RSA2048` | classic | RSA-2048 | — |
| `Webserver_Classic.TLS_1.2_/_1.3_Communication` | classic | TLS1.2/1.3 | — |

### Live-API nach Deploy

```json
{
  "migration_step": 2,
  "profile": "hybrid-kex-classic-cert",
  "algorithms": {
    "Webserver_Classic.KeyExchange_ECDHE": "X25519_MLKEM768",
    "Client_Browser.KeyExchange_ECDHE": "X25519_MLKEM768",
    "Webserver_Classic.Cert_RSA2048": "RSA-2048",
    "Webserver_Classic.TLS_1.2_/_1.3_Communication": "TLS1.2/1.3"
  }
}
```

**Migrationsbaum:**
```
Step 0 (INIT)
└── Step 1 (FAILED)
    └── Step 2 (SUCCESS) (HEAD)
```

---

## Step 3 — Zertifikat-Migration (SUCCESS)

**Befehl:**
```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
```

**Oracle:** ✓ SUCCESS

### Knotenzustand

```mermaid
flowchart TB
  subgraph ws [Webserver_Classic]
    KEX_S["KeyExchange_ECDHE<br/>migrated / X25519_MLKEM768"]
    CERT["Cert_RSA2048<br/>migrated / ML-DSA-44"]
    TLS["TLS 1.2/1.3 Communication<br/>classic"]
    TLS --> CERT
    TLS --> KEX_S
  end
  subgraph cb [Client_Browser]
    KEX_C["KeyExchange_ECDHE<br/>migrated / X25519_MLKEM768"]
  end
  KEX_S <--> KEX_C
```

| Knoten | Status | Active |
|--------|--------|--------|
| `Webserver_Classic.Cert_RSA2048` | migrated | ML-DSA-44 |
| (alle KEX-Knoten) | migrated | X25519_MLKEM768 |

### Verifikation auf dem Draht

```bash
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

**Erwartung:** `subject=CN=CRYME ML-DSA Demo` (ECDSA-Stand-in für ML-DSA im PoC)

---

## Step 4 — TLS 1.3 only (SUCCESS, final)

**Befehl:**
```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
```

**Oracle:** ✓ SUCCESS — alle 4 Knoten migrated

### Knotenzustand (Endzustand)

```mermaid
flowchart TB
  subgraph ws [Webserver_Classic]
    KEX_S["KeyExchange_ECDHE<br/>migrated"]
    CERT["Cert_RSA2048<br/>migrated"]
    TLS["TLS 1.2/1.3 Communication<br/>migrated / TLS1.3"]
    TLS --> CERT
    TLS --> KEX_S
  end
  subgraph cb [Client_Browser]
    KEX_C["KeyExchange_ECDHE<br/>migrated"]
  end
  KEX_S <--> KEX_C
```

| Feld | Wert |
|------|------|
| `profile` | `tls13-only` |
| `migration_step` | `4` |
| Alle Knoten | `migrated` |

### curl-Flags (Client_Browser)

Nach Step 4: `CRYME_CURL_TLSFLAGS=--tlsv1.3 --tls-max 1.3`

---

## Zwei Pfade im Migrationsbaum (Verzweigung)

Wie in den Handskizzen: Nach einem erfolgreichen Zustand kann ein **anderer Migrationsschritt** zu einem alternativen Endzustand führen (z. B. andere Zertifikatsvariante `ML-DSA-65` statt `ML-DSA-44`). Fehlgeschlagene Versuche erscheinen als Zweige:

```
Step 0
└── Step 1 (FAILED) — isolierte Server-KEX
    ├── Step 2 (SUCCESS) — Co-Migration  ← HEAD im Standard-Demo
    │   ├── Step 3 (SUCCESS) — Cert
    │   │   └── Step 4 (SUCCESS) — TLS1.3
    └── Step N (ABORTED) — Policy-Verletzung (z. B. Webserver_PQC zu früh)
```

`cryme show tree` zeigt diese Verzweigungen; `cryme show state step=N` zeigt den **Zustand** am jeweiligen Knoten des Erfolgspfads.

---

## CLI-Befehle pro Zustand

| Zustand | Befehl |
|---------|--------|
| Baseline | `cryme show state step=0` |
| Nach Fehlschlag | `cryme show state step=0` (Zustand gleich; `show tree` zeigt Step 1) |
| Nach Step 2 Deploy | `cryme show state step=2` + `curl -sk https://127.0.0.1:8443/api/status` |
| Diff eines Schritts | `cryme show diff step=N` |
| Vollständige Schritt-Info | `cryme show step step=N` |

---

## Verwandte Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [DOMAIN_ANALYSIS.md](DOMAIN_ANALYSIS.md) | Zustand vs. Schritt, Akteure |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | ER-Diagramm, Knoten-IDs |
| [TLS_ALGORITHMS.md](TLS_ALGORITHMS.md) | Profile und curl-Flags pro Schritt |
| [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) | Demo-Skript |
