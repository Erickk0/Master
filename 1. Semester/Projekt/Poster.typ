// ============================================================
//  CRYME – Masterprojekt-Poster (A0 Hochformat, modern & druckfreundlich)
// ============================================================

#set page(paper: "a0", margin: 2.2cm, fill: rgb("#F7FAFB"))
#set text(font: ("Arial", "Helvetica", "sans-serif"), size: 25pt, fill: rgb("#1B2733"), lang: "de")
#set par(justify: true, leading: 0.72em)

// ---------- Farbpalette ----------
#let primary = rgb("#0E4D64") // Tiefes Petrol
#let accent  = rgb("#1B98A8") // Petrol – Linien/Strokes
#let mint    = rgb("#16C2A3") // Frischer Akzent (modern)
#let ink     = rgb("#1B2733") // Fließtext
#let muted   = rgb("#64748B") // Sekundärtext
#let cardbd  = rgb("#E3EBEF") // Kartenrand
#let soft    = rgb("#EEF6F7") // weicher Hintergrund
#let good    = rgb("#1E8E3E")
#let bad     = rgb("#D23B3B")
#let warn    = rgb("#C08A1E")

#let grad   = gradient.linear(primary, mint, angle: 50deg)
#let grad-h = gradient.linear(rgb("#0B3D52"), primary, mint, angle: 60deg)

// ---------- Bausteine ----------
#let section(num, title, body) = block(
  width: 100%,
  fill: white,
  radius: 16pt,
  inset: 28pt,
  stroke: 1.5pt + cardbd,
  below: 28pt,
)[
  #grid(
    columns: (auto, 1fr),
    gutter: 18pt,
    align: horizon,
    box(width: 64pt, height: 64pt, radius: 16pt, fill: grad)[
      #align(center + horizon)[#text(size: 32pt, weight: "black", fill: white)[#num]]
    ],
    text(size: 35pt, weight: "bold", fill: primary)[#title],
  )
  #v(6pt)
  #line(length: 100%, stroke: 1.5pt + soft)
  #v(14pt)
  #set text(size: 25pt, fill: ink)
  #body
]

// Schlagwort-Pill
#let pill(body, fg: primary, bg: soft) = box(
  fill: bg, radius: 999pt, inset: (x: 14pt, y: 7pt), baseline: 4pt,
)[#text(size: 19pt, weight: "bold", fill: fg)[#body]]

#let dnode(label, fill: white, fg: ink, stroke: accent, dash: "solid") = box(
  fill: fill,
  stroke: (paint: stroke, thickness: 2.5pt, dash: dash),
  radius: 12pt,
  inset: (x: 16pt, y: 13pt),
)[#align(center)[#text(size: 20pt, fill: fg, weight: "medium")[#label]]]

#let gnode(label) = box(
  fill: grad, radius: 12pt, inset: (x: 16pt, y: 13pt),
)[#align(center)[#text(size: 20pt, fill: white, weight: "bold")[#label]]]

#let arr  = h(10pt) + text(size: 34pt, fill: mint, weight: "bold")[#sym.arrow.r] + h(10pt)
#let darr = align(center)[#text(size: 34pt, fill: mint, weight: "bold")[#sym.arrow.b]]
#let cap(body) = align(center)[#text(size: 19pt, style: "italic", fill: muted)[#body]]
#let dframe(body) = block(width: 100%, fill: soft, radius: 14pt, inset: 18pt, stroke: 1.5pt + cardbd)[#body]

// ============================================================
//  KOPFBEREICH
// ============================================================
#block(
  width: 100%,
  fill: grad-h,
  radius: 20pt,
  inset: (x: 40pt, y: 34pt),
)[
  #align(center)[
    #box(fill: rgb(255, 255, 255, 38), radius: 999pt, inset: (x: 18pt, y: 8pt))[
      #text(size: 20pt, weight: "bold", fill: white, tracking: 2pt)[POST-QUANTEN-KRYPTOGRAFIE · MASTERPROJEKT]
    ]
    #v(16pt)
    #text(size: 92pt, weight: "black", fill: white)[CRYME]
    #v(2pt)
    #text(size: 36pt, weight: "regular", fill: rgb("#CDEFEA"))[#underline[Cry]ptographic #underline[M]igration #underline[E]ngineering]
    #v(16pt)
    #text(size: 32pt, weight: "bold", fill: white)[Ein simulationsbasiertes Oracle zur Orchestrierung der PQC-Migration]
    #v(6pt)
    #text(size: 24pt, fill: rgb("#CDEFEA"))[mittels digitaler Zwillinge und Graphdatenbanken]
  ]
]

#v(14pt)
#align(center)[
  #text(size: 23pt, fill: muted)[
    *Erick Zeiler* · Masterprojekt Informatik · Hochschule RheinMain · Betreuung: Prof. Dr. Marc Stöttinger, Prof. Dr. Bodo Igler
  ]
]
#v(18pt)

// ============================================================
//  HAUPTTEIL – zwei Spalten
// ============================================================
#grid(
  columns: (1fr, 1fr),
  gutter: 28pt,

  // ---------------- LINKE SPALTE ----------------
  [
    // 1) MOTIVATION & PROBLEMSTELLUNG
    #section([1], [Motivation & Problemstellung])[
      Quantencomputer bedrohen klassische asymmetrische Kryptografie. Der Umstieg auf
      *Post-Quanten-Kryptografie (PQC)* ist daher unausweichlich – aber er bedeutet weit mehr
      als den bloßen Austausch von Algorithmen.

      #v(8pt)
      Reale Systeme enthalten *verborgene kryptografische Abhängigkeiten* zwischen Schlüsseln,
      Zertifikaten, Protokollen und Komponenten (z.\ B. gemeinsam genutzte Schlüssel, Trust-Ketten,
      Protokoll-Bindungen – nicht nur TLS). Wird ein einzelnes Asset isoliert migriert, ohne diese
      Abhängigkeiten zu berücksichtigen, droht ein *Systemausfall*.

      #v(16pt)
      // --- Diagramm 1: Problem ---
      #dframe[
        #align(center)[
          #dnode("Krypto-Asset A")
          #h(6pt) #text(size: 18pt, fill: bad, weight: "bold")[#sym.arrow.l.r verborgen abhängig #sym.arrow.l.r] #h(6pt)
          #dnode("Krypto-Asset B")
          #v(12pt)
          #text(size: 18pt, fill: muted)[Naive Einzel-Migration eines Assets]
          #v(6pt)
          #darr
          #v(6pt)
          #dnode("Systemausfall", fill: rgb("#FBE9E7"), fg: bad, stroke: bad)
        ]
        #v(10pt)
        #cap[Abb. 1: Eine isolierte Migration verletzt versteckte Abhängigkeiten und bricht das System.]
      ]
    ]

    // 2) ZIELSETZUNG
    #section([2], [Zielsetzung])[
      Entwicklung eines *generischen, systemunabhängigen Simulations-Frameworks ("Oracle")*, das
      Migrationsstrategien beliebiger kryptografischer Landschaften *präventiv* validiert, *bevor*
      sie auf dem realen System ausgeführt werden. Ziele im Überblick:

      #v(10pt)
      - Abbildung realer Systeme als vereinfachte *digitale Zwillinge*
      - *Automatische* Erkennung versteckter Abhängigkeiten
      - Bestimmung einer *korrekten Migrations-Reihenfolge*
      - Präventives *Blockieren & Zurückrollen* fehlerhafter Schritte
      - Visualisierung des Migrationsfortschritts (PoC)
    ]

    // 3) LÖSUNGSANSATZ
    #section([3], [Lösungsansatz: Das Oracle als Gatekeeper])[
      Das Oracle arbeitet nach dem Prinzip *"prüfen vor ausführen"* (deny-by-default): Kein
      Migrationsschritt gilt automatisch als sicher – jeder Schritt muss zuerst gegen *alle*
      bekannten Abhängigkeiten validiert werden, sonst wird er abgewiesen.

      #v(12pt)
      #pill[Dynamic Dependency Discovery] versteckte strukturelle Abhängigkeiten zwischen Assets
      (z.\ B. gemeinsam genutzte Schlüssel oder Trust-Beziehungen) werden zur Laufzeit erkannt und
      zwingend zu *Co-Migrations-Clustern* zusammengefasst.

      #v(10pt)
      #pill[Temporal Barrier Enforcement] ein PQC-Hybrid-System wird erst aktiviert, wenn alle
      zwingenden Vorbedingungen erfüllt sind (keine Out-of-Order-Zustände).

      #v(16pt)
      // --- Diagramm 2: Pipeline ---
      #dframe[
        #align(center)[
          #dnode("Digitale Zwillinge\n(YAML)") #arr
          #dnode("Dependency\nDiscovery") #arr
          #dnode("Neo4j-\nGraph") #arr
          #gnode("Oracle\n(Gatekeeper)") #arr
          #dnode("Validierter\nMigrationsplan", fill: rgb("#E6F4EA"), fg: good, stroke: good)
        ]
        #v(10pt)
        #cap[Abb. 2: Verarbeitungs-Pipeline von der Modellierung bis zum geprüften Plan.]
      ]
    ]
  ],

  // ---------------- RECHTE SPALTE ----------------
  [
    // 4) ARCHITEKTUR & UMSETZUNG
    #section([4], [Architektur & Umsetzung])[
      Die realen Anwendungssysteme werden als *vereinfachte digitale Abbilder (Digital Twins)*
      modelliert und über *YAML* nach dem Prinzip "Infrastructure as Code" beschrieben und verwaltet.

      #v(8pt)
      *Warum graphbasiert?* Kryptografische Assets und ihre Abhängigkeiten bilden von Natur aus ein
      *Netzwerk*. Eine *Neo4j-Graphdatenbank* bildet Assets als *Knoten* und Abhängigkeiten als
      *Kanten* ab. So lassen sich Co-Migrations-Cluster durch Graph-Traversierung finden und eine
      korrekte Reihenfolge per topologischer Sortierung bestimmen – Aufgaben, die in tabellarischen
      Strukturen nur schwer abbildbar sind.

      #v(16pt)
      // --- Diagramm 3: Graphmodell ---
      #dframe[
        #align(center)[
          #box(stroke: (paint: mint, thickness: 3pt, dash: "dashed"), radius: 14pt, inset: 16pt, fill: white)[
            #text(size: 17pt, fill: accent, weight: "bold")[Co-Migrations-Cluster]
            #v(8pt)
            #dnode("Asset A", stroke: primary)
            #h(4pt) #text(size: 18pt, fill: primary, weight: "bold")[#sym.dash.em] #h(4pt)
            #dnode("Asset B", stroke: primary)
          ]
          #v(10pt)
          #darr
          #v(6pt)
          #dnode("Abhängiges Asset C")
        ]
        #v(10pt)
        #cap[Abb. 3: Knoten = Assets, Kanten = Abhängigkeiten. Verbundene Knoten werden gemeinsam migriert.]
      ]
    ]

    // 5) ERGEBNISSE
    #section([5], [Ergebnisse: Live-Simulation])[
      Der Proof of Concept blockiert fehlerhafte Schritte präventiv und rollt sie transaktional
      zurück; konsistente Cluster werden erfolgreich migriert. Die folgende Ausgabe zeigt dies an
      einem konkreten Beispielsystem:

      #v(12pt)
      // Terminal-Box (dunkler Akzent = echte Werkzeugausgabe)
      #block(fill: rgb("#0B1722"), radius: 14pt, width: 100%, stroke: 2pt + mint, inset: 20pt)[
        #box(fill: bad, radius: 999pt, width: 16pt, height: 16pt) #h(4pt)
        #box(fill: warn, radius: 999pt, width: 16pt, height: 16pt) #h(4pt)
        #box(fill: good, radius: 999pt, width: 16pt, height: 16pt)
        #v(10pt)
        #set text(font: ("Consolas", "Courier New", "monospace"), size: 17pt, fill: rgb("#C7D2DC"))
        #text(fill: mint)[root\@cryme-oracle] #text(fill: rgb("#E2E8F0"))[\$ node cryme show tree]\
        PQC Migration Tree:\
        [Step 0] INIT (system_start)\
        ├── #text(fill: bad)[[Step 1] FAILED (Policy Denied: Webserver.Key)]\
        └── #text(fill: good)[[Step 2] SUCCESS (Co-Migrated Webserver.Key)]\
        #h(14pt)├── #text(fill: warn)[[Step 3] ABORTED (Redundant State Detected)]\
        #h(14pt)└── #text(fill: good)[[Step 4] SUCCESS (Migrated Webserver.Cert)]\
        #h(28pt)└── #text(fill: good)[[Step 5] SUCCESS (Migrated Webserver)]\
        #v(6pt)
        #text(fill: mint)[root\@cryme-oracle] #text(fill: rgb("#E2E8F0"))[\$ node cryme show system]\
        ====================================================\
        #h(8pt) ID | Component#h(8pt) | Status#h(11pt) | Algorithm\
        ----------------------------------------------------\
        #h(8pt) 32 | Client_Browser#h(8pt) | #text(fill: good)[migrated] | MLKEM768\
        #h(8pt) 27 | Webserver_Classic | #text(fill: good)[migrated] | ML-DSA-65\
        #h(8pt) 26 | Webserver_Classic | #text(fill: good)[migrated] | TLS1.3\
        ====================================================
      ]
      #v(12pt)
      #text(size: 20pt, style: "italic", fill: muted)[
        *Analyse:* Step 1 wird wegen einer verletzten Abhängigkeit abgewiesen; Step 2 zeigt die
        erfolgreiche Co-Migration des erkannten Clusters.
      ]
    ]

    // 6) FAZIT & AUSBLICK
    #section([6], [Fazit & Ausblick])[
      Der PoC zeigt, dass sich riskante PQC-Migrationsschritte *vor* der Ausführung simulativ
      erkennen und abfangen lassen. Versteckte Abhängigkeiten werden automatisch zu Clustern
      gebündelt und in eine konsistente Reihenfolge gebracht.

      #v(8pt)
      *Ausblick (langfristige Vision):* Auf dieser Grundlage könnte künftig eine
      nachvollziehbare, weitgehend automatisierte Planung komplexer unternehmensweiter
      PQC-Iterationen aufgebaut werden – die vollständige Absicherung realer Großsysteme bleibt
      Gegenstand weiterführender Arbeiten.
    ]
  ],
)

// ============================================================
//  FUSSZEILE
// ============================================================
#v(1fr)
#block(width: 100%, height: 5pt, radius: 999pt, fill: grad)
#v(10pt)
#grid(
  columns: (1fr, auto, 1fr),
  align: (left + horizon, center + horizon, right + horizon),
  text(size: 20pt, fill: muted)[Hochschule RheinMain · Fachbereich DCSM],
  text(size: 20pt, weight: "bold", fill: primary)[CRYME · Cryptographic Migration Engineering],
  text(size: 20pt, fill: muted)[Masterprojekt · 2025],
)
