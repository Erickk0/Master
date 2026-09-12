#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.2cm),
  numbering: "1",
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: luma(80))
      CRYME · Technische Dokumentation
      #h(1fr)
      Masterprojekt 2026
      #line(length: 100%, stroke: 0.4pt + luma(180))
    ]
  },
  footer: context [
    #set text(size: 8.5pt, fill: luma(80))
    #line(length: 100%, stroke: 0.4pt + luma(180))
    Hochschule RheinMain · Erick Zeiler
    #h(1fr)
    #counter(page).display("1")
  ],
)
#set text(font: "Times New Roman", size: 10.5pt, lang: "de")
#set par(justify: true, leading: 0.7em)
#set heading(numbering: "1.")
#show heading.where(level: 1): it => {
  v(0.85em)
  it
  v(0.35em)
}
#show heading.where(level: 2): it => {
  v(0.5em)
  it
  v(0.2em)
}
#show raw.where(block: true): it => block(
  width: 100%,
  fill: luma(246),
  inset: 9pt,
  radius: 3pt,
  stroke: 0.4pt + luma(210),
  {
    set text(font: "DejaVu Sans Mono", size: 8pt)
    set par(justify: false)
    it
  },
)
#show raw.where(block: false): it => {
  set text(font: "DejaVu Sans Mono", size: 8.5pt)
  it
}
#set table(stroke: 0.4pt + luma(180), inset: 6pt)
#show table: it => {
  set text(size: 8.8pt)
  set par(justify: false)
  it
}

#let note(body) = block(
  width: 100%,
  fill: rgb("#f4f6f8"),
  inset: 10pt,
  radius: 3pt,
  stroke: 0.5pt + rgb("#c5d0da"),
  {
    set text(size: 9.5pt)
    body
  },
)

#align(center)[
  #text(size: 11pt, fill: luma(70))[CRYME — Cryptographic Migration Engineering]
  #v(0.35cm)
  #text(size: 20pt, weight: "bold")[Technische Dokumentation]
  #v(0.25cm)
  #text(size: 12pt)[Quellcode, Architektur und Datenfluss]
  #v(0.45cm)
  #text(size: 10pt)[Masterprojekt · Hochschule RheinMain · September 2026]
]

#v(0.6cm)

#note[
  Diese Dokumentation erklärt den Quellcode, die Architektur und den Datenfluss von CRYME.
  Zielgruppe sind Gutachterinnen und Gutachter, die den Code nachvollziehen möchten, ohne jede Datei einzeln lesen zu müssen.
  Anwenderüberblick: `GUIDE.md` · Installation: `INSTALL.md` · Memgraph: *Memgraph-Anleitung*.
]

= Was CRYME technisch macht

CRYME ist ein *Orchestrator* für geplante PQC-Migrationen. Es ersetzt keine TLS-Implementierung, sondern verbindet vier Schichten:

```
webserver_pqc_twin.yaml          Digitaler Zwilling (Quelle der Wahrheit)
        ↓
web_app/oracle.js                Oracle-Engine (Validierung, SCC, Historie)
        ↓
cryme (CLI)                      Bedienoberfläche
        ↓
deploy/ (Docker + Ansible)       Live-HTTPS-Dienst auf Port 8443
```

*Kernidee:* Jede Migration wird zuerst im Graphen (Memgraph) validiert. Erst bei Erfolg entsteht ein Ansible-Playbook und kann per `cryme deploy` auf den Live-Dienst übertragen werden.

= Projektstruktur (Code-Karte)

#table(
  columns: (1.7fr, 1.15fr, 2.4fr),
  align: (left, left, left),
  table.header[*Pfad*][*Sprache*][*Rolle*],
  [`cryme`], [Node.js (CLI)], [Einstiegspunkt — parst Argumente, ruft `oracle.js` und Shell-Skripte auf],
  [`web_app/oracle.js`], [JavaScript], [*Kernlogik*: SCC, Migration, Replay, Playbook-Generierung],
  [`web_app/twin_loader.js`], [JavaScript], [YAML → Memgraph laden (`cryme init`)],
  [`web_app/server.js`], [JavaScript], [Optionale Web-UI (gleiche Oracle + Memgraph)],
  [`web_app/check_db.js`], [JavaScript], [Bolt-Verbindungstest],
  [`webserver_pqc_twin.yaml`], [YAML], [Digitaler Zwilling (Webserver + Browser)],
  [`deploy/docker-compose.yml`], [YAML], [Memgraph, nginx, curl-client],
  [`deploy/roles/cryme_tls/`], [Ansible/Jinja2], [TLS-Profil aus Migrationszustand ableiten],
  [`deploy/verify_tls.sh`], [Bash], [TLS-Handshake + `/api/status` prüfen],
  [`playbooks/`], [Ansible YAML], [Pro Migrationsschritt generierte Playbooks],
  [`logs/`], [Text], [Oracle-Ausgabe pro Schritt],
)

= Architekturdiagramm

#align(center)[
  #block(width: 100%)[
    #set align(center)
    #set text(size: 8.5pt)
    #let n(title, fill: rgb("#eef3f7")) = box(
      fill: fill,
      inset: (x: 8pt, y: 6pt),
      radius: 3pt,
      stroke: 0.6pt + rgb("#5a7184"),
      title,
    )
    #stack(
      spacing: 10pt,
      n([Eingabe: `webserver_pqc_twin.yaml`], fill: rgb("#e8f0e9")),
      [↓],
      n([CLI: `cryme`]),
      [↓],
      n([Oracle: `web_app/oracle.js` + `twin_loader.js`], fill: rgb("#e8eaf6")),
      [↓],
      n([Persistenz: Memgraph `:7687`], fill: rgb("#fff4e5")),
      [↓  Playbooks  ↓],
      n([Deploy: Ansible `cryme_tls`], fill: rgb("#f3e8ef")),
      [↓],
      n([Live: nginx `:8443` + `runtime.json` + `/api/status`], fill: rgb("#e8f0e9")),
    )
  ]
]

#v(0.4cm)

Die Planung lebt in Memgraph. Der Live-Dienst ändert sich erst durch `cryme deploy`.

= Modul: `cryme` (CLI)

*Datei:* `cryme` (ausführbares Node.js-Skript im Projektstamm)

== Aufgaben

+ Kommandozeilenargumente parsen (`show`, `migrate`, `deploy`, `verify`, `init`)
+ Memgraph-Session öffnen und Funktionen aus `oracle.js` aufrufen
+ Für `deploy` und `verify`: externe Tools starten (`ansible-playbook`, `bash deploy/verify_tls.sh`)

== Wichtige Befehle → Funktionen

#table(
  columns: (1.5fr, 2fr),
  table.header[*CLI-Befehl*][*Oracle-Funktion / externes Tool*],
  [`cryme init`], [`initDatabase()` + `resetLiveServiceState()`],
  [`cryme migrate …`], [`migrateNodes()`],
  [`cryme show state step=N`], [`reconstructStateAtStep()`],
  [`cryme show graph step=N`], [`reconstructStateAtStep()` + `renderGraphAscii()`],
  [`cryme show diff step=N`], [`computeStepDiff()`],
  [`cryme show step step=N`], [`computeStepDiff()` + `renderStepShowAscii()`],
  [`cryme show tree`], [Cypher auf `MigrationStep` + `TRANSITION_TO`],
  [`cryme show node`], [Cypher auf `CryptoAsset` / `SecurityControl`],
  [`cryme deploy step=N`], [`getStepDeployInfo()` → Ansible],
  [`cryme verify step=N`], [`deploy/verify_tls.sh`],
)

== Verbindung zu Memgraph

Die Verbindung wird in `web_app/oracle.js` definiert und von der CLI wiederverwendet:

```javascript
const URI = "bolt://localhost:7687";
const driver = neo4j.driver(URI, neo4j.auth.basic("", ""));
```

Kein Benutzer, kein Passwort — Memgraph läuft lokal im Docker-Container.

= Modul: `web_app/oracle.js` (Oracle-Engine)

Das ist das *technische Herzstück* (ca. 1300 Zeilen). Die CLI ist ein dünner Wrapper um die Exports am Dateiende.

== Graph-Algorithmen (rein im Speicher)

#table(
  columns: (1.35fr, 1.1fr, 2.2fr),
  table.header[*Funktion*][*Algorithmus*][*Zweck*],
  [`computeSCCs()`], [Tarjan], [Strongly Connected Components — welche Knoten müssen gemeinsam migriert werden?],
  [`computeTransitiveReduction()`], [Floyd–Warshall], [Redundante Kanten entfernen (transitive Reduktion)],
)

Diese Algorithmen laufen auf dem in den Speicher geladenen Graphen, nicht als Memgraph-Prozeduren.

== Zustandsverwaltung

#table(
  columns: (1.5fr, 2.3fr),
  table.header[*Funktion*][*Beschreibung*],
  [`loadStateFromDB()`], [Liest aktuellen Graphen aus Memgraph (Knoten, Kanten, Historie)],
  [`loadBaselineTopology()`], [Statische Topologie aus YAML (ohne Laufzeit-Entdeckungen)],
  [`reconstructStateAtStep(N)`], [*Event Replay*: Zustand bei Schritt N durch Abspielen aller Events rekonstruieren],
  [`getHeadStep()`], [Aktueller HEAD-Zeiger (letzter erfolgreicher Schritt)],
  [`updateHeadStep(N)`], [Vorheriges HEAD löschen, `SystemMeta.head_step` und `MigrationStep.head` setzen],
)

*Event Sourcing:* Der Zustand bei Schritt N wird nicht als Snapshot gespeichert, sondern aus Baseline + `MigrationStep`-Ereignissen 1..N *berechnet*. Details: `docs/GRAPH_VERSIONING.md`.

== Migrationsablauf (`migrateNodes`)

```
1. Zielknoten auflösen (Name oder Memgraph-ID)
2. Cluster bilden (SCC über explizite + implizite + globale Kanten)
3. Pro Knoten Zielalgorithmus prüfen (PQCVariant aus YAML)
4. Oracle-Validierung (checkOracleValidation):
   - Bereits migriert? → redundant
   - Temporal constraints (not_before)?
   - Strukturelle Abhängigkeiten?
5. Bei Fehler: discovered_edge speichern (Oracle lernt neue Kante)
6. Bei Erfolg:
   - Knoten in Memgraph auf status=migrated setzen
   - MigrationStep-Event anlegen
   - HEAD aktualisieren
   - Ansible-Playbook generieren
   - Log schreiben
```

Fehlgeschlagene Schritte erzeugen trotzdem einen `MigrationStep` (Status `failed` oder `aborted`), damit der Historienbaum vollständig bleibt. HEAD wandert bei Fehlern *nicht*.

== Oracle-Validierung (`checkOracleValidation`)

Prüft unter anderem:

- *Co-Migration:* Knoten in derselben SCC müssen zusammen migriert werden
- *Implizite Abhängigkeiten:* SecurityControls hängen von CryptoAssets ab
- *Globale Abhängigkeiten:* Server-KEX ↔ Browser-KEX (Demo-Schritt 1 schlägt hier fehl)
- *Temporal:* `not_before`-Constraints zwischen Komponenten

== Deploy-Vorbereitung

#table(
  columns: (1.6fr, 2.2fr),
  table.header[*Funktion*][*Beschreibung*],
  [`getStepDeployInfo(N)`], [Rekonstruiert Zustand bei Schritt N, schreibt `deploy/vars/step_N.json`],
  [`buildDeployVarsFromState()`], [Mappt Knoten → Algorithmen für Ansible],
  [`generatePlaybookContent()`], [Schreibt Playbook mit `include_role: cryme_tls`],
  [`resetLiveServiceState()`], [Setzt `runtime.json` / `data.json` auf Baseline und lädt nginx neu (`cryme init`)],
)

`cryme deploy` *liest* Memgraph (per Replay). Es schreibt *keine* neuen Graph-Ereignisse.

= Modul: `web_app/twin_loader.js`

Wird von `initDatabase()` bei `cryme init` aufgerufen.

== Ablauf

+ `initDatabase()` leert Memgraph (`MATCH (n) DETACH DELETE n`)
+ `populateMemgraphWithTwin()` liest `webserver_pqc_twin.yaml`:
  - `Component`-Knoten anlegen
  - `CryptoAsset` + `PQCVariant`-Knoten anlegen
  - `SecurityControl`-Knoten anlegen
+ Kanten anlegen: `HAS_ASSET`, `HAS_CONTROL`, `HAS_VARIANT`, `EXPLICIT_DEPENDENCY`, `IMPLICIT_DEPENDENCY`, `GLOBAL_DEPENDENCY`, `TEMPORAL_CONSTRAINT`

`SystemMeta` und der initiale `MigrationStep` (Schritt 0, `status: init`) entstehen *nicht* im Loader. Die erste `cryme migrate` erzeugt sie per `MERGE (init:MigrationStep {step: 0})`; `updateHeadStep()` legt `SystemMeta` an.

*Quelle:* `webserver_pqc_twin.yaml`

= Modul: Ansible-Rolle `cryme_tls`

*Pfad:* `deploy/roles/cryme_tls/`

== Eingabe (via `cryme deploy step=N`)

```json
{
  "migration_step": 2,
  "migrated_nodes": [
    "Webserver_Classic.KeyExchange_ECDHE",
    "Client_Browser.KeyExchange_ECDHE"
  ],
  "target_algorithms": {
    "Webserver_Classic.KeyExchange_ECDHE": "X25519_MLKEM768",
    "Client_Browser.KeyExchange_ECDHE": "X25519_MLKEM768"
  }
}
```

== Ableitung des TLS-Profils (`tasks/main.yml`)

Aus `target_algorithms` werden abgeleitet:

#table(
  columns: (1.2fr, 1.4fr, 1.15fr, 1fr),
  table.header[*Bedingung*][*TLS-Profil*][*nginx-Zertifikat*][*Protokolle*],
  [Alles classic], [`classic-rsa-ecdhe`], [RSA-2048], [TLS 1.2 + 1.3],
  [Hybrid KEX], [`hybrid-kex-classic-cert`], [RSA-2048], [TLS 1.2 + 1.3],
  [ML-DSA Cert], [`hybrid-kex-mldsa-cert`], [ECDSA (Stand-in)], [TLS 1.2 + 1.3],
  [Nur TLS 1.3], [`tls13-only`], [je nach Cert], [nur TLS 1.3],
)

== Generierte Dateien

#table(
  columns: (1.6fr, 2.2fr),
  table.header[*Datei*][*Inhalt*],
  [`deploy/nginx/live/tls.conf`], [nginx TLS-Konfiguration],
  [`deploy/state/runtime.json`], [API-Zustand für `/api/status`],
  [`deploy/state/data.json`], [API-Zustand für `/api/data`],
  [`deploy/client/expect.env`], [Erwartungen für curl-client (Browser-Simulation)],
)

nginx liest `runtime.json` statisch (Volume-Mount). Die API-Antwort kommt direkt aus dieser Datei — kein separater API-Container nötig.

= Live-Dienst (Port 8443)

== Docker-Stack

#table(
  columns: (1.5fr, 0.8fr, 2fr),
  table.header[*Container*][*Port*][*Funktion*],
  [`cryme-memgraph`], [7687], [Graph-Datenbank],
  [`cryme-memgraph-lab`], [3000], [Web-GUI],
  [`cryme-nginx-classic`], [8443→443], [HTTPS + statische API-Dateien],
  [`cryme-curl-client`], [—], [Simulierter Browser],
)

== API-Endpunkte

nginx serviert Dateien aus `deploy/state/`:

#table(
  columns: (1.1fr, 1.1fr, 2fr),
  table.header[*URL*][*Datei*][*Inhalt*],
  [`/api/status`], [`runtime.json`], [`migration_step`, `profile`, `algorithms`],
  [`/api/data`], [`data.json`], [Beispiel-Payload],
  [`/health`], [inline], [Health-Check + Header `X-Cryme-Tls-Profile`],
)

== Zwei Sichten auf denselben Zustand

```bash
cryme show state step=2
# Planungszustand (Memgraph-Replay)

curl -sk https://127.0.0.1:8443/api/status
# Laufzeitzustand (nginx)
```

Nach `cryme deploy step=2` müssen beide übereinstimmen.

= Verifikation (`deploy/verify_tls.sh`)

Prüft unabhängig von CRYME:

+ *openssl s_client* — Zertifikat, Protokoll, Cipher
+ *curl vom Host* — `/health`
+ *curl aus curl-client-Container* — simuliert `Client_Browser`
+ *nginx-Header* — `X-Cryme-Tls-Profile`
+ *API-Status* — `curl -sk …/api/status`, vergleicht `migration_step` mit dem erwarteten Schritt

= Datenmodell (Kurzform)

== Knotentypen in Memgraph

#table(
  columns: (1.2fr, 2fr, 1.6fr),
  table.header[*Label*][*Beispiel-ID*][*Wichtige Properties*],
  [`Component`], [`Webserver_Classic`], [`phase`],
  [`CryptoAsset`], [`Webserver_Classic.KeyExchange_ECDHE`], [`status`, `algorithm`, `active_algorithm`],
  [`SecurityControl`], [`Webserver_Classic.TLS_1.2_/_1.3_Communication`], [`status`, `active_algorithm`],
  [`PQCVariant`], [`…mlkem768`], [`algorithm`, `security_level`],
  [`MigrationStep`], [step=2], [`status`, `cluster`, `variants`, `head`],
  [`SystemMeta`], [`cryme`], [`head_step`],
)

== Kantentypen

#table(
  columns: (1.5fr, 2.3fr),
  table.header[*Relation*][*Bedeutung*],
  [`HAS_ASSET`], [Component → CryptoAsset],
  [`HAS_CONTROL`], [Component → SecurityControl],
  [`HAS_VARIANT`], [CryptoAsset → PQCVariant],
  [`EXPLICIT_DEPENDENCY`], [Deklarierte funktionale Abhängigkeit],
  [`IMPLICIT_DEPENDENCY`], [Implizite Abhängigkeit (inkl. zur Laufzeit entdeckte)],
  [`GLOBAL_DEPENDENCY`], [Komponentenübergreifend (Server ↔ Browser)],
  [`TEMPORAL_CONSTRAINT`], [Phasenordnung (`not_before`)],
  [`TRANSITION_TO`], [Migrationshistorie (Baum, nicht Abhängigkeitsgraph)],
)

Details: `docs/DOMAIN_MODEL.md`

= Typischer Demo-Ablauf (technisch)

```
cryme init
  → twin_loader.js lädt YAML in Memgraph
  → resetLiveServiceState() setzt runtime.json auf step=0

cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
  → migrateNodes() findet GLOBAL_DEPENDENCY zu Client_Browser
  → Oracle: FAIL (Schritt 1), discovered_edge gespeichert

cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
  → SCC enthält jetzt beide KEX-Knoten
  → Oracle: SUCCESS (Schritt 2), Playbook generiert

cryme deploy step=2
  → getStepDeployInfo(2) → deploy/vars/step_2.json
  → ansible-playbook apply_tls.yml
  → nginx TLS-Profil + runtime.json aktualisiert

cryme verify step=2
  → verify_tls.sh prüft TLS + migration_step=2 in /api/status
```

Die zugehörigen Cypher-Queries stehen in der *Memgraph-Anleitung*, Abschnitt Demo-Schritte 0–4.

= Code in dieser Reihenfolge lesen

Wenn Sie die Implementierung prüfen, entspricht diese Reihenfolge dem Laufzeitpfad:

+ `webserver_pqc_twin.yaml` — was der Zwilling deklariert
+ `web_app/twin_loader.js` — wie YAML zu Graphknoten wird
+ `web_app/oracle.js` — `loadStateFromDB`, `checkOracleValidation`, `migrateNodes`, `reconstructStateAtStep`
+ `cryme` — nur CLI-Dispatch
+ `deploy/roles/cryme_tls/tasks/main.yml` — wie ein geplanter Schritt zum TLS-Profil wird
+ `deploy/verify_tls.sh` — unabhängiger Nachweis auf Port 8443

`web_app/server.js` und `web_app/public/app.js` sind eine optionale UI auf derselben Memgraph-Datenbank. Der Demo-Pfad für die Bewertung ist die CLI.

= Bekannte technische Limitierungen (Phase B)

#table(
  columns: (1.1fr, 1.7fr, 1.5fr),
  table.header[*Bereich*][*Ist-Zustand*][*Geplant (Phase C)*],
  [PQC on-the-wire], [ML-KEM/ML-DSA als *Namen*; OpenSSL nutzt klassisches TLS], [OQS-nginx für echte PQC-Handshakes],
  [Zertifikat ML-DSA], [ECDSA als Stand-in], [Echtes ML-DSA-Zertifikat],
  [Szenarien], [Webserver live, Automotive nur in YAML], [Weitere Digital Twins],
)

= Weiterführende Dokumentation

#table(
  columns: (1.6fr, 2.2fr),
  table.header[*Dokument*][*Inhalt*],
  [`docs/MEMGRAPH_ANLEITUNG.md`], [Memgraph bedienen, Beispielqueries],
  [`docs/GRAPH_VERSIONING.md`], [Event Sourcing, HEAD, Replay],
  [`docs/migration_explanation.md`], [Oracle-SCC-Verhalten im Detail],
  [`docs/DOMAIN_MODEL.md`], [ER-Diagramm, Namensregeln],
  [`docs/TLS_ALGORITHMS.md`], [TLS-Profile-Matrix],
  [`docs/KI_NUTZUNG.md`], [Dokumentation der KI-Nutzung],
)
