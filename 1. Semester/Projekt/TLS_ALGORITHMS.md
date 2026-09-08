# CRYME — TLS-Varianten, Algorithmen und curl-Verifikation

> **See [GUIDE.md](GUIDE.md) § TLS Profiles & Algorithms** for the summary. This file is the full matrix.

---

## 1. Erlaubte TLS-Profile

Die Ansible-Rolle `cryme_tls` leitet das nginx-Profil aus den `target_algorithms` der migrierten Knoten ab (`deploy/roles/cryme_tls/tasks/main.yml`).

| Profil | Cert-Algorithmus | KEX | TLS-Protokoll | nginx `ssl_protocols` |
|--------|------------------|-----|---------------|----------------------|
| `classic-rsa-ecdhe` | RSA-2048 | ECDHE | TLS1.2/1.3 | `TLSv1.2 TLSv1.3` |
| `hybrid-kex-classic-cert` | RSA-2048 | X25519_MLKEM768 | TLS1.2/1.3 | `TLSv1.2 TLSv1.3` |
| `mldsa-cert` | ML-DSA-* | ECDHE | TLS1.2/1.3 | `TLSv1.2 TLSv1.3` |
| `hybrid-kex-mldsa-cert` | ML-DSA-* | X25519_MLKEM768 | TLS1.2/1.3 | `TLSv1.2 TLSv1.3` |
| `tls13-only` | beliebig | beliebig | TLS1.3 only | `TLSv1.3` |

Profile werden im Response-Header und in `/api/status` als `profile` ausgegeben:

```bash
curl -skI https://127.0.0.1:8443/health | grep -i x-cryme-tls-profile
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

---

## 2. curl-Flags pro Profil (Client_Browser)

Der `cryme-curl-client`-Container liest `deploy/client/expect.env`:

| Profil / Schritt | `CRYME_CLIENT_PROFILE` | `CRYME_EXPECT_KEX` | `CRYME_CURL_TLSFLAGS` |
|------------------|------------------------|--------------------|-----------------------|
| Baseline (Step 0) | `classic-ecdhe` | `ECDHE` | `--tlsv1.2 --tls-max 1.3` |
| Hybrid KEX (Step 2+) | `hybrid-mlkem768` | `X25519_MLKEM768` | `--tlsv1.2 --tls-max 1.3` |
| TLS 1.3 only (Step 4) | `hybrid-mlkem768` | `X25519_MLKEM768` | `--tlsv1.3 --tls-max 1.3` |

Diese Variablen werden von Ansible bei `cryme deploy step=N` gesetzt (`client_expect.env.j2`).

### Manuelle curl-Prüfungen

```bash
# Vom Host
curl -skv https://127.0.0.1:8443/health 2>&1 | grep -E 'SSL connection|TLSv|subject:'

# TLS 1.3 erzwingen
curl -skv --tlsv1.3 --tls-max 1.3 https://127.0.0.1:8443/health

# TLS 1.2 erzwingen
curl -skv --tlsv1.2 --tls-max 1.2 https://127.0.0.1:8443/health

# Aus dem Client-Container (simuliert Browser)
docker exec cryme-curl-client sh -c 'source /client/expect.env && curl -skv $CRYME_CURL_TLSFLAGS https://nginx-classic/health'
```

### openssl-Prüfung

```bash
echo | openssl s_client -connect 127.0.0.1:8443 -servername localhost 2>&1 \
  | grep -E 'Protocol|Cipher|subject=|issuer='
```

Vollständiger Verifikationslauf:

```bash
cryme verify tls baseline
cryme verify tls step=2
cryme verify service step=4
```

---

## 3. Deklarierte Algorithmen im Digital Twin

Zielalgorithmen müssen als `migration_variants` in `webserver_pqc_twin.yaml` stehen. Aktuell im Webserver-Szenario:

### Webserver_Classic

| Asset | Baseline | Erlaubte Zielvarianten |
|-------|----------|------------------------|
| `Cert_RSA2048` | RSA-2048 | `ML-DSA-44`, `ML-DSA-65` |
| `KeyExchange_ECDHE` | ECDHE | `X25519_MLKEM768` |

### Client_Browser

| Asset | Baseline | Erlaubte Zielvarianten |
|-------|----------|------------------------|
| `KeyExchange_ECDHE` | ECDHE | `X25519_MLKEM768` |

### SecurityControl (freie Werte)

| Control | Baseline | Erlaubte Werte |
|---------|----------|----------------|
| `TLS 1.2 / 1.3 Communication` | TLS1.2/1.3 | `TLS1.3`, `TLS1.2/1.3` |

Neue Algorithmen hinzufügen: Variant in YAML ergänzen, dann `cryme init` (Graph neu laden).

---

## 4. Migration auf beliebige Algorithmen

### Regel 1: CryptoAssets — Ziel muss im Katalog sein

```bash
# Erfolg: X25519_MLKEM768 ist in migration_variants
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768

# Fehler: unbekannter Algorithmus
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE FALCON-1024
# → Target algorithm/variant 'FALCON-1024' not available for asset '...'
```

Die Oracle-Funktion `resolveTargetVariant()` prüft exakte Übereinstimmung mit `PQCVariant.algorithm` oder `variant_id`. Für SCC-Nachbarn ohne explizites Ziel wählt `findCompatibleVariant()` eine passende Familie (z. B. `mlkem` ↔ `X25519_MLKEM768`).

### Regel 2: SecurityControls — freie Zielwerte

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
```

### Regel 3: Mehrere Knoten, ein Algorithmus

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE,Client_Browser.KeyExchange_ECDHE X25519_MLKEM768
```

### Regel 4: Pro Knoten unterschiedlicher Algorithmus

```bash
cryme migrate \
  id=Webserver_Classic.Cert_RSA2048:ML-DSA-44 \
  id=Webserver_Classic.KeyExchange_ECDHE:X25519_MLKEM768
```

### Regel 5: SCC-Erweiterung

Wenn Knoten A und B in derselben Strongly Connected Component liegen, migriert CRYME automatisch den gesamten Cluster — auch wenn nur ein Knoten angegeben wurde.

---

## 5. Mapping: Graph-Algorithmus → TLS auf dem Draht

| Graph `active_algorithm` | Wire-Verhalten (PoC Phase B) | Hinweis |
|--------------------------|------------------------------|---------|
| `ECDHE` | ECDHE-RSA cipher suites | Klassisch |
| `X25519_MLKEM768` | Hybrid-KEX cipher suites | ML-KEM als Label; wire = ECDHE-Varianten |
| `RSA-2048` | `classic_rsa.crt` | Klassisches Zertifikat |
| `ML-DSA-44` | `migrated_ecdsa.crt` | ECDSA-Stand-in für ML-DSA |
| `TLS1.2/1.3` | `ssl_protocols TLSv1.2 TLSv1.3` | Beide Versionen |
| `TLS1.3` | `ssl_protocols TLSv1.3` | Nur 1.3 |

**Ehrliche Limitation (PoC):** ML-DSA / ML-KEM-Namen werden auf klassische OpenSSL-Primitive gemappt. Echte PQC-Handshakes = Phase C (OQS nginx). Die Oracle-Logik und Deploy-Pipeline sind vollständig live.

---

## 6. Demo-Schritte → Profile → curl

| Schritt | Deploy-Befehl | `profile` | openssl subject | curl TLS |
|---------|---------------|-----------|-----------------|----------|
| 0 | (init) | `classic-rsa-ecdhe` | `CN=CRYME Classic RSA` | 1.2/1.3 |
| 2 | `cryme deploy step=2` | `hybrid-kex-classic-cert` | `CN=CRYME Classic RSA` | 1.2/1.3 |
| 3 | `cryme deploy step=3` | `hybrid-kex-mldsa-cert` | `CN=CRYME ML-DSA Demo` | 1.2/1.3 |
| 4 | `cryme deploy step=4` | `tls13-only` | `CN=CRYME ML-DSA Demo` | 1.3 only |

---

## 7. Umgebungsvariablen

| Variable | Default | Zweck |
|----------|---------|-------|
| `CRYME_TLS_HOST` | `127.0.0.1` | TLS-Verifikationsziel |
| `CRYME_TLS_PORT` | `8443` | Port |
| `CRYME_NGINX_CONTAINER` | `cryme-nginx-classic` | Docker-Container |
| `CRYME_CURL_CONTAINER` | `cryme-curl-client` | Client-Container |
| `CRYME_CURL_TLSFLAGS` | (aus expect.env) | curl TLS-Version-Flags |
| `CRYME_HOME` | `~/cryme` | Projektroot (Shell-Setup) |

---

## 8. Verwandte Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [MIGRATION_STATES.md](MIGRATION_STATES.md) | Zustand pro Schritt |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | Asset vs. Algorithmus-Felder |
| [CLI_GUIDE.md](CLI_GUIDE.md) | migrate, deploy, verify |
| [LIVE_SERVICE.md](LIVE_SERVICE.md) | Live HTTPS-Architektur |
