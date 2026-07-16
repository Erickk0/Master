#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(font: "Linux Libertine", size: 11pt, lang: "de")
#set heading(numbering: "1.")

// Titelbereich
#align(center)[
  #text(size: 18pt, weight: "bold")[Masterprojekt-Exposé] \
  #v(0.5cm)
  #text(
    size: 14pt,
    weight: "semibold",
  )[Entwicklung und Implementierung eines simulationsbasierten "Oracles" zur Orchestrierung der Post-Quantum-Kryptografie-Migration mittels Digitaler Zwillinge und Graphdatenbanken]
]

#v(1cm)

// Projekt-Metadaten
#grid(
  columns: (auto, 1fr),
  gutter: 1em,
  [*Projektkontext:*], [CRYME Project (Cryptographic Migration Engineering)],
  [*Zeitraum:*], [Mai 2024 – Ende Juni 2024 (9 Wochen)],
  [*Betreuung:*], [Prof. Dr. Marc Stöttinger, Prof. Dr. Bodo Igler],
  [*Status:*], [Proof of Concept (PoC)],
)

#v(0.5cm)

= Ausgangslage und Motivation
Klassische kryptografische Verfahren sind durch die Entwicklung leistungsfähiger Quantencomputer bedroht . Die Migration komplexer Systeme erfordert mehr als den Austausch von Algorithmen; sie verlangt ein tiefes Verständnis expliziter und impliziter Abhängigkeiten zwischen Komponenten, Schlüsseln und Protokollen .

Das im Projektkontext beschriebene "Oracle" dient als theoretische Instanz zur Validierung von Migrationsstrategien . Es prüft, ob ein System nach einem Migrationsschritt funktionsfähig bleibt oder aufgrund unentdeckter Abhängigkeiten versagt .

= Zielsetzung
Ziel des Projekts ist die technische Realisierung dieses Oracles als Simulations-Framework. Kernpunkte sind:
- Abbildung realer Systeme als *Digital Twins* (Digitale Zwillinge) .
- Nutzung von *YAML* für "Infrastructure as Code" zur Konfigurationsbeschreibung.
- Identifikation von Gemeinsamkeiten und individuellen Maßnahmen zur Generalisierung.
- Orchestrierung mittels einer *Graphdatenbank (Neo4j)* [1, 2].
- Bereitstellung einer visuellen Benutzeroberfläche für Endnutzer .

= Methodik und Umsetzung
1. *Digital Twins & YAML:* Modellierung der Zielarchitektur und ihrer kryptografischen Assets über strukturierte YAML-Dateien.
2. *Abhängigkeitsanalyse:* Entwicklung eines Parsers, der implizite Links (z.B. Shared Keys) erkennt .
3. *Graph-Orchestrierung:* Überführung der Assets und Abhängigkeiten in ein Neo4j-Modell (Nodes & Edges) .
4. *Simulation (Oracle):* Implementierung der Logik, die Migrationsschritte im Graphen simuliert und gegen Testfunktionen validiert .

#pagebreak()

= Arbeitspakete und Zeitplan
Aufgrund des Projektendes im Juni ist der Zeitplan stark fokussiert:

- *AP 1: Design & YAML-Modellierung (Woche 1):* Entwurf des Schemas für Digital Twins.
- *AP 2: Parser & Generalisierung (Woche 2-3):* Implementierung der Logik zur Identifikation von Gemeinsamkeiten.
- *AP 3: Graph-Integration (Woche 4-5):* Automatisierte Befüllung der Neo4j-Datenbank.
- *AP 4: Oracle-Implementierung (Woche 6-7):* Kernlogik der Simulations-Engine.
- *AP 5: Visuelle UI & PoC (Woche 8):* Dashboard-Entwicklung (z. B. via Streamlit).
- *AP 6: Evaluierung & Dokumentation (Woche 9):* Abschlusstests und Finalisierung.

= Erwartete Ergebnisse
Ein funktionsfähiger Prototyp, der zeigt, wie komplexe PQC-Migrationen durch Simulation abgesichert werden können. Das Ergebnis umfasst die YAML-Spezifikationen, die Simulations-Engine und ein interaktives Dashboard zur Visualisierung des Migrationsfortschritts.

