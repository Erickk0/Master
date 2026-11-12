#set page(
  paper: "a4",
  margin: (x: 2cm, y: 2.5cm),
  header: align(right)[
    #text(size: 9pt, fill: luma(120))[PQC-Migration & Self-Served CA im Automotive-Kontext]
  ],
  footer: context {
    let page_number = counter(page).get().first()
    let total_pages = counter(page).final().first()
    align(center)[
      #text(size: 9pt, fill: luma(120))[Seite #page_number von #total_pages]
    ]
  },
)

#set text(
  font: "Helvetica Neue",
  lang: "de",
  size: 10.5pt,
)

#set heading(numbering: "1.1")
#show link: it => underline(text(fill: rgb("#2b6cb0"), it))
#show raw.where(block: true): set text(font: "DejaVu Sans Mono", size: 8.5pt)

#let sourced-figure(img, caption) = {
  v(6pt)
  align(center)[
    #img
    #v(3pt)
    #text(size: 8pt, fill: luma(90))[#caption]
  ]
  v(4pt)
}

// Title Block
#align(center)[
  #block(width: 100%, inset: 15pt)[
    #text(size: 20pt, weight: "bold", fill: rgb("#1a365d"))[
      Forschungsbericht & Projektrahmen: Post-Quanten-Kryptographie (PQC) Migration & Self-Served CA
    ]
    #v(8pt)
    #text(size: 13pt, weight: "medium", fill: rgb("#2b6cb0"))[
      Architektur-Migration von OpenSSL 3.3/3.4 auf 3.5 für den Anwendungsfall Automotive
    ]
    #v(12pt)
    #text(size: 10pt, style: "italic", fill: luma(80))[
      Modul: Projekt 2 | Inkrementelle Entwicklung & Prototyping | Dual-Signature & Hybrid PKI
    ]
  ]
]

#v(10pt)

// Executive Summary Box
#rect(
  width: 100%,
  fill: rgb("#f7fafc"),
  stroke: 1pt + rgb("#cbd5e0"),
  inset: 12pt,
  radius: 4pt,
)[
  #text(weight: "bold", fill: rgb("#2d3748"))[Executive Summary / Kurzüberblick]
  #v(4pt)
  Dieses Dokument dient als zentrale Wissensbasis, Forschungsübersicht und Vorlage für die inkrementelle Umsetzung von Projekt 2. Gegenstand ist die systematische Vorbereitung und Implementierung einer Migration hin zu Post-Quanten-Kryptographie (PQC) in einer verteilten PKI-Umgebung. Der Fokus liegt dabei auf dem Anwendungsfall Automotive und der konkreten Migration von Bestandszertifikaten (unter OpenSSL 3.3 / 3.4) auf PQC-fähige Algorithmen (OpenSSL 3.5), eingebettet in eine Git-basierte Infrastruktur ohne Gefährdung privater Schlüssel.
]

#v(15pt)

= Kontext & Problemstellung (Automotive Use Case)

== Scope-Definition aus Anwendungsfall "Automotive"

In modernen Fahrzeugarchitekturen kommunizieren verteilte Steuergeräte (ECUs) über ein internes Fahrzeugnetzwerk (CAN/Ethernet). Das Fahrzeug selbst agiert als Edge-Knoten, der über gesicherte TLS-Kanäle mit einem zentralen Backend-Server (OEM-Cloud/Flottenmanagement) verbunden ist. Die kryptographische Identität eines Teilnehmers steckt dabei im Zertifikat: Eine offene TLS-Verbindung allein sagt nicht, welches Steuergerät oder welcher Server am anderen Ende steht.

Das Backend wiederum tauscht Informationen und Zertifikatssignierungsanfragen (CSRs) über eine explizit abgesicherte TLS-Verbindung mit einer Certificate Authority (CA) aus. Parallel existiert eine Schnittstelle zur Fabrik / zum Werk, wo Erstzertifikate bei der Produktion im Steuergerät verankert werden. Danach muss dieselbe Vertrauenskette über Backend und CA weitergeführt werden können, auch wenn der Signaturalgorithmus von klassisch auf PQC wechselt.

#align(center)[
  #rect(fill: rgb("#edf2f7"), inset: 10pt, radius: 4pt)[
    #text(size: 9.5pt)[
      CA-Server $italic("TLS") <--> italic("TLS")$ Backend-Server $italic("TLS") <--> italic("TLS")$ Fahrzeug (ECU-Netzwerk)
      #v(2pt)
      $arrow.t italic("TLS")$ Fabrik / Werk
    ]
  ]
]

Die allgemeine Rollenverteilung einer PKI, auf der dieser Pfad aufsetzt, zeigt die folgende Abbildung. Die Zertifizierungsstelle stellt Zertifikate aus, die Registrierungsstelle prüft die Identität des Antragstellers, und der Validierungsdienst bestätigt später, ob ein Zertifikat noch gilt. Im Automotive-Fall liegt die Erstverankerung bei der Fabrik, der laufende Austausch beim Backend und die Signierung bei der CA.

#sourced-figure(
  image("assets/pki-de.png", width: 78%),
  [Abbildung: Rollen einer Public-Key-Infrastruktur. Quelle: Bananenfalter, Wikimedia Commons, CC0, #link("https://commons.wikimedia.org/wiki/File:Orange_blue_public_key_infrastructure_1_de.svg")[Datei auf Wikimedia Commons].],
)

== Scope-Definition aus Iteration \#1 (Architektur & Software-Stacks)

Für die erste Iteration wird eine Multi-Versionen-Testumgebung aufgebaut:

- *CA-Server:* Läuft aktuell unter OpenSSL 3.4 (alt) und wird auf OpenSSL 3.5 aktualisiert. Er verwaltet Schlüsselpaare ($"pk"_"alt" \/ "sk"_"alt"$ bzw. $"pk"_"neu" \/ "sk"_"neu"$).
- *Backend-Server:* Läuft aktuell unter OpenSSL 3.3 (alt) und wird auf OpenSSL 3.5 aufgerüstet.
- *Git-Repository-Struktur:* Die Bereitstellung von Logik und CA-Konfigurationen erfolgt über Git-Repositories:
  - *CA Git-Repo:* Enthält CA-Skripte und OpenSSL-Konfigurationen. Streng getrennt: Private Keys werden niemals im Git-Repo abgelegt (auf dem Whiteboard explizit durchgestrichen).
  - *Backend Git-Repo:* Enthält Backend-Skripte und ein Submodul/Ordner CAs zur Verifizierung der CA-Vertrauenskette.
- *Kommunikationskanäle:*
  - *Sicherer Kanal (HTTPS/HTML):* Für administrative Zwecke und Bereitstellung öffentlicher CA-Zertifikate.
  - *Unsicherer Kanal (TLS ohne gegenseitige PQC-Authentifizierung):* Kanal, über den die Zertifikatsmigration stattfinden muss.

#v(10pt)

= PQC-Migration & Zertifikatsaustausch (Standards & RFCs)

Die Vorbereitung der PKI-Migration auf quantensichere Verfahren (wie ML-DSA / Dilithium, Falcon oder SPHINCS+) erfordert die Einhaltung aktueller IETF-Standards und ISO-Normen.

== IETF RFC 9810 & RFC 10073 (PQC Migration in PKI / CMP / EST)

Die IETF standardisiert Mechanismen, um klassische Schlüssel (RSA/ECC) schrittweise durch PQC-Schlüssel zu ersetzen, ohne die Abwärtskompatibilität zu unterbrechen.

*RFC 9810 (CMP / EST Extensions for PQC Migration):* Beschreibt, wie Zertifikats-Verwaltungsprotokolle (Certificate Management Protocol -- CMP, Enrollment over Secure Transport -- EST) erweitert werden, um NewWithOld- und OldWithNew-Zertifikate auszutauschen.

*RFC 10073 (Composite Signatures for PKI):* Regelt die Kombination von klassischen Algorithmen (z.B. ECDSA) mit PQC-Algorithmen (z.B. ML-DSA) in einem einzigen Zertifikat. Ein Angreifer müsste beide Verfahren brechen, um die Signatur zu fälschen.

Die Dokumente haben dabei unterschiedliche Zuständigkeiten. RFC 9810 spezifiziert CMP und ergänzt die Verwaltung von Zertifikaten mit KEM-Schlüsseln. EST selbst ist in RFC 7030 beschrieben. RFC 10073 verbindet eine klassische Signatur und ML-DSA zu einer Composite-Signatur innerhalb eines X.509-Zertifikats. Falcon ist im Text als weiteres Signaturverfahren genannt; ein zugehöriger FIPS ist noch nicht veröffentlicht.

== ITU-T X.509 / ISO/IEC 9594-8 & NIST SP 800-227

*ITU-T X.509 (v3 Extensions):* Nutzung von Alternative Public Key und Alternative Signature Algorithm Extensions (altSignature Value, altSignatureAlgorithm), um Hybridsignaturen standardkonform in bestehenden X.509-Strukturen einzubetten.

*NIST SP 800-227:* Recommendations for Key-Encapsulation Mechanisms. Empfehlungen zur sicheren Verwendung von KEMs, auch für hybride Verfahren während der Migration.

== IETF Catalyst Framework / Hybrid & Cross-Certification

Das Catalyst Framework definiert ein duales Re-Keying-Verfahren. Eine CA bestätigt ihre Kontinuität durch eine Überkreuz-Signierung (Cross-Certification) zwischen dem alten Schlüssel $"sk"_"alt"$ und dem neuen PQC-Schlüssel $"pk"_"neu"$. Technisch ist das derselbe Mechanismus wie in der folgenden Abbildung: Ein Zertifikat wird von einem anderen Schlüssel signiert, damit Teilnehmer der alten und der neuen Vertrauenskette denselben Inhaber erkennen. Im Projekt entspricht PKI 1 der klassischen CA und PKI 2 der PQC-CA.

#sourced-figure(
  image("assets/cross-certification.png", width: 92%),
  [Abbildung: Cross-Certification zwischen zwei PKIs. Ein Pfeil bedeutet „signiert von“; gleiche Farbe bedeutet gleicher öffentlicher Schlüssel. Quelle: Hydrargyrum, Wikimedia Commons, gemeinfrei, #link("https://commons.wikimedia.org/wiki/File:Cross-certification_diagram.svg")[Datei auf Wikimedia Commons].],
)

#v(10pt)

= Mathematische & Protokollarische Formalisierung des Migrations-Zertifikats

Das auf dem Whiteboard definierte Migrations-Zertifikat dient als Beweis, dass der Inhaber des neuen PQC-Schlüsselpaars ($"pk"_"neu"$, $"sk"_"neu"$) identisch mit dem Inhaber des bisherigen klassischen Schlüsselpaars ($"pk"_"alt"$, $"sk"_"alt"$) ist. Ohne diese Verkettung könnte auf dem unsicheren Kanal ein fremder Schlüssel als Nachfolger ausgegeben werden. Die Signatur mit $"sk"_"alt"$ bindet $"pk"_"neu"$ an die bereits bekannte Identität. Die Signatur mit $"sk"_"neu"$ zeigt, dass der neue Schlüssel zusätzlich selbst gültig signieren kann.

== Mathematische Definition

=== Migrations-Zertifikat (Cross-Signature / Dual-Signature)

Das Migrations-Zertifikat verkettet zwei Signaturen über den neuen öffentlichen Schlüssel $"pk"_"neu"$:

$ "Cert"_"Migration" = "Sig"("pk"_"neu", "sk"_"alt") || "Sig"("pk"_"neu", "sk"_"neu") $

$"Sig"("pk"_"neu", "sk"_"alt")$: Die alte CA signiert den neuen öffentlichen PQC-Schlüssel $"pk"_"neu"$ mit ihrem bisherigen privaten Schlüssel $"sk"_"alt"$. Dies garantiert Vertrauen für bestehende Clients (z.B. Backend unter OpenSSL 3.3/3.4).

$"Sig"("pk"_"neu", "sk"_"neu")$: Die neue PQC-CA signiert den neuen öffentlichen Schlüssel $"pk"_"neu"$ mit ihrem neuen privaten PQC-Schlüssel $"sk"_"neu"$. Dies validiert die Eigenständigkeit des neuen PQC-Schlüssels.

=== Neues CA-Self-Certificate

$ "Cert"_"CA-Self" = "Sig"("pk"_"neu", "sk"_"neu") $

Reines PQC-Selbstzertifikat für zukünftige Verbindungen (OpenSSL 3.5).

=== Allgemeine Nachrichtensignatur

$ "Sig"(m, "sk"_"neu") $

Signierung beliebiger Anwendungsdaten oder Statusmeldungen $m$ mit dem neuen PQC-Schlüssel.

== Verifikation auf Backend- und ECU-Ebene

Ein Empfänger (z.B. Backend-Server oder Fahrzeug-ECU) führt folgende Validierungsschritte durch:

+ *Bestehende Vertrauenskette prüfen:* Verifikation von $"Sig"("pk"_"neu", "sk"_"alt")$ mittels des bekannten $"pk"_"alt"$. Ist diese gültig, wird $"pk"_"neu"$ als vertrauenswürdiger Nachfolger akzeptiert.
+ *PQC-Integrität prüfen:* Verifikation von $"Sig"("pk"_"neu", "sk"_"neu")$ mittels des extrahierten $"pk"_"neu"$.
+ *Schlüssel-Update:* Ersetzung von $"pk"_"alt"$ durch $"pk"_"neu"$ im lokalen Trust-Store des Backends/Fahrzeugs.

== Anwendungsfälle (Use Cases aus Skizze 2)

=== CA Use Cases

- *Sicherer Kanal:* Eigenständigkeit der CA über administrative Schnittstelle nachweisen.
- *Unsicherer Kanal:* Übermittlung der Eigenständigkeit der neuen CA durch Signierung des neuen Schlüssels mit dem alten Schlüssel ($"Sig"("pk"_"neu", "sk"_"alt")$).
- *Nachrichtensignierung:* Erzeugung von $"Sig"(m, "sk"_"neu")$.

=== Backend-Server Use Cases

- *alive:* Heartbeat- / Health-Check-Signal zur Überprüfung der Netzwerkerreichbarkeit und des Migrationsstatus.
- *Server-Zertifikat:* Bereitstellung des eigenen TLS-Server-Zertifikats (Hybrid oder PQC) gegenüber Fahrzeugen und CA.

#v(10pt)

= Git-basiertes Deployment & Konfigurations-Architektur

== Repository-Struktur & Submodule-Architektur

Um Modularität und saubere Trennung zu gewährleisten, wird folgendes Setup empfohlen:

#block(breakable: false)[
```
project-root/
├── .gitmodules
├── ca-server/               # Git Submodule (CA-Logik & Configs)
│   ├── openssl-ca.cnf       # OpenSSL 3.4 / 3.5 PQC Provider Config
│   ├── scripts/             # Gen-Cert & Migration Skripte
│   └── public_certs/        # Publikation: pk_alt, pk_neu, Migrations-Cert
├── backend-server/          # Git Submodule (Backend-Logik)
│   ├── CAs/                 # Git Submodule / Folder: Trust Store (pk_alt, pk_neu)
│   ├── src/                 # Server-Code (OpenSSL 3.3 -> 3.5 Bindings)
│   └── certs/               # Backend Server-Zertifikate
└── docs/                    # Projektdokumentation
```
]

== Geheimhaltung & Security Boundaries

*Private Key Exclusion:* Das Git-Repository des CA-Servers darf unter keinen Umständen private Schlüssel ($"sk"_"alt"$, $"sk"_"neu"$) enthalten. Öffentliche Zertifikate dürfen dort liegen, weil sie ohnehin verteilt werden. Ein Clone des Repositories darf dagegen keine Signaturmacht enthalten. In .gitignore ist zwingend einzutragen:

```
*.key
*.pem.priv
private/
```

*Key Management:* Die Erzeugung von $"sk"_"alt"$ und $"sk"_"neu"$ erfolgt lokal auf dem CA-Server oder in einem gesicherten HSM/KMS außerhalb des Git-Deployment-Pfades.

== OpenSSL 3.3 / 3.4 / 3.5 Versionspfade & OQS-Integration

*OpenSSL 3.3 / 3.4:* Nutzung des oqsprovider (Open Quantum Safe Project) als dynamisches Modul (openssl.cnf), da native PQC-Algorithmen noch nicht vollständig im Core enthalten sind.

*OpenSSL 3.5:* Vorbereitung auf native/erweiterte PQC-Unterstützung (ML-DSA, ML-KEM gemäß NIST FIPS 203/204/205).

*Deployment Skripting:* Automatisierte deploy-Skripte bauen die Zertifikatsketten bei Änderungen im Git-Repo neu auf, ohne den Private Key zu überschreiben.

#v(10pt)

= Wissenschaftliche Forschungsfragen (Research Questions)

Im Rahmen des Projekts und der Begleitdokumentation sollen folgende Forschungsfragen wissenschaftlich untersucht und beantwortet werden:

*RQ1 (Migrations-Sicherheit):* Wie kann durch das Migrations-Zertifikat $"Sig"("pk"_"neu", "sk"_"alt") || "Sig"("pk"_"neu", "sk"_"neu")$ die Kontinuität der Vertrauenskette über einen unsicheren Kanal mathematisch und protokollarisch garantiert werden, ohne dass ein Man-in-the-Middle (MitM) Angriffe durchführen kann?

*RQ2 (OpenSSL-Kompatibilität):* Welche Kompatibilitätsunterschiede und Performance-Overheads entstehen beim Parsen und Verifizieren von Composite-/Hybrid-Zertifikaten beim Übergang von OpenSSL 3.3/3.4 (via oqsprovider) auf OpenSSL 3.5?

*RQ3 (Automotive-Latency & Resource Constraints):* Welche Auswirkungen haben die signifikant größeren PQC-Schlüssel und -Signaturen (z.B. ML-DSA-65) auf die TLS-Handshake-Latenz und die Speicherbegrenzungen von Steuergeräten (ECUs) im Fahrzeug-Backend-Kontext?

*RQ4 (GitOps-PKI-Security):* Wie lässt sich ein GitOps-basiertes Deployment für CA- und Backend-Infrastrukturen gestalten, das strikte Trennung von öffentlichen Artefakten und privaten Schlüsseln formal garantiert und automatisierte Compliance-Checks ermöglicht?

#pagebreak()

= Inkrementeller Sprint-Plan (Semesterverlauf)

Das Projekt folgt einem inkrementellen Vorgehen in 2 bis 3 Wochen Sprints.

#table(
  columns: (1fr, 1.8fr, 3fr),
  align: (center + horizon, left + horizon, left + horizon),
  stroke: 0.5pt + rgb("#cbd5e0"),
  fill: (col, row) => if row == 0 { rgb("#edf2f7") } else { none },
  table.header(
    [Sprint], [Fokus / Meilenstein], [Konkrete Aufgaben & Artefakte],
  ),
  [Sprint 1\ (W1-W3)], [Setup & Bestandsaufnahme], [
    - Git Repo & Submodule-Struktur aufsetzen
    - OpenSSL 3.3 (Backend) & OpenSSL 3.4 (CA) Environments einrichten
    - .gitignore-Regeln für Private Keys definieren
  ],
  [Sprint 2\ (W4-W6)], [Klassische CA & Backend TLS], [
    - Implementierung Use Case CA: Erzeugung $"pk"_"alt" \/ "sk"_"alt"$
    - Implementierung Use Case Backend: alive-Endpoint & Server-Zertifikat
    - TLS-Verbindung zwischen Backend und CA etablieren
  ],
  [Sprint 3\ (W7-W9)], [PQC & OpenSSL 3.5 Upgrade], [
    - Test-Upgrade der CA auf OpenSSL 3.5 (mit oqsprovider / ML-DSA)
    - Generierung des neuen PQC-Schlüsselpaars $"pk"_"neu" \/ "sk"_"neu"$
    - Evaluierung der RFC 9810 / RFC 10073 Standards
  ],
  [Sprint 4\ (W10-W12)], [Migrations-Zertifikat Implementierung], [
    - Erzeugung des Dual-Signature Certs: $"Sig"("pk"_"neu", "sk"_"alt") || "Sig"("pk"_"neu", "sk"_"neu")$
    - Prototypische Übertragung über den unsicheren Kanal
    - Verifikationslogik im Backend (OpenSSL 3.3 auf 3.5 Migration)
  ],
  [Sprint 5\ (W13-W14)], [Automotive Use Case Integration], [
    - Simulation des Fahrzeug-Knotens (ECU-Kommunikation)
    - Performance- & Latenz-Messungen der PQC-Handshakes (RQ3)
    - Validierung des End-to-End-TLS-Kanals (CA \<-> Backend \<-> ECU)
  ],
  [Sprint 6\ (W15-W16)], [Evaluation & Dokumentation], [
    - Auswertung der Forschungsfragen RQ1 -- RQ4
    - Finalisierung des Produkts und des Git-Repository-Code-Stands
    - Erstellung des Abschlussberichts
  ],
)

#pagebreak()

#heading(level: 1, numbering: none)[Quellen]

+ Brockhaus, H., von Oheimb, D., Ounsworth, M. und Gray, J. (29. Juli 2025). *Internet X.509 Public Key Infrastructure -- Certificate Management Protocol (CMP).* RFC 9810. #link("https://www.rfc-editor.org/rfc/rfc9810.html")

+ Pritikin, M., Yee, P. und Harkins, D. (Oktober 2013). *Enrollment over Secure Transport (EST).* RFC 7030. #link("https://www.rfc-editor.org/info/rfc7030/")

+ Ounsworth, M., Gray, J., Pala, M., Klaußner, J. und Fluhrer, S. (November 2026). *Composite ML-DSA for Use in X.509 Public Key Infrastructure.* RFC 10073. #link("https://www.rfc-editor.org/info/rfc10073/")

+ ITU-T Recommendation X.509 \| ISO/IEC 9594-8. *Information technology -- Open Systems Interconnection -- The Directory: Public-key and attribute certificate frameworks.* Alternative Public Key und Alternative Signature Extensions. Das im Text genannte Catalyst Framework ist dieser X.509-Mechanismus.

+ Alagic, G., Barker, E., Chen, L., Moody, D., Robinson, A., Silberg, H. und Waller, N. (September 2025). *Recommendations for Key-Encapsulation Mechanisms.* NIST Special Publication 800-227. #link("https://doi.org/10.6028/NIST.SP.800-227")

+ National Institute of Standards and Technology (13. August 2024). *Module-Lattice-Based Key-Encapsulation Mechanism Standard (ML-KEM).* FIPS 203. #link("https://doi.org/10.6028/NIST.FIPS.203")

+ National Institute of Standards and Technology (13. August 2024). *Module-Lattice-Based Digital Signature Standard (ML-DSA, Dilithium).* FIPS 204. #link("https://doi.org/10.6028/NIST.FIPS.204")

+ National Institute of Standards and Technology (13. August 2024). *Stateless Hash-Based Digital Signature Standard (SLH-DSA, SPHINCS+).* FIPS 205. #link("https://doi.org/10.6028/NIST.FIPS.205")

+ Falcon (FN-DSA). Im Text genannt. Ein FIPS auf dieser Basis ist bei NIST in Arbeit und noch nicht veröffentlicht. #link("https://csrc.nist.gov/projects/post-quantum-cryptography")

+ Open Quantum Safe Project. *oqs-provider* für OpenSSL 3.3 und 3.4. #link("https://github.com/open-quantum-safe/oqs-provider")

+ OpenSSL Project. OpenSSL 3.3, OpenSSL 3.4 und OpenSSL 3.5. #link("https://www.openssl.org/")

+ Bananenfalter (2012). *Orange blue public key infrastructure 1 de.* Wikimedia Commons, CC0. #link("https://commons.wikimedia.org/wiki/File:Orange_blue_public_key_infrastructure_1_de.svg")

+ Hydrargyrum (2016). *Cross-certification diagram.* Wikimedia Commons, gemeinfrei. #link("https://commons.wikimedia.org/wiki/File:Cross-certification_diagram.svg")

#v(15pt)

#align(center)[
  #text(size: 9pt, fill: luma(120))[--- Ende des Dokuments ---]
]
