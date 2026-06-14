#set page(paper: "presentation-16-9", margin: 1.2em, fill: rgb("#0A0F1C"))
#set text(font: ("Arial", "Helvetica", "sans-serif"), size: 9pt, fill: rgb("#E0E6ED"), lang: "de")

// Futuristic Minimalist Header
#align(center)[
  #text(size: 22pt, weight: "black", fill: rgb("#00FFCC"))[CRYME: PQC Migration Oracle] \
  #text(size: 12pt, weight: "bold", fill: rgb("#4C9F70"), tracking: 1pt)[DYNAMIC DEPENDENCY DISCOVERY & TEMPORAL CONSTRAINT VALIDATION] \
  #v(0.2em)
  #text(size: 8pt, fill: rgb("#8B9BB4"))[Erick Zeiler | Masterprojekt Informatik | Hochschule RheinMain | Betreuung: Prof. Dr. Marc Stöttinger, Prof. Dr. Bodo Igler]
]

#v(0.2em)
#line(length: 100%, stroke: 1pt + rgb("#1C2A4A"))
#v(0.5em)

#grid(
  columns: (1fr, 1.2fr),
  gutter: 2em,
  
  // Left Column: In-depth Information
  [
    #text(size: 11pt, weight: "bold", fill: rgb("#00FFCC"))[1. Motivation: Das PQC-Dilemma]
    #v(0.2em)
    Die Migration auf Post-Quanten-Kryptografie (PQC) stellt kritische Infrastrukturen vor enorme Herausforderungen. Ein unsachgemäßer Austausch kryptografischer Algorithmen führt unweigerlich zu Systemausfällen, wenn verborgene TLS-Abhängigkeiten übersehen werden.
    
    #v(0.8em)
    #text(size: 11pt, weight: "bold", fill: rgb("#00FFCC"))[2. Der Lösungsansatz: Graphbasiertes Oracle]
    #v(0.2em)
    Ein *Zero-Trust Simulations-Gatekeeper* zur präventiven Validierung von Migrationsstrategien:
    
    #v(0.2em)
    - *Dynamic Dependency Discovery:* Der Simulator erkennt versteckte strukturelle Abhängigkeiten (z.B. zwischen Server- und Client-Schlüsseln) zur Laufzeit und fusioniert diese zwingend in "Co-Migrations-Cluster".
    - *Temporal Barrier Enforcement:* Ein PQC-Hybrid-System kann erst aktiviert werden, wenn zwingende Legacy-Voraussetzungen abgebaut wurden (keine Out-of-Order-Zustände).
    
    #v(0.8em)
    #text(size: 11pt, weight: "bold", fill: rgb("#00FFCC"))[3. Architektur & Model-Driven Scheduling]
    #v(0.2em)
    Die Modellierung erfolgt hochskalierbar als *Digital Twins* (YAML). Die topologische Orchestrierung übernimmt eine dynamische *Neo4j Graphdatenbank*. 
    
    Dies ermöglicht eine revisionssichere Planung komplexer Corporate-PQC-Iterationen ohne manuelle Fehleinschätzungen.
  ],
  
  // Right Column: The Terminal / Validation
  [
    #text(size: 11pt, weight: "bold", fill: rgb("#00FFCC"))[4. Live-Simulation & Zero-Trust Rollback]
    #v(0.2em)
    Das Oracle agiert als Wächter: Fehlerhafte Migrationsschritte werden präventiv blockiert und transaktional zurückgerollt. Konsistente Cluster werden erfolgreich migriert.
    
    #v(0.5em)
    // Futuristic Terminal box
    #rect(fill: rgb("#050914"), radius: 4pt, width: 100%, stroke: 0.5pt + rgb("#00FFCC"), inset: 0.8em)[
      #text(font: ("Courier New", "Consolas", "monospace"), size: 7pt, fill: rgb("#A0AEC0"))[
#text(fill: rgb("#00FFCC"))[root\@cryme-oracle] #text(fill: rgb("#CBD5E0"))[~ \$ node cryme show tree]
PQC Migration Tree:
[Step 0] INIT (system_start)
├── #text(fill: rgb("#FF4A4A"))[[Step 1] FAILED (Policy Denied: Webserver_Classic.Key...)]
└── #text(fill: rgb("#22C55E"))[[Step 2] SUCCESS (Co-Migrated Webserver_Classic.Key...)]
    ├── #text(fill: rgb("#EAB308"))[[Step 3] ABORTED (Redundant State Detected...)]
    └── #text(fill: rgb("#22C55E"))[[Step 4] SUCCESS (Migrated Webserver_Classic.Cert...)]
        └── #text(fill: rgb("#22C55E"))[[Step 5] SUCCESS (Migrated Webserver_Classic...)]

#text(fill: rgb("#00FFCC"))[root\@cryme-oracle] #text(fill: rgb("#CBD5E0"))[~ \$ node cryme show system]
========================================================================
                 CRYME PQC SYSTEM STATUS ORACLE
========================================================================
 ID | Component         | Type            | Status   | Algorithm
------------------------------------------------------------------------
 32 | Client_Browser    | CryptoAsset     | #text(fill: rgb("#22C55E"))[migrated] | MLKEM768
 27 | Webserver_Classic | CryptoAsset     | #text(fill: rgb("#22C55E"))[migrated] | ML-DSA-65
 30 | Webserver_Classic | CryptoAsset     | #text(fill: rgb("#22C55E"))[migrated] | MLKEM768
 26 | Webserver_Classic | SecurityControl | #text(fill: rgb("#22C55E"))[migrated] | TLS1.3
========================================================================
      ]
    ]
    
    #v(0.8em)
    #text(size: 8pt, style: "italic", fill: rgb("#8B9BB4"))[
      *Ausgabeanalyse:* Step 1 wurde wegen Verletzung der TLS-Abhängigkeit abgebrochen. Step 2 demonstriert eine erfolgreiche Co-Migration des erkannten Clusters.
    ]
  ]
)
