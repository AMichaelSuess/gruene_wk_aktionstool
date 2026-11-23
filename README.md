# Aktionskoordination

Web-App zur Koordination von Wahlkampf-Aktionen für Kreisverbände von BÜNDNIS 90/DIE GRÜNEN. Freiwillige finden Aktionen auf einer öffentlichen Seite mit Karte und melden sich ohne Konto an. Expert\*innen planen Aktionen ihrer Teams im internen Bereich, Admins verwalten Teams, Benutzer\*innen und Wahlkreise.

> **Fork von [maassfm/gruene_wk_aktionstool](https://github.com/maassfm/gruene_wk_aktionstool)**, dem Aktionstool von BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte. Der Fork wird unter anderem für die OBM-Wahl Leipzig 2027 eingesetzt. Allgemeine Fehlerbehebungen und Funktionen werden als Pull Request an das Original zurückgegeben.

## Funktionen

- **Öffentliche Aktionsübersicht** mit Karte, Filtern (Wahlkreis, Datum, Tageszeit) und Sammelanmeldung für mehrere Aktionen
- **Anmeldung ohne Konto**, DSGVO-konform, mit Honeypot und Rate-Limiting; Abmeldung über den Link in der Bestätigungs-E-Mail
- **„Meine Aktionen“**: Freiwillige lassen sich ihre Anmeldungen per E-Mail schicken
- **Interner Bereich** für Expert*innen und Admins: Aktionen anlegen, ändern, absagen, filtern und exportieren (Excel, Signal-Text)
- **Excel-Import** mit Vorlage, Vorschau, Validierung und Geocoding
- **Teams und Wahlkreise**: Eine Aktion kann mehreren Teams gehören (z. B. Themen- und Ortsteam); Expert*innen sehen Aktionen, Anmeldungen und Statistik ihrer Teams
- **E-Mails** an Freiwillige (Bestätigung, Änderung, Absage, Erinnerung am Vorabend) und eine tägliche Übersicht an Ansprechpersonen
- **Datensparsamkeit**: Anmeldedaten werden 72 Stunden nach der Aktion gelöscht, Statistik bleibt anonym erhalten
- **Iframe-Einbettung** einzelner Anmeldeformulare auf der Website des Kreisverbands

## Unterschiede zum Original

**Funktionen**
- Aktionen können mehreren Teams gehören; Admins können Aktionen jedem oder keinem Team zuordnen
- Eine gemeinsame Aktionsliste mit Filtern (werden gemerkt), Export und Löschen; Absagen (mit E-Mail an die Angemeldeten) ist vom Löschen getrennt
- Expert*innen sehen Statistik und Mitglieder ihrer Teams; alle können Name und Passwort selbst ändern
- Kategorien „Flyern“, „Infostand“ und „Plakatieren“ statt „Straße“
- E-Mails mit Textteil und antippbaren Telefonnummern
- Bestätigungsdialoge vor dem Löschen, Rückmeldungen als Toasts

**Anpassbar ohne Code-Änderung**
- Zwei Themes per `NEXT_PUBLIC_THEME`: `brutalist` (Grüne CI, Standard) und `emerald` (Leipziger OBM-Kampagne)
- Bezeichnung der Gebiete („Stadtbezirk“ statt „Wahlkreis“), Gebiete ohne Nummern, Kartenausschnitt, Geocoding-Stadt
- Kontaktformular der Datenschutzbeauftragten statt E-Mail und Telefon

**Sicherheit und Datenschutz** – drei Sicherheitsprüfungen im November 2026 ([Berichte](docs/assessments/security/)), die Befunde sind behoben:
- Login-Sperre nach Fehlversuchen, Rate-Limits und Größengrenzen für alle öffentlichen Endpunkte
- Prüfung der Herkunft bei ändernden API-Anfragen, HSTS, strengere Content-Security-Policy
- Passwörter mit mindestens 12 Zeichen; eine Passwortänderung beendet alle Sitzungen
- Öffentliche Aktionsdaten ohne Kontaktdaten der Ansprechpersonen; Team-Trennung für Expert*innen verschärft
- Das Anmeldeformular verrät nicht, ob eine Adresse schon angemeldet ist; Abmelden erfordert einen Klick
- Audit-Log für Exporte, Kontoänderungen, Löschungen und fehlgeschlagene Logins; E-Mail-Logs werden nach 7 Tagen gelöscht

**Betrieb und Qualität**
- Docker-Image für [Coolify](docs/deployment/coolify-deployment.md) mit Health-Endpunkt
- Bootstrap-Skript für neue Produktionsdatenbanken (statt Seed mit Demo-Konten)
- Pflichtkonfiguration wird beim Start geprüft
- Playwright-End-to-End-Tests zusätzlich zu den Vitest-Tests; die Tests laufen im Docker-Build
- REST-artige API-Pfade auf Englisch (`/api/actions`, `/api/signups`, …), aktuelle Abhängigkeiten, Dependabot

## Für andere Kreisverbände

Name, Adressen, Datenschutzangaben, Wahlkreise, Kartenausschnitt und Theme werden über Umgebungsvariablen gesetzt – der Code bleibt unverändert. Ohne Angaben gelten die Werte von Berlin-Mitte.

- Alle Variablen: [docs/configuration.md](docs/configuration.md) und [`.env.example`](.env.example)
- Deployment: [docs/deployment/coolify-deployment.md](docs/deployment/coolify-deployment.md) (enthält eine vollständige Beispielkonfiguration für Leipzig)

## Lokale Entwicklung

Voraussetzungen: Node.js 24 (siehe `.nvmrc`) und PostgreSQL.

```bash
nvm use
npm install
cp .env.example .env          # DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL anpassen
npx prisma migrate dev        # Datenbank anlegen
npx prisma db seed            # Testdaten und Testkonten einspielen
npm run dev -- -p 3200        # http://localhost:3200 (muss zu NEXTAUTH_URL passen)
```

Ohne `SMTP_USER`/`SMTP_PASSWORD` werden keine E-Mails verschickt.

| Rolle  | E-Mail                 | Passwort   |
|--------|------------------------|------------|
| Admin  | admin@gruene-mitte.de  | admin1234  |
| Expert | expert@gruene-mitte.de | expert1234 |

Diese Testkonten legt nur der Seed an. **Den Seed nie auf einer Produktionsdatenbank ausführen** – dafür gibt es `npm run db:bootstrap`.

Weitere Befehle:

```bash
npm test                      # Vitest
npm run e2e                   # Playwright (eigene Datenbank, Port 3300)
npm run lint
npx prisma migrate reset      # Datenbank zurücksetzen und neu befüllen
npx prisma studio             # Datenbank-Browser
```

## Dokumentation

- [Umgebungsvariablen](docs/configuration.md)
- [Deployment auf Coolify](docs/deployment/coolify-deployment.md)
- [Iframe-Einbettung](docs/embedding.md)
- [Theming](docs/design/theming.md) mit den Themes [brutalist](docs/design/theme-brutalist.md) und [emerald](docs/design/theme-emerald.md)
- [Anleitung für Wahlkampf-Expert*innen](docs/anleitung-wahlkampfexperten.md)
- [Sicherheitsprüfungen](docs/assessments/security/)
- [Architektur und Konventionen für Entwickler*innen](CLAUDE.md)

## Lizenz und Herkunft

Ursprünglich entwickelt von Florian Maaß für BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte ([maassfm/gruene_wk_aktionstool](https://github.com/maassfm/gruene_wk_aktionstool)). Dieser Fork wird von Michael Süß weiterentwickelt.

Lizenziert unter der European Union Public Licence v. 1.2 (EUPL-1.2), siehe [LICENSE](LICENSE) und https://eupl.eu/1.2/de/.
