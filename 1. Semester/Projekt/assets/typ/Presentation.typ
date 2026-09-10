// CRYME — Masterprojekt-Präsentation (~20 Min.)
// typst compile "typ/Presentation.typ"

#set page(width: 13.333in, height: 7.5in, margin: 0.45in)
#set text(font: "New Computer Modern", size: 15pt, lang: "de")
#set par(justify: true, leading: 0.95em, spacing: 0.75em)

#let accent = rgb("#0B5CAD")
#let accent2 = rgb("#1F7A8C")
#let dark = rgb("#14213D")
#let muted = rgb("#5B6472")
#let soft = rgb("#F3F7FB")
#let good = rgb("#1E8E3E")
#let bad = rgb("#D23B3B")
#let warn = rgb("#C08A1E")

#let slide(title, body) = [
  #rect(fill: white)[
    #v(0.1cm)
    #text(size: 28pt, weight: "bold", fill: dark)[#title]
    #v(0.15cm)
    #rect(width: 100%, height: 1.2pt, fill: accent)
    #v(0.35cm)
    #body
  ]
]

#let two_col(left, right) = grid(
  columns: (1fr, 1fr),
  column-gutter: 0.45in,
  align: top,
  left,
  right,
)

#let keybox(title, content) = block(
  fill: soft,
  stroke: 0.8pt + rgb("#D7E3F0"),
  radius: 10pt,
  inset: 0.22in,
)[
  #text(size: 18pt, weight: "bold", fill: accent)[#title]
  #v(0.12in)
  #content
]

#let termbox(content) = block(
  fill: rgb("#1a2332"),
  stroke: 0.8pt + rgb("#D7E3F0"),
  radius: 10pt,
  inset: 0.18in,
)[
  #set text(size: 11pt, fill: rgb("#d4dce8"))
  #content
]

#slide("CRYME", [
  #align(center)[
    #v(0.35in)
    #text(size: 20pt, weight: "bold", fill: accent2)[
      Cryptographic Migration Engineering
    ]
    #v(0.28in)
    #text(size: 14pt, fill: muted)[
      Ein simulationsbasiertes Oracle zur sicheren Orchestrierung \
      der Post-Quantum-Kryptografie-Migration
    ]
    #v(0.55in)
    #block(
      width: 72%,
      fill: soft,
      stroke: 0.8pt + rgb("#D7E3F0"),
      radius: 10pt,
      inset: 0.2in,
    )[
      #text(size: 12pt, fill: muted)[
        YAML Twin → Oracle → Deploy → Verify
      ]
    ]
    #v(0.55in)
    #text(size: 16pt)[Erick Zeiler]
    #v(0.08in)
    #text(size: 13pt, fill: muted)[
      Masterprojekt Informatik · Hochschule RheinMain \
      Prof. Dr. Marc Stöttinger · Prof. Dr. Bodo Igler
    ]
  ]
])

#pagebreak()
#slide("Motivation und Forschungsfrage", [
  #two_col(
    [
      #keybox("Warum PQC-Migration?", [
        - Quantencomputer bedrohen RSA und ECC (Shor-Algorithmus).
        - NIST hat Post-Quanten-Kryptografie standardisiert (ML-KEM, ML-DSA).
        - Migration ist kein Algorithmus-Tausch, sondern ein Systemproblem.
      ])
      #v(0.18in)
      #keybox("Zentrale Forschungsfrage", [
        #quote[*Können versteckte kryptografische Abhängigkeiten automatisch erkannt und in eine sichere Migrationsreihenfolge überführt werden?*]
      ])
    ],
    [
      #keybox("Das Problem", [
        - Server ↔ Client (Key Exchange)
        - Zertifikat ↔ Schlüssel (Trust Chain)
        - TLS-Version ↔ KEX-Algorithmus
        #v(0.1in)
        Naive Einzel-Migration eines Assets kann das gesamte System ausfallen lassen.
      ])
      #v(0.18in)
      #align(center)[
        #text(size: 13pt, fill: muted)[
          Klassisch (RSA, ECDHE) → Post-Quanten (ML-KEM, ML-DSA)
        ]
      ]
    ],
  )
])

#pagebreak()
#slide("Post-Quanten-Standards (NIST)", [
  #two_col(
    [
      #keybox("Standardisierte Algorithmen", [
        - *ML-KEM* (FIPS 203) — Key Encapsulation, ersetzt ECDHE/DH
        - *ML-DSA* (FIPS 204) — digitale Signaturen, ersetzt RSA/ECDSA
        - NIST-Standardisierung 2024 — Migration wird verpflichtend
      ])
      #v(0.16in)
      #keybox("Hybrid-Übergang", [
        - Nicht Big-Bang, sondern schrittweise Umstellung
        - *X25519\_MLKEM768* — klassischer + PQC-KEX parallel
        - Server und Client müssen denselben Modus sprechen
      ])
    ],
    [
      #keybox("CRYME-Migrationspfad (PoC)", [
        #table(
          columns: (auto, 1fr, auto),
          inset: 4pt,
          stroke: none,
          table.header(
            text(size: 11pt, weight: "bold")[Phase],
            text(size: 11pt, weight: "bold")[Asset],
            text(size: 11pt, weight: "bold")[Ziel],
          ),
          [1], [Key Exchange], [X25519\_MLKEM768],
          [2], [Zertifikat], [ML-DSA-44],
          [3], [TLS-Policy], [1.3 only],
        )
      ])
      #v(0.16in)
      #keybox("Warum relevant?", [
        Jeder Schritt ändert das Verhalten des Live-Systems — \
        falsche Reihenfolge oder isolierte Migration → Ausfall
      ])
    ],
  )
])

#pagebreak()
#slide("Was ist CRYME?", [
  #two_col(
    [
      #keybox("CRYME als Orchestrator", [
        *CRYME* (Cryptographic Migration Engineering) plant, validiert und deployt PQC-Migrationen. Es ersetzt keinen TLS-Stack.
        #v(0.08in)
        YAML Twin → Oracle → Deploy → Verify
      ])
      #v(0.16in)
      #keybox("Kernkommandos", [
        ```
        $ cryme init
        $ cryme migrate ...
        $ cryme deploy step=N
        $ cryme show tree
        ```
      ])
    ],
    [
      #keybox("Drei Mechanismen", [
        - *Dependency Discovery:* implizite Kanten → Co-Migrations-Cluster (SCC)
        - *Temporal Barriers:* keine Out-of-Order-Zustände, deny-by-default
        - *Event Sourcing:* Migrationsbaum mit Replay zu jedem Schritt N
      ])
      #v(0.16in)
      #keybox("Prinzip", [
        #quote[*Prüfen vor Ausführen* — jeder Migrationsschritt wird simuliert und validiert, bevor er auf dem realen System ausgeführt wird.]
      ])
    ],
  )
])

#pagebreak()
#slide("Architektur und Domänenmodell", [
  #two_col(
    [
      #keybox("Komponenten", [
        - *cryme CLI* — Orchestrator (planen, validieren, deployen)
        - *Memgraph* — Digital Twin + Migrationshistorie
        - *oracle.js* — SCC, implizite Kanten, Temporal Rules
        - *nginx :8443* — live migrierbarer HTTPS-Dienst
      ])
      #v(0.16in)
      #keybox("Pipeline", [
        ```
        YAML → cryme migrate → Oracle → cryme deploy → Ansible → nginx :8443
        ```
      ])
    ],
    [
      #keybox("Digital Twins (YAML)", [
        - Components: Webserver, Browser
        - CryptoAssets: Zertifikate, Key Exchange
        - SecurityControls: TLS-Version
        - PQC Variants: ML-KEM, ML-DSA
        #v(0.08in)
        PoC-Szenario: `webserver_pqc_twin.yaml`
      ])
      #v(0.16in)
      #keybox("Oracle-Regeln", [
        + SCC-Expansion — Cluster gemeinsam migrieren \
        + Temporal Barriers — Vorbedingungen prüfen \
        + Deny-by-default — unsichere Schritte → FAILED
      ])
    ],
  )
])

#pagebreak()
#slide("Tech-Stack & Implementierung", [
  #two_col(
    [
      #keybox("Anwendungsschicht", [
        - *Node.js* — `cryme` CLI + Oracle-Engine
        - *oracle.js* — SCC (Tarjan), Migration, Event Replay
        - *twin\_loader.js* — YAML → Memgraph
        - *neo4j-driver* — Bolt-Protokoll (:7687)
        - *js-yaml* — Digital-Twin-Parsing
      ])
      #v(0.14in)
      #keybox("Konfiguration & IaC", [
        - *YAML* — Digital Twins (`webserver_pqc_twin.yaml`)
        - *Ansible* + Jinja2 — Rolle `cryme_tls`
        - Generierte Playbooks in `playbooks/`
      ])
    ],
    [
      #keybox("Infrastruktur (Docker)", [
        - *Memgraph* — Graph-DB + Migrationshistorie
        - *Memgraph Lab* — Graph-Visualisierung (:3000)
        - *nginx 1.27* — TLS-Termination (:8443)
        - *curl-client* — Browser-Simulation
        - *docker-compose* — gesamter Live-Stack
      ])
      #v(0.14in)
      #keybox("Verifikation", [
        - *OpenSSL* — TLS-Handshake-Analyse
        - *curl* — `/api/status` + Cipher-Suite-Check
        - *verify\_tls.sh* — unabhängig von cryme API
        - Zwei Sichten: Graph-Zustand ↔ Wire-Verhalten
      ])
    ],
  )
])

#pagebreak()
#slide("Oracle-Logik im Detail", [
  #two_col(
    [
      #keybox("Drei Kantentypen", [
        - *Explizit* — modelliert in YAML (depends\_on)
        - *Implizit* — z. B. SecurityControl → CryptoAsset
        - *Discovered* — beim FAIL neu gelernt (Server ↔ Client)
      ])
      #v(0.16in)
      #keybox("SCC-Clustering (Tarjan)", [
        - Starke Zusammenhangskomponenten im Graphen
        - Knoten in einer SCC → *Co-Migration* Pflicht
        - Ein Befehl, ein Cluster — Oracle erweitert automatisch
      ])
    ],
    [
      #keybox("Temporal Barriers", [
        - `not_before`-Constraints zwischen Komponenten
        - Beispiel: TLS 1.3 only erst nach abgeschlossenem KEX
        - Verhindert unsichere Zwischenzustände → ABORTED
      ])
      #v(0.16in)
      #keybox("Policy-Modell", [
        - *Deny-by-default* — unsicherer Schritt → FAILED
        - Simulation *vor* Deploy — kein Schaden am Live-System
        - Event Sourcing — jeder Versuch im Migrationsbaum
      ])
    ],
  )
])

#pagebreak()
#slide("Demo-Setup", [
  #two_col(
    [
      #keybox("Live-System (ilmare)", [
        - `cryme-memgraph` — Graph-DB
        - `cryme` CLI — Oracle
        - `cryme-nginx-classic` — HTTPS :8443
        - `cryme-curl-client` — Browser-Simulation
      ])
      #v(0.16in)
      #keybox("Migrationsziel", [
        Schrittweise Umstellung: Hybrid-KEX → ML-DSA → TLS 1.3 only \
        Verifikation unabhängig via curl und openssl
      ])
    ],
    [
      #keybox("Baseline · Schritt 0", [
        #table(
          columns: (auto, 1fr),
          inset: 4pt,
          stroke: none,
          text(fill: muted)[Zertifikat], [RSA-2048],
          text(fill: muted)[KEX], [ECDHE (Server + Client)],
          text(fill: muted)[TLS], [1.2 / 1.3],
          text(fill: muted)[Profil], [`classic-rsa-ecdhe`],
        )
      ])
      #v(0.16in)
      #keybox("Zwei Sichten — eine Wahrheit", [
        - *Planung:* `cryme show state step=N`
        - *Laufzeit:* API + TLS-Handshake auf Port 8443
        - Nach Deploy stimmen Graph-Zustand und nginx überein.
      ])
    ],
  )
])

#pagebreak()
#slide("Demo: Schritt 1 — Versteckte Abhängigkeit (FAIL)", [
  #two_col(
    [
      #termbox[
        \$ cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768

        #text(fill: bad, weight: "bold")[FAILED — Policy Denied]

        Server KEX migrated to PQC, but \
        Client_Browser.KeyExchange_ECDHE is still Classic.
      ]
    ],
    [
      #keybox("Das Client Problem", [
        - Oracle erkennt implizite Kommunikationskante Server ↔ Browser.
        - Server-KEX allein migrieren → Client kann nicht mehr kommunizieren.
        - Schritt wird präventiv blockiert (deny-by-default).
      ])
      #v(0.16in)
      #keybox("Kernaussage", [
        CRYME erkennt versteckte Abhängigkeiten, bevor sie auf dem Live-System Schaden anrichten.
      ])
    ],
  )
])

#pagebreak()
#slide("Demo: Schritt 2 — Co-Migration (SUCCESS)", [
  #two_col(
    [
      #termbox[
        #text(fill: good, weight: "bold")[SUCCESS — Co-Migrated Cluster]

        Webserver.KeyExchange_ECDHE → X25519_MLKEM768 \
        Client_Browser.KeyExchange_ECDHE → X25519_MLKEM768

        \$ cryme deploy step=2
      ]
    ],
    [
      #keybox("Gleicher Befehl — anderes Ergebnis", [
        - Oracle erkennt SCC-Cluster und migriert beide Endpunkte gemeinsam.
        - Profil wechselt zu `hybrid-kex-classic-cert`.
        - API und TLS-Handshake bestätigen Hybrid-KEX unabhängig.
      ])
      #v(0.16in)
      #keybox("Thesis-Nachweis", [
        Versteckte Abhängigkeit erkannt (FAIL) → Co-Migration erlaubt (SUCCESS) → Live-Deploy verifiziert.
      ])
    ],
  )
])

#pagebreak()
#slide("Migrationsbaum und weitere Schritte", [
  #two_col(
    [
      #termbox[
        \$ cryme show tree

        [Step 0] INIT \
        ├── #text(fill: bad)[[Step 1] FAILED] \
        └── #text(fill: good)[[Step 2] SUCCESS (Co-Migrated)] \
        #h(1em) ├── #text(fill: warn)[[Step 3] ABORTED] \
        #h(1em) └── #text(fill: good)[[Step 4] SUCCESS (Cert)] \
        #h(2em) └── #text(fill: good)[[Step 5] SUCCESS (TLS 1.3)]
      ]
    ],
    [
      #keybox("Schritte 3–4", [
        - *Schritt 3:* Zertifikat RSA → ML-DSA-44
        - *Schritt 4:* TLS 1.2/1.3 → TLS 1.3 only
        - Jeweils: migrate → deploy → verify
      ])
      #v(0.16in)
      #keybox("Event Sourcing", [
        - Jeder Versuch wird dokumentiert — auch Fehlschläge.
        - Zustand bei Schritt N durch Replay rekonstruierbar.
        - Git-Analogie: Commit = MigrationStep · log = tree · HEAD = Zustand
      ])
    ],
  )
])

#pagebreak()
#slide("Ergebnisse", [
  #two_col(
    [
      #keybox("Thesis-Claims nachgewiesen", [
        - #text(fill: good, weight: "bold")[✓] Versteckte Abhängigkeiten erkannt (Schritt 1 FAILED)
        - #text(fill: good, weight: "bold")[✓] SCC-Co-Migration funktioniert (Schritt 2 SUCCESS)
        - #text(fill: good, weight: "bold")[✓] Live-Deploy auf HTTPS (API + TLS ändern sich)
        - #text(fill: good, weight: "bold")[✓] Unabhängige Verifikation (curl / openssl)
      ])
    ],
    [
      #keybox("TLS-Profile (cryme_tls)", [
        #table(
          columns: (1.2fr, auto, auto),
          inset: 4pt,
          stroke: none,
          table.header(
            text(size: 11pt, weight: "bold")[Profil],
            text(size: 11pt, weight: "bold")[KEX],
            text(size: 11pt, weight: "bold")[TLS],
          ),
          [`classic-rsa-ecdhe`], [ECDHE], [1.2+1.3],
          [`hybrid-kex-classic-cert`], [X25519\_MLKEM768], [1.2+1.3],
          [`hybrid-kex-mldsa-cert`], [X25519\_MLKEM768], [1.2+1.3],
          [`tls13-only`], [beliebig], [1.3 only],
        )
      ])
      #v(0.12in)
      #text(size: 11.5pt, fill: muted)[Neue Algorithmen über `migration_variants` in YAML — ohne Code-Änderung]
    ],
  )
])

#pagebreak()
#slide("Grenzen, Fazit und Ausblick", [
  #two_col(
    [
      #keybox("PoC-Grenzen", [
        - Ein Szenario (Webserver + Browser)
        - ML-DSA-Zertifikate experimentell
        - Keine vollautomatische Migrationsplanung
        - Operator gibt Migrationsschritte vor
      ])
      #v(0.16in)
      #keybox("Vision", [
        - Beliebige kryptografische Landschaften
        - Automatisierte PQC-Iterationsplanung
        - CI/CD-Integration: Crypto-as-Code
      ])
    ],
    [
      #keybox("Fazit", [
        CRYME demonstriert: Riskante PQC-Migrationsschritte lassen sich *vor* der Ausführung simulativ erkennen und abfangen.
        #v(0.1in)
        #quote[Versteckte Abhängigkeiten → Clusters → sichere Reihenfolge]
      ])
      #v(0.16in)
      #keybox("Beitrag", [
        1. Oracle-Framework für kryptografische Migration \
        2. Graphbasiertes SCC-Clustering \
        3. End-to-End: YAML → Deploy → Verify \
        4. Event Sourcing & Audit-Trail
      ])
    ],
  )
])

#pagebreak()
#slide("Vielen Dank für die Aufmerksamkeit", [
  #align(center)[
    #v(0.4in)
    #text(size: 22pt, weight: "bold", fill: dark)[Fragen?]
    #v(0.35in)
  ]
])
