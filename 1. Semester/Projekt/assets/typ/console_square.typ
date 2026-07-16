#set page(width: 550pt, height: 550pt, margin: 25pt, fill: none)

#let mint    = rgb("#16C2A3")
#let good    = rgb("#1E8E3E")
#let bad     = rgb("#D23B3B")
#let warn    = rgb("#C08A1E")

#align(center + horizon)[
  #block(
    fill: rgb("#0B1722"),
    radius: 14pt,
    width: 100%,
    stroke: 2pt + mint,
    inset: 22pt,
  )[
    #align(left)[
      #box(fill: bad, radius: 999pt, width: 14pt, height: 14pt) #h(4pt)
      #box(fill: warn, radius: 999pt, width: 14pt, height: 14pt) #h(4pt)
      #box(fill: good, radius: 999pt, width: 14pt, height: 14pt)
      #v(12pt)
      #set text(font: ("Menlo", "Courier New"), size: 14.5pt, fill: rgb("#C7D2DC"))
      #text(fill: mint)[root\@cryme-oracle] #text(fill: rgb("#E2E8F0"))[\$ node cryme show tree]\
      PQC Migration Tree:\
      [Step 0] INIT (system_start)\
      ├── #text(fill: bad)[[Step 1] FAILED (Policy Denied: Webserver.Key)]\
      └── #text(fill: good)[[Step 2] SUCCESS (Co-Migrated Webserver.Key)]\
      #h(14pt)├── #text(fill: warn)[[Step 3] ABORTED (Redundant State Detected)]\
      #h(14pt)└── #text(fill: good)[[Step 4] SUCCESS (Migrated Webserver.Cert)]\
      #h(28pt)└── #text(fill: good)[[Step 5] SUCCESS (Migrated Webserver)]\
      #v(8pt)
      #text(fill: mint)[root\@cryme-oracle] #text(fill: rgb("#E2E8F0"))[\$ node cryme show system]\
      ====================================================\
      #h(8pt) ID | Component#h(8pt) | Status#h(11pt) | Algorithm\
      ----------------------------------------------------\
      #h(8pt) 32 | Client_Browser#h(8pt) | #text(fill: good)[migrated] | MLKEM768\
      #h(8pt) 27 | Webserver_Classic | #text(fill: good)[migrated] | ML-DSA-65\
      #h(8pt) 26 | Webserver_Classic | #text(fill: good)[migrated] | TLS1.3\
      ====================================================
    ]
  ]
]
