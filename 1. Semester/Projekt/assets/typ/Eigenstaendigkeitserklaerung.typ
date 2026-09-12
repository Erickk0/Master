#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(font: "Linux Libertine", size: 11pt, lang: "de")
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)

#align(center)[
  #text(size: 14pt, weight: "bold")[Eigenständigkeitserklärung]
  #v(0.3cm)
  #text(size: 10pt, style: "italic")[
    Vorlage gemäß RPO 2024, §19 (6) — Masterprojekt CRYME
  ]
]

#v(0.8cm)

#block(
  fill: rgb("#f5f5f5"),
  inset: 12pt,
  radius: 2pt,
  width: 100%,
)[
  #text(size: 10pt)[
    *Hinweis:* Verwenden Sie die folgende Eigenständigkeitserklärung in Ihrer
    Abschlussarbeit. Der Text ist wortwörtlich zu übernehmen, mit Ausnahme des
    grauen Abschnitts. Diesen legen Sie in Absprache mit dem Referenten vor
    Beginn der Bearbeitungszeit fest.
  ]
]

#v(0.8cm)

= Eigenständigkeitserklärung (gem. RPO 2024, §19 (6))

Ich bin verantwortlich für die Qualität des Inhalts dieser Arbeit, den ich mit
geeigneten wissenschaftlichen Quellen belegt bzw. gestützt habe. Die aus
fremden Quellen direkt oder indirekt übernommenen Texte, Gedankengänge,
Konzepte, Grafiken, technischen Inhalte und ähnliches in meinen Ausführungen
habe ich eindeutig gekennzeichnet und mit vollständigen Verweisen auf die
jeweilige Quelle versehen. Alle weiteren Inhalte der Arbeit (Textteile,
Abbildungen, Tabellen etc.) ohne entsprechende Verweise stammen im
urheberrechtlichen Sinn von mir.

Ich versichere außerdem, dass ich die Master-Arbeit selbständig verfasst und
keine anderen als die angegebenen Quellen und Hilfsmittel benutzt habe.

#v(0.6cm)

#block(
  fill: rgb("#e8e8e8"),
  inset: 14pt,
  radius: 2pt,
  width: 100%,
)[
  == Verwendung generativer KI

  Ich versichere, dass ich KI-Tools lediglich als Hilfsmittel verwendet habe und
  in der vorliegenden Arbeit mein gestalterischer Einfluss überwiegt. Ich
  verantworte die Übernahme jeglicher von mir verwendeter KI-generierter Inhalte
  vollumfänglich selbst.

  *Verwendete KI-Werkzeuge:* Cursor IDE (Agent/Chat), Claude und GPT über Cursor,
  gelegentlich GitHub Copilot (Autocomplete).

  *Einsatzbereiche im Masterprojekt CRYME (Cryptographic Migration Engineering):*

  + *Recherche und Planung der Architektur*
    KI-Werkzeuge unterstützten mich bei der Recherche zu Post-Quantum-Kryptografie,
    Digital Twins, Graphdatenbanken und Migrationsstrategien. Dabei halfen sie bei
    der Strukturierung von Dokumentation, beim Vergleich technischer Ansätze sowie
    bei der Ausformulierung von Architekturkonzepten. Die Forschungsfrage, das
    Domänenmodell, die Oracle-Logik und alle wesentlichen Architekturentscheidungen
    wurden von mir eigenständig getroffen und fachlich verantwortet.

  + *Troubleshooting*
    Bei Fehlersuche und Debugging (z.\,B. TLS-Verifikation, Ansible-Deployment,
    Shell-Skripte, Docker-Konfiguration) nutzte ich KI zur Analyse von
    Fehlermeldungen und zur Vorschläge von Lösungsansätzen. Jeder Fix wurde von
    mir manuell geprüft, getestet und in den tatsächlichen Projektkontext
    übernommen.

  + *Coding-Assistenz*
    KI unterstützte mich bei der Implementierung von Boilerplate-Code, CLI-Struktur,
    Jinja2-Templates, Shell-Skripten und Teilen der Oracle-Engine. Der Algorithmus
    (SCC/Tarjan), die Migrationsvalidierungsregeln und die fachliche Logik stammen
    aus meinem Design. KI-generierter Code wurde nicht blind übernommen, sondern
    durch manuelle Tests, unabhängige Verifikation (curl, openssl) und Code-Review
    abgesichert.
]

#v(0.8cm)

Die vorliegende Arbeit wurde bisher weder im In- noch im Ausland in gleicher oder
ähnlicher Form einer anderen Prüfungsbehörde vorgelegt. Mir ist bekannt, dass ein
Verstoß gegen die genannten Punkte als Täuschungsversuch gelten und
prüfungsrechtliche Konsequenzen haben kann. Insbesondere kann es dazu führen, dass
die Leistung nicht bestanden ist und dass bei mehrfachem oder schwerwiegendem
Täuschungsversuch eine Exmatrikulation droht.

#v(2cm)

#grid(
  columns: (1fr, 1fr),
  gutter: 2cm,
  align(left)[
    #line(length: 100%, stroke: 0.5pt)
    Ort, Datum
  ],
  align(left)[
    #line(length: 100%, stroke: 0.5pt)
    Unterschrift Studierende/Studierender

    #v(0.3cm)
    #text(size: 10pt)[Erick Zeiler]
  ],
)
