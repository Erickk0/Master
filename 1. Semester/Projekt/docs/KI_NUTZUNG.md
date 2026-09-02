# CRYME — Dokumentation der KI-Nutzung

Diese Dokumentation beschreibt transparent, **wo und wie KI-Werkzeuge** im Masterprojekt CRYME eingesetzt wurden. Sie dient der qualifizierten Bewertung des Projekts durch Gutachter.

**Projekt:** CRYME — Cryptographic Migration Engineering  
**Autor:** Erick Zeiler  
**Stand:** September 2026

---

## 1. Verwendete KI-Werkzeuge

| Werkzeug | Anbieter | Einsatzbereich |
|----------|----------|----------------|
| **Cursor IDE** (Agent / Chat) | Cursor | Code, Shell-Skripte, Dokumentation, Debugging |
| **Claude / GPT** (via Cursor) | Anthropic / OpenAI | Code-Vorschläge, Erklärungen, Refactoring |
| **GitHub Copilot** (gelegentlich) | GitHub | Autocomplete in Editor |

Es wurden **keine** KI-Modelle trainiert und **keine** Projektdaten an Dritte zur Modellverbesserung übermittelt (Standard-Nutzungsbedingungen der genannten Tools).

---

## 2. Übersicht: Mensch vs. KI

| Bereich | Primär menschlich | KI-unterstützt |
|---------|-------------------|----------------|
| Forschungsfrage & Thesis-Konzept | ✓ | — |
| Domänenmodell (Akteure, Use Cases) | ✓ | Strukturierung, Formulierung |
| Oracle-Algorithmus (SCC, Validierung) | ✓ (Design) | Implementierungshilfe |
| Digital Twin YAML | ✓ | Syntax, Konsistenzprüfung |
| Ansible-Rolle `cryme_tls` | gemischt | Template-Generierung |
| CLI-Design (`cryme`) | ✓ | Boilerplate, Argument-Parsing |
| Docker/Ansible-Setup | gemischt | Skripte, Fehlerbehebung |
| Dokumentation (GUIDE, INSTALL, …) | ✓ (Inhalt) | Formulierung, Struktur |
| Demo-Skripte & Verify-Skripte | gemischt | Implementierung |
| Tests & manuelle Verifikation | ✓ | — |

**Grundsatz:** Architekturentscheidungen, Domänenlogik und wissenschaftliche Argumentation wurden vom Autor verantwortet. KI diente als **Werkzeug zur Umsetzung**, nicht als Ersatz für fachliches Verständnis.

---

## 3. Detaillierte Aufschlüsselung nach Projektbereich

### 3.1 Oracle-Engine (`web_app/oracle.js`)

| Aspekt | KI-Anteil |
|--------|-----------|
| SCC-Algorithmus (Tarjan) | KI half bei Implementierung; Algorithmuswahl und Einbindung menschlich |
| Event-Sourcing / Replay | Design menschlich; Code teilweise KI-generiert |
| Migrationsvalidierung | Regeln aus Domänenmodell menschlich definiert |
| Playbook-Generierung | KI bei String-Templates und Dateipfaden |

**Verifikation:** Jede Oracle-Regel wurde gegen die Demo-Szenarien (Schritte 0–4) manuell geprüft. Fehlverhalten (z. B. Schritt 1 Fail) ist **gewolltes Design**, kein KI-Fehler.

### 3.2 CLI (`cryme`)

- KI generierte CLI-Struktur, Hilfetexte und Spawn-Aufrufe für Ansible/Shell
- Befehlsdesign (`show state`, `show tree`, `migrate`, `deploy`, `verify`) menschlich
- Autor testete alle Befehle manuell auf dem Server und lokal

### 3.3 Deploy-Schicht (`deploy/`)

| Datei | KI-Anteil |
|-------|-----------|
| `docker-compose.yml` | KI bei Service-Definition; Ports/Security menschlich |
| `install_local.sh`, `install_prerequisites.sh` | KI-generiert, manuell getestet |
| `verify_tls.sh` | KI + manuelle Fehlerbehebung (z. B. expect.env-Bug) |
| `roles/cryme_tls/` | KI bei Jinja2-Templates; TLS-Profil-Logik menschlich definiert |

### 3.4 Dokumentation

Folgende Dokumente wurden **inhaltlich vom Autor vorgegeben** und mit KI-Unterstützung ausformuliert:

- `GUIDE.md`, `INSTALL.md`, `README.md`
- `docs/TECHNISCHE_DOKUMENTATION.md`
- `docs/MEMGRAPH_ANLEITUNG.md`
- `docs/KI_NUTZUNG.md` (dieses Dokument)
- `docs/CLI_GUIDE.md`, `docs/LIVE_DEMO_CHEAT_SHEET.md`

Der Autor hat alle Dokumente gelesen, fachlich geprüft und an die tatsächliche Codebasis angepasst.

### 3.5 Thesis / Exposé / Poster

- Wissenschaftliche Texte (Exposé, Poster, Thesis-PDFs in `assets/thesis/`) wurden **primär menschlich** verfasst
- KI ggf. für Formulierungsvorschläge, Rechtschreibung, Strukturfeedback
- Fachliche Aussagen, Methodik und Ergebnisse stammen vom Autor

---

## 4. Typische KI-Interaktionen (Beispiele)

### Beispiel 1: Verify-Skript erweitern

**Aufgabe:** `/api/status`-Check in `cryme verify` integrieren  
**KI:** Shell-Code für curl + JSON-Parsing vorgeschlagen  
**Mensch:** Anforderung definiert, Schwellwerte (`migration_step`) festgelegt, getestet

### Beispiel 2: Installationsanleitung

**Aufgabe:** Mac/Linux-Installation dokumentieren  
**KI:** Struktur und Markdown-Text generiert  
**Mensch:** Abhängigkeiten verifiziert, brew/apt-Befehle auf Korrektheit geprüft

### Beispiel 3: Bugfix expect.env

**Aufgabe:** `--tls-max: command not found` bei `cryme verify`  
**KI:** Ursache identifiziert (unquoted `source` in Bash)  
**Mensch:** Fix verifiziert, Template und Baseline-Dateien angepasst

---

## 5. Qualitätssicherung bei KI-generiertem Code

Der Autor wendete folgende Praktiken an:

1. **Manuelles Testen** aller CLI-Befehle und Demo-Schritte (0–4)
2. **Unabhängige Verifikation** mit `curl` und `openssl` (nicht nur CRYME-Ausgabe)
3. **Code-Review** — KI-Vorschläge wurden nicht blind übernommen
4. **Versionskontrolle (Git)** — alle Änderungen nachvollziehbar
5. **Externe Installation** — Feedback von Gutachtern (z. B. Herr Bodo) fließt in Bugfixes ein

---

## 6. Was KI **nicht** gemacht hat

- Keine eigenständige Architekturentscheidung ohne menschliche Freigabe
- Keine Ausführung von Experimenten oder Messungen
- Keine Bewertung der wissenschaftlichen Tragfähigkeit der Thesis-These
- Kein Training eigener Modelle auf Projektdaten
- Keine Erstellung der Thesis-Gutachten oder Prüfungsleistungen

---

## 7. Transparenz gegenüber Gutachtern

Bei Fragen zu einzelnen Code-Stellen kann der Autor angeben, ob der Abschnitt:

- **A** — vollständig selbst geschrieben
- **B** — KI-vorgeschlagen, menschlich angepasst
- **C** — überwiegend KI-generiert, menschlich verifiziert

Auf Anfrage kann der Autor für kritische Module (insb. `oracle.js`) eine grobe Einschätzung der Kategorien A/B/C geben.

---

## 8. Empfehlung für Gutachter

Zum Verständnis des Projekts empfehlen sich diese Dokumente in dieser Reihenfolge:

1. [GUIDE.md](../GUIDE.md) — Gesamtüberblick
2. [TECHNISCHE_DOKUMENTATION.md](TECHNISCHE_DOKUMENTATION.md) — Code-Architektur
3. [MEMGRAPH_ANLEITUNG.md](MEMGRAPH_ANLEITUNG.md) — Graph-Datenbank + Beispielqueries
4. [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) — 5-Minuten-Demo

---

## 9. Kontakt

Bei Rückfragen zur KI-Nutzung oder einzelnen Code-Stellen:

**Erick Zeiler** · Masterprojekt CRYME · Hochschule RheinMain
