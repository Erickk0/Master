#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.2cm),
  numbering: "1",
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: luma(80))
      CRYME · Memgraph-Anleitung
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
  v(0.45em)
  it
  v(0.2em)
}
#show heading.where(level: 3): it => {
  v(0.3em)
  it
  v(0.15em)
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

#let expect(body) = block(
  width: 100%,
  fill: rgb("#eef6ee"),
  inset: 8pt,
  radius: 3pt,
  stroke: 0.5pt + rgb("#b7d4b7"),
  {
    set text(size: 9.3pt)
    [*Erwartung:* #body]
  },
)

#align(center)[
  #text(size: 11pt, fill: luma(70))[CRYME — Cryptographic Migration Engineering]
  #v(0.35cm)
  #text(size: 20pt, weight: "bold")[Memgraph-Anleitung]
  #v(0.25cm)
  #text(size: 12pt)[Verbindung, Graph-Struktur, Cypher-Queries und Demo-Schritte 0–4]
  #v(0.45cm)
  #text(size: 10pt)[Masterprojekt · Hochschule RheinMain · September 2026]
]

#v(0.6cm)

#note[
  Diese Anleitung erklärt, wie Memgraph in CRYME genutzt wird: Verbindung, Graph-Struktur, Cypher-Queries und der Zusammenhang mit den Demo-Migrationsschritten 0–4.
  Technischer Code-Überblick: *Technische Dokumentation* · Graph-Versionierung: `docs/GRAPH_VERSIONING.md`.
]

= Was Memgraph in CRYME macht

Memgraph ist die *Persistenzschicht* für:

+ Den *digitalen Zwilling* (Knoten + Kanten aus `webserver_pqc_twin.yaml`)
+ Den *Laufzeitstatus* (`status`, `active_algorithm` pro Knoten)
+ Die *Migrationshistorie* (`MigrationStep`-Events, HEAD-Zeiger)

CRYME nutzt das *Bolt-Protokoll* (kompatibel mit `neo4j-driver`) und *Cypher-Queries*.

Die Oracle in `web_app/oracle.js` führt Graph-Algorithmen *nicht* als Memgraph-Prozeduren aus. Sie lädt den Graphen in den Speicher, berechnet SCC/Validierung in JavaScript und schreibt das Ergebnis per Cypher zurück.

= Verbindung herstellen

== Lokal (Mac / Linux)

```bash
docker compose -f deploy/docker-compose.yml up -d
bash deploy/check_memgraph.sh
```

#table(
  columns: (1.4fr, 1.7fr, 1.6fr),
  table.header[*Dienst*][*Adresse*][*Zugangsdaten*],
  [Bolt (CLI / Driver)], [`bolt://localhost:7687`], [kein User, kein Passwort],
  [Memgraph Lab (GUI)], [http://localhost:3000], [Connect: `bolt://localhost:7687`],
)

== Über SSH-Tunnel (Universitätsserver ilmare)

```bash
ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare
```

Im Browser: http://localhost:3000 → Verbindung zu `bolt://localhost:7687`

== Über die CRYME-CLI (ohne GUI)

```bash
cryme show node          # alle Crypto-Knoten
cryme show tree          # Migrationshistorie
cryme show state step=2  # Zustand bei Schritt 2
cryme show graph step=2  # Abhängigkeitsgraph bei Schritt 2
```

== Node.js-Verbindungstest

```bash
cd web_app && node check_db.js
```

Gibt alle `MigrationStep`-Knoten und `TRANSITION_TO`-Kanten aus.

= Graph-Übersicht (CRYME-Demo)

Nach `cryme init` enthält der Graph:

```
Webserver_Classic                    Client_Browser
     │                                    │
     ├── KeyExchange_ECDHE                ├── KeyExchange_ECDHE
     ├── Cert_RSA2048                     │
     └── TLS_1.2_/_1.3_Communication      │
              │                           │
              └──── GLOBAL_DEPENDENCY ────┘
                    (Server-KEX ↔ Browser-KEX)
```

== Knotenlabels

#table(
  columns: (1.3fr, 1.1fr, 2fr),
  table.header[*Label*][*Anzahl (Demo)*][*Beispiel-ID*],
  [`Component`], [2], [`Webserver_Classic`],
  [`CryptoAsset`], [3], [`Webserver_Classic.KeyExchange_ECDHE`],
  [`SecurityControl`], [1], [`Webserver_Classic.TLS_1.2_/_1.3_Communication`],
  [`PQCVariant`], [mehrere], [Zielalgorithmen pro Asset],
  [`MigrationStep`], [wächst mit jeder Migration], [step=0, 1, 2, …],
  [`SystemMeta`], [1 (nach erster migrate)], [`head_step`-Zeiger],
)

== Kantentypen

#table(
  columns: (1.5fr, 1.6fr, 1.2fr),
  table.header[*Relation*][*Bedeutung*][*Sichtbar in*],
  [`HAS_ASSET`], [Component → CryptoAsset], [Struktur],
  [`HAS_CONTROL`], [Component → SecurityControl], [Struktur],
  [`HAS_VARIANT`], [CryptoAsset → PQCVariant], [Struktur],
  [`GLOBAL_DEPENDENCY`], [Server-KEX ↔ Browser-KEX], [`cryme show graph`],
  [`IMPLICIT_DEPENDENCY`], [SecurityControl → CryptoAsset], [`cryme show graph`],
  [`EXPLICIT_DEPENDENCY`], [Deklarierte funktionale Abhängigkeit], [`cryme show graph`],
  [`TEMPORAL_CONSTRAINT`], [Phasenordnung der Komponenten], [Struktur],
  [`TRANSITION_TO`], [Schritt N → Schritt N+1], [`cryme show tree`],
)

= Memgraph Lab — Erste Schritte

== Gesamten Graph anzeigen

+ http://localhost:3000 öffnen
+ Quick connect: `bolt://localhost:7687`
+ Query ausführen:

```cypher
MATCH (n)
RETURN n
LIMIT 80;
```

== Alle CryptoAssets

```cypher
MATCH (a:CryptoAsset)
RETURN a.id AS asset,
       a.status AS status,
       a.algorithm AS baseline,
       a.active_algorithm AS active
ORDER BY a.id;
```

== Abhängigkeitsgraph

```cypher
MATCH (a)-[r:GLOBAL_DEPENDENCY|EXPLICIT_DEPENDENCY|IMPLICIT_DEPENDENCY]->(b)
RETURN a.id AS from, type(r) AS rel, b.id AS to;
```

Die `GLOBAL_DEPENDENCY` zwischen Server- und Browser-KEX ist der Grund für den *Fehler in Schritt 1*.

== PQC-Zielvarianten anzeigen

```cypher
MATCH (a:CryptoAsset)-[:HAS_VARIANT]->(v:PQCVariant)
RETURN a.id AS asset, v.algorithm AS target_algo, v.security_level AS level
ORDER BY a.id, v.algorithm;
```

= Migrationshistorie abfragen

== Alle Schritte

```cypher
MATCH (s:MigrationStep)
RETURN s.step AS step,
       s.status AS status,
       s.action AS action,
       s.head AS head
ORDER BY s.step;
```

Entspricht: `cryme show tree`

== Migrationsbaum

```cypher
MATCH (a:MigrationStep)-[:TRANSITION_TO]->(b:MigrationStep)
RETURN a.step AS parent, b.step AS child
ORDER BY parent, child;
```

== HEAD-Zeiger

```cypher
MATCH (m:SystemMeta {id: 'cryme'})
RETURN m.head_step AS head_step;
```

```cypher
MATCH (s:MigrationStep {head: true})
RETURN s.step AS head, s.status AS status, s.action AS action;
```

= Demo-Schritte 0–4 in Memgraph

Zuerst den CLI-Befehl ausführen, danach die Cypher-Query daneben. Das ist die vorgesehene Paarung: *CLI verändert den Graphen, Lab inspiziert ihn*.

== Schritt 0 — Baseline (`cryme init`)

*CLI:*

```bash
cryme init
cryme show state step=0
```

*Cypher — alle Knoten classic?*

```cypher
MATCH (a:CryptoAsset)
RETURN a.id, a.status, a.algorithm, a.active_algorithm;
```

#table(
  columns: (2.1fr, 0.7fr, 0.8fr, 1fr),
  table.header[*Knoten*][*status*][*algorithm*][*active_algorithm*],
  [`Webserver_Classic.KeyExchange_ECDHE`], [classic], [ECDHE], [null],
  [`Webserver_Classic.Cert_RSA2048`], [classic], [RSA-2048], [null],
  [`Client_Browser.KeyExchange_ECDHE`], [classic], [ECDHE], [null],
)

```cypher
MATCH (s:MigrationStep {step: 0})
RETURN s.status, s.action, s.head;
```

#expect[
  Nach der ersten `cryme migrate` (MERGE auf Schritt 0): `status = 'init'`.
  Direkt nach `cryme init` existiert dieser Knoten oft noch nicht — geladen wird nur die Twin-Topologie.
]

*Live-API* (durch init zurückgesetzt, nicht durch migrate):

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

#expect[`"migration_step": 0`, `"profile": "classic-rsa-ecdhe"`]

== Schritt 1 — Isolierte Server-KEX-Migration (FAILED)

*CLI:*

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
cryme show tree
```

*Cypher — fehlgeschlagener Schritt:*

```cypher
MATCH (s:MigrationStep {step: 1})
RETURN s.status, s.action, s.cluster, s.discovered_edge;
```

#table(
  columns: (1.2fr, 2.4fr),
  table.header[*Feld*][*Wert*],
  [`status`], [`failed`],
  [`action`], [`migrate_fail`],
  [`cluster`], [enthält `Webserver_Classic.KeyExchange_ECDHE`],
  [`discovered_edge`], [Server↔Browser-Verbindung],
)

*Cypher — Knoten unverändert (noch classic):*

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.KeyExchange_ECDHE'})
RETURN a.status, a.active_algorithm;
```

#expect[`status = 'classic'`, `active_algorithm = null`]

*Cypher — neu entdeckte Kante (nach Oracle-Lernen):*

```cypher
MATCH (a)-[r:IMPLICIT_DEPENDENCY {discovered: true}]->(b)
RETURN a.id AS from, b.id AS to;
```

HEAD bleibt bei Schritt 0:

```cypher
MATCH (m:SystemMeta {id: 'cryme'}) RETURN m.head_step;
```

Dieses Beispiel zeigt, warum Memgraph auch *fehlgeschlagene* Ereignisse speichert: die nächste Migration nutzt die entdeckte implizite Kante, sodass beide KEX-Knoten eine SCC bilden.

== Schritt 2 — Co-Migration Server + Browser KEX (SUCCESS)

*CLI:*

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
cryme deploy step=2
cryme verify step=2
```

*Cypher — beide KEX migriert:*

```cypher
MATCH (a:CryptoAsset)
WHERE a.id CONTAINS 'KeyExchange'
RETURN a.id, a.status, a.active_algorithm, a.migrated_at_step;
```

#table(
  columns: (2fr, 0.8fr, 1.2fr, 0.9fr),
  table.header[*Knoten*][*status*][*active_algorithm*][*migrated_at_step*],
  [`Webserver_Classic.KeyExchange_ECDHE`], [migrated], [X25519_MLKEM768], [2],
  [`Client_Browser.KeyExchange_ECDHE`], [migrated], [X25519_MLKEM768], [2],
)

*Cypher — Schritt-Details:*

```cypher
MATCH (s:MigrationStep {step: 2})
RETURN s.status, s.cluster, s.variants, s.head;
```

#expect[`status = 'success'`, `head = true`, `cluster` enthält beide KEX-Knoten]

*Live-API nach deploy:*

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

#expect[`"migration_step": 2`, KEX-Algorithmen = `X25519_MLKEM768`]

== Schritt 3 — Zertifikat ML-DSA-44 (SUCCESS)

*CLI:*

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
```

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.Cert_RSA2048'})
RETURN a.status, a.algorithm, a.active_algorithm, a.migrated_at_step;
```

#expect[`status = 'migrated'`, `active_algorithm = 'ML-DSA-44'`, `migrated_at_step = 3`]

*Cypher — kumulativer Zustand (alle bisher migrierten Knoten):*

```cypher
MATCH (n)
WHERE (n:CryptoAsset OR n:SecurityControl) AND n.status = 'migrated'
RETURN n.id, n.active_algorithm, n.migrated_at_step
ORDER BY n.migrated_at_step;
```

#expect[3 Knoten (2× KEX + Cert)]

*TLS-Verifikation (Zertifikat gewechselt):*

```bash
echo | openssl s_client -connect 127.0.0.1:8443 2>/dev/null | openssl x509 -noout -subject
```

#expect[`CN=CRYME Live ML-DSA Demo` (ECDSA-Stand-in für ML-DSA)]

== Schritt 4 — TLS 1.3 only (SUCCESS, alles migriert)

*CLI:*

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
cryme show state step=4
cryme verify step=4
```

*Cypher — SecurityControl:*

```cypher
MATCH (c:SecurityControl)
RETURN c.id, c.status, c.active_algorithm, c.migrated_at_step;
```

#expect[`active_algorithm = 'TLS1.3'`, `status = 'migrated'`]

*Cypher — alle Knoten migriert?*

```cypher
MATCH (n)
WHERE (n:CryptoAsset OR n:SecurityControl)
RETURN n.id, n.status, n.active_algorithm
ORDER BY n.id;
```

#expect[alle 4 Knoten `status = 'migrated'`]

*Cypher — HEAD bei Schritt 4:*

```cypher
MATCH (s:MigrationStep {head: true})
RETURN s.step, s.status, s.action;
```

*Live-API:*

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

#expect[`"migration_step": 4`, `"profile": "tls13-only"`]

*Client-Simulation (curl-client Container):*

```bash
docker exec cryme-curl-client sh -c '. /client/expect.env && curl -skv $CRYME_CURL_TLSFLAGS https://nginx-classic/health'
```

#expect[`CRYME_CURL_TLSFLAGS="--tlsv1.3 --tls-max 1.3"`]

= Zwei Sichten: Memgraph vs. Live-API

#table(
  columns: (0.9fr, 1.3fr, 1.8fr),
  table.header[*Sicht*][*Quelle*][*Wann aktualisiert*],
  [*Planung*], [Memgraph (Replay)], [sofort nach `cryme migrate`],
  [*Live*], [nginx `/api/status`], [erst nach `cryme deploy step=N`],
)

== Beispiel: Schritt 2 migriert, aber nicht deployed

```bash
cryme show state step=2
# → KEX-Knoten: migrated

curl -sk https://127.0.0.1:8443/api/status
# → migration_step: 0  (noch nicht deployed!)
```

Nach `cryme deploy step=2` müssen beide übereinstimmen.

*Prüf-Query — letzter erfolgreicher Schritt vs. Live:*

```cypher
MATCH (m:SystemMeta {id: 'cryme'})
RETURN m.head_step AS memgraph_head;
```

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -c "import sys,json; print(json.load(sys.stdin)['migration_step'])"
```

Beide Werte sollten nach Deploy gleich sein.

= Nützliche Queries für Gutachter

== Anzahl Knoten pro Label

```cypher
MATCH (n)
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY count DESC;
```

== Varianten eines Assets

```cypher
MATCH (a:CryptoAsset {id: 'Webserver_Classic.KeyExchange_ECDHE'})-[:HAS_VARIANT]->(v)
RETURN v.algorithm, v.security_level, v.performance;
```

== Fehlgeschlagene Schritte

```cypher
MATCH (s:MigrationStep {status: 'failed'})
RETURN s.step, s.action, s.cluster, s.discovered_edge;
```

== Erfolgreiche Schritte mit Algorithmen

```cypher
MATCH (s:MigrationStep {status: 'success'})
RETURN s.step, s.cluster, s.variants
ORDER BY s.step;
```

== Graph visualisieren (nur Abhängigkeiten)

```cypher
MATCH p=(a)-[r:GLOBAL_DEPENDENCY|IMPLICIT_DEPENDENCY|EXPLICIT_DEPENDENCY]->(b)
RETURN p;
```

= Graph zurücksetzen

```bash
cryme init
```

Intern:

```cypher
MATCH (n) DETACH DELETE n;
```

Dann lädt `twin_loader.js` den Zwilling neu aus YAML. *Alle Migrationshistorie geht verloren* — für Demos gewollt.

= Häufige Probleme

#table(
  columns: (1.3fr, 1.3fr, 1.6fr),
  table.header[*Problem*][*Ursache*][*Lösung*],
  [Connection refused :7687], [Memgraph-Container down], [`docker compose -f deploy/docker-compose.yml up -d`],
  [Leerer Graph], [Kein `cryme init`], [`cryme init`],
  [Lab zeigt alten Stand], [Cache / alte Session], [Seite neu laden, Query erneut ausführen],
  [CLI findet Memgraph nicht], [Port nicht erreichbar], [`bash deploy/check_memgraph.sh`],
  [HEAD ≠ erwarteter Schritt], [Falsche Schrittnummer], [`cryme show tree`],
  [Memgraph ≠ Live-API], [Deploy vergessen], [`cryme deploy step=N`],
)

= CLI ↔ Memgraph Zuordnung

#table(
  columns: (1.4fr, 2.3fr),
  table.header[*CLI-Befehl*][*Memgraph-Operation*],
  [`cryme init`], [Graph leeren + YAML laden],
  [`cryme show node`], [`MATCH (n:CryptoAsset|SecurityControl) …`],
  [`cryme show tree`], [`MATCH (s:MigrationStep) …` + `TRANSITION_TO`],
  [`cryme show state step=N`], [Replay via `reconstructStateAtStep()`],
  [`cryme show graph step=N`], [Replay + Kanten rendern],
  [`cryme migrate …`], [Schreibt `MigrationStep`, aktualisiert Knoten],
  [`cryme deploy step=N`], [Liest Replay-Zustand, schreibt *nicht* in Memgraph],
)

= Wie die Beispiele zum Code passen

#table(
  columns: (1.3fr, 1.5fr, 1.5fr),
  table.header[*Demo-Beispiel*][*In Memgraph ansehen*][*Im Code geschrieben von*],
  [Schritt 0 `cryme init`], [`Component` / `CryptoAsset` / `SecurityControl` / `PQCVariant`], [`twin_loader.js` via `initDatabase()`],
  [Schritt 1 Fail], [`MigrationStep.status = failed`, `discovered_edge`, neue `IMPLICIT_DEPENDENCY`], [`migrateNodes()` + `checkOracleValidation()`],
  [Schritt 2 Success], [beide KEX `status = migrated`, HEAD = 2], [dieselben Funktionen; `updateHeadStep(2)`],
  [Schritte 3–4], [Cert + SecurityControl `active_algorithm`], [derselbe Schreibpfad, andere Knoten-IDs],
  [`cryme show state step=N`], [rekonstruiert, kein gespeicherter Snapshot], [`reconstructStateAtStep()` in `oracle.js`],
  [`cryme deploy`], [Graph unverändert], [Ansible liest nur Replay-Ausgabe],
)

= Weiterführend

#table(
  columns: (1.7fr, 2.1fr),
  table.header[*Dokument*][*Inhalt*],
  [`docs/GRAPH_VERSIONING.md`], [Event Sourcing, HEAD, Replay-Algorithmus],
  [`docs/MIGRATION_STATES.md`], [Zustandsdiagramme pro Schritt],
  [`docs/migration_explanation.md`], [Oracle-SCC-Verhalten],
  [`docs/TECHNISCHE_DOKUMENTATION.md`], [Code-Architektur],
  [`docs/LIVE_DEMO_CHEAT_SHEET.md`], [5-Minuten-Demo zum Ausdrucken],
)
