# CRYME University Server Deployment Plan

> Saved plan for deploying CRYME on a Linux university server with Docker, a real TLS dummy stack (nginx + client), and Ansible-driven migration. Implement when ready — not yet built.

**Related docs:** [CLI_GUIDE.md](CLI_GUIDE.md) · [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) · [migration_demo_commands.md](migration_demo_commands.md)

---

## Implementation checklist

- [ ] **Phase A:** `deploy/docker-compose.yml` (Memgraph + nginx-classic + curl-client)
- [ ] **Phase A:** `deploy/install_prerequisites.sh`, `deploy/verify_tls.sh`
- [ ] **Phase B:** `deploy/roles/cryme_tls/` (node → nginx task mapping)
- [ ] **Phase B:** `deploy/inventory/hosts.ini`, `deploy/ansible.cfg`
- [ ] **Phase B:** Extend `web_app/oracle.js` — `include_role: cryme_tls`, configurable hosts
- [ ] **Phase B:** `cryme deploy step=N` (+ optional `cryme verify tls`)
- [ ] **Phase B:** `deploy/run_demo.sh` (migrate → deploy → verify loop)
- [ ] **Phase C (optional):** OQS nginx container for hybrid PQC-TLS

---

## Ziel

Auf dem Uni-Server soll die **komplette Kette** demonstrierbar sein:

```mermaid
flowchart LR
  subgraph control [CRYME Control Plane]
    YAML[webserver_pqc_twin.yaml] --> Cryme[cryme CLI]
    Cryme --> MG[Memgraph]
    Cryme --> Oracle[Oracle SCC + Rules]
    Cryme --> PB[playbooks/]
  end
  subgraph runtime [Docker Runtime auf dem Server]
    PB --> Ansible[ansible-playbook]
    Ansible --> Nginx[nginx TLS webserver]
    Ansible --> Client[curl TLS client]
    Nginx --> TLS[TLS Handshake]
    Client --> TLS
  end
  Oracle -.->|"validiert Plan"| PB
  TLS -.->|"verify_tls.sh"| Demo[Demo Beweis]
```

**Installierbar auf dem Server:** Docker, Docker Compose, Node.js/npm, Ansible, Git.

---

## Kann das der aktuelle CRYME-Stand?

### Was heute schon funktioniert (kein Server-Deploy nötig)

| Fähigkeit | Status | Wo |
|-----------|--------|-----|
| Digital Twin aus YAML laden | Ja | `webserver_pqc_twin.yaml`, `cryme init` |
| Abhängigkeitsgraph + Oracle (temporal, structural, variant) | Ja | `web_app/oracle.js` |
| SCC Co-Migration, implizite Kanten entdecken | Ja | Step 1 fail → Step 2 success |
| Migration History (tree, graph, diff, HEAD) | Ja | `cryme show tree/graph/diff/step` |
| Multi-Node migrate, Playbook-Generierung | Ja | `cryme` |
| Mapping Node → Ziel-Algorithmus in Playbook-Vars | Ja | `target_algorithms` in generierten YAMLs |

**Fazit:** CRYME als **Migrations-Oracle und Planungs-Engine** ist demo-ready. Das Modell (Cert, KeyExchange, TLS Control, Browser) passt zum Webserver-Szenario.

### Was heute noch NICHT funktioniert (Lücke)

| Fähigkeit | Status | Problem |
|-----------|--------|---------|
| Echter TLS-Webserver | Nein | Kein nginx/Apache im Repo |
| Playbook ändert TLS live | Nein | `generatePlaybookContent()` schreibt nur `/etc/pqc/keys_step_N.conf` (Kommentar-Datei) |
| `pqc_crypto_daemon` | Nein | Fiktiver systemd-Service, existiert nicht |
| `inventory/localhost` | Nein | Im CLI_GUIDE referenziert, fehlt im Repo |
| Browser-Client TLS-Test | Nein | `Client_Browser` ist Graph-Knoten ohne echte Maschine |
| Echtes PQC-TLS (ML-KEM, ML-DSA) | Nein | Kein OQS/OpenSSL 3 Provider, keine Zertifikatsgenerierung |

**Fazit:** CRYME **entscheidet korrekt**, *was* wann migriert werden darf — aber die generierten Playbooks **führen die TLS-Migration am echten Webserver noch nicht aus**. Dafür brauchen wir die neue `deploy/`-Schicht (Phase B/C unten).

---

## Architektur (University Server mit Docker)

```mermaid
flowchart TB
  subgraph host [Linux Uni-Server]
    CrymeCLI[cryme CLI + npm]
    MemgraphDocker[Memgraph Container :7687]
    Compose[docker compose stack]
    AnsibleCtrl[Ansible control node = host]
  end
  subgraph compose [deploy/docker-compose.yml]
    NginxClassic[nginx-classic :8443 RSA+ECDHE]
    NginxPQC[nginx-pqc optional :8444 hybrid]
    CurlClient[curl-client TLS probe]
  end
  CrymeCLI --> MemgraphDocker
  CrymeCLI --> AnsibleCtrl
  AnsibleCtrl --> NginxClassic
  AnsibleCtrl --> CurlClient
```

| Komponente | Rolle | Installation |
|------------|-------|--------------|
| **Docker + Compose** | Runtime für TLS-Dummy | `apt install docker.io docker-compose-plugin` |
| **Memgraph** | Graph-DB | Docker: `memgraph/memgraph` |
| **Node.js 18+ / npm** | CRYME CLI | Paketmanager + `web_app/npm install` |
| **Ansible** | Playbook gegen Container/Host | `apt install ansible` |
| **nginx-classic** | Echter TLS-Webserver (RSA-2048 + ECDHE) | Docker image + mounted certs/config |
| **curl-client** | Simuliert `Client_Browser` TLS-Handshake | Docker, ruft nginx auf |

---

## Phasenplan

### Phase A — Infrastruktur (Demo-Grundlage)

Ziel: Server stack lauffähig, CRYME CLI wie lokal.

- `deploy/docker-compose.yml`:
  - Service `memgraph` (Port 7687 → localhost)
  - Service `nginx-classic`: HTTPS auf `:8443`, klassisches TLS (RSA + ECDHE)
  - Service `curl-client`: `curl -vk https://nginx-classic:443/health`
- `deploy/install_prerequisites.sh`: Docker, npm, ansible, git
- `deploy/verify_tls.sh`: vor/nach Migration Cipher/Protocol ausgeben (`openssl s_client` / `curl -v`)
- `cryme init` + volle Migrate-Demo wie `migration_demo_commands.md`

**Ergebnis Phase A:** TLS läuft klassisch; CRYME-Oracle läuft; Playbooks noch ohne Wirkung auf nginx.

### Phase B — Graph → echter TLS-Deploy (empfohlen für Thesis-Demo)

Ziel: Jeder erfolgreiche `cryme migrate`-Step **ändert nginx wirklich**.

Neue Ansible-Rolle `deploy/roles/cryme_tls/`:

| Graph-Knoten (YAML) | Ansible-Wirkung auf nginx |
|---------------------|---------------------------|
| `Webserver_Classic.KeyExchange_ECDHE` → `X25519_MLKEM768` | Update `ssl_ciphers` / KEX-Config; später hybrid via OQS |
| `Webserver_Classic.Cert_RSA2048` → `ML-DSA-44/65` | Deploy neues Server-Zertifikat (Demo: self-signed) |
| `Webserver_Classic.TLS_1.2_/_1.3_Communication` → `TLS1.3` | `ssl_protocols TLSv1.3;`, reload nginx |
| `Client_Browser.KeyExchange_ECDHE` | Update curl-client flags / cipher suite expectation |

Inventory `deploy/inventory/hosts.ini`:

```ini
[webserver]
nginx-classic ansible_host=127.0.0.1 ansible_port=2222

[clients]
curl-client ansible_connection=docker

[webserver:vars]
nginx_config_path=/etc/nginx/conf.d/tls.conf
tls_listen_port=8443
```

**Code-Änderung in CRYME:** `web_app/oracle.js` → `generatePlaybookContent()`:

```yaml
- name: Apply CRYME migration to TLS stack
  ansible.builtin.include_role:
    name: cryme_tls
  vars:
    migration_step: "{{ migration_step }}"
    target_algorithms: "{{ target_algorithms }}"
```

Hosts: `process.env.CRYME_ANSIBLE_HOSTS || "webserver"`.

**Ergebnis Phase B:** Nach Step 2 zeigt `verify_tls.sh` geänderte Cipher/Protocol; nach Step 6 nur TLS 1.3.

### Phase C — Echtes PQC-TLS (optional)

- Container `nginx-oqs` (Open Quantum Safe Provider)
- Hybrid-KEX `X25519_MLKEM768`
- ML-DSA-Zertifikate experimentell — Phase B reicht meist für Thesis-Demo

---

## Mapping: YAML Twin ↔ Docker-Welt

`webserver_pqc_twin.yaml` = logische Wahrheit (Oracle). Docker = physische Instanz.

```mermaid
flowchart LR
  subgraph graph [Memgraph Graph]
    WS[Webserver_Classic.KeyExchange_ECDHE]
    Cert[Webserver_Classic.Cert_RSA2048]
    TLS[Webserver_Classic.TLS Control]
    Browser[Client_Browser.KeyExchange_ECDHE]
  end
  subgraph physical [Docker]
    Nginx[nginx-classic container]
    Curl[curl-client container]
  end
  WS --> Nginx
  Cert --> Nginx
  TLS --> Nginx
  Browser --> Curl
  Curl -->|"TLS handshake"| Nginx
```

Optional: `deploy_target: nginx-classic` pro Component in YAML, sonst `deploy/host_mapping.yml`.

---

## Demo-Ablauf (CLI + Ansible + TLS-Verify)

```bash
# Setup (einmalig)
sudo bash deploy/install_prerequisites.sh
docker compose -f deploy/docker-compose.yml up -d
cd web_app && npm install && cd ..
node cryme init

# Baseline: klassisches TLS
bash deploy/verify_tls.sh baseline

# CRYME Migration + Deploy pro Step
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768  # fail
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768  # success
node cryme deploy step=2
bash deploy/verify_tls.sh step=2

# Steps 4–6 Cert, TLS Control ...
node cryme show tree
node cryme show diff step=6
bash deploy/verify_tls.sh step=6
```

---

## Dateien die noch erstellt werden

| Datei | Aktion |
|-------|--------|
| `deploy/docker-compose.yml` | Memgraph + nginx-classic + curl-client |
| `deploy/nginx/` | TLS configs (classic + migrated templates) |
| `deploy/roles/cryme_tls/` | Node→nginx task mapping |
| `deploy/inventory/hosts.ini` | webserver + client groups |
| `deploy/verify_tls.sh` | TLS handshake proof |
| `deploy/run_demo.sh` | migrate → deploy → verify loop |
| `web_app/oracle.js` | `include_role: cryme_tls`, konfigurierbare hosts |
| `cryme` | `deploy step=N`, optional `verify tls` |

---

## Sicherheit (University Server)

- Memgraph + nginx nur auf localhost / internes Docker-Netz
- Ports nach außen: nur `:8443` HTTPS Demo (Firewall einschränken)
- Self-signed Certs für Demo
- CRYME Web-UI (3050) optional, nicht für Server-Demo nötig

---

## Implementierungsreihenfolge

1. **Phase A:** docker-compose + install script + verify_tls baseline + CRYME CLI demo
2. **Phase B:** cryme_tls Ansible role + oracle.js playbook extension + inventory
3. **cryme deploy step=N** + run_demo.sh Automatisierung
4. **Phase C (optional):** OQS nginx container für echtes hybrid PQC-TLS

---

## Kurzantwort

**Können wir mit dem aktuellen CRYME-Stand Security Controls / TLS zu PQC migrieren und am echten Webserver zeigen?**

- **Oracle & Migrationsplanung:** Ja — vollständig.
- **Ansible deployt heute echtes TLS:** Nein — nur Platzhalter-Config.
- **Mit Phase A:** TLS-Webserver läuft, CRYME plant — getrennte Beweise.
- **Mit Phase B (empfohlen):** Ja für Demo — nginx TLS ändert sich schrittweise gemäß CRYME-Steps.
- **Mit Phase C:** Echtes PQC am Wire — machbar mit OQS-Docker, zusätzlicher Aufwand.
