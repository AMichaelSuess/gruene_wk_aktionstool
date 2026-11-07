# Deployment auf Coolify

Diese Anleitung beschreibt die **Ersteinrichtung** der Aktionskoordination auf einer bestehenden
Coolify-Instanz sowie den laufenden Betrieb (Updates, Rollback, Fehlersuche).

Server-Einrichtung, Reverse-Proxy (Traefik), Firewall und die S3-Ablage für Datenbank-Backups
werden hier vorausgesetzt – sie sind Teil der Coolify-Instanz, nicht dieser App.

> Die ältere Anleitung [DEPLOYMENT.md](../DEPLOYMENT.md) beschreibt eine Installation mit
> systemd und Nginx direkt auf einem Server. Für Coolify gilt ausschließlich dieses Dokument.

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Projekt und Datenbank anlegen](#2-projekt-und-datenbank-anlegen)
3. [Secrets erzeugen](#3-secrets-erzeugen)
4. [Anwendung anlegen](#4-anwendung-anlegen)
5. [Umgebungsvariablen](#5-umgebungsvariablen)
6. [Erstes Deployment](#6-erstes-deployment)
7. [Grundeinrichtung (Bootstrap)](#7-grundeinrichtung-bootstrap)
8. [Scheduled Tasks (Cron-Jobs)](#8-scheduled-tasks-cron-jobs)
9. [Abschluss-Checkliste](#9-abschluss-checkliste)
10. [Updates deployen](#10-updates-deployen)
11. [Rollback](#11-rollback)
12. [Datenbankzugriff und Backups](#12-datenbankzugriff-und-backups)
13. [Fehlersuche](#13-fehlersuche)

---

## 1. Überblick

| Eigenschaft | Wert |
|---|---|
| **Umgebung** | Nur Production (eine Staging-Umgebung kann später ergänzt werden) |
| **Branch** | `production` (existiert bereits im Repository) – Coolify deployt automatisch bei jedem Push auf diesen Branch |
| **Entwicklung** | auf `main`; ein Push auf `main` löst **kein** Deployment aus |
| **Build** | `Dockerfile` im Repository-Root (Node.js 24, Debian slim) |
| **Datenbank** | PostgreSQL 17 als Coolify-Ressource, tägliches Backup nach S3 |
| **Netzwerk** | eigene Destination `gruene-aktionstool-production` (Docker-Netzwerk `gruene-aktionstool-production-network`) |
| **Migrationen** | laufen automatisch beim Containerstart (`prisma migrate deploy`) |
| **Health-Check** | `GET /api/health` (prüft auch die Datenbankverbindung) |
| **Cron-Jobs** | Coolify Scheduled Tasks, die die Cron-Endpunkte im Container aufrufen |
| **SSL** | Let's Encrypt, automatisch über Coolify/Traefik |

### Was der Container macht

1. **Build-Stage:** `npm ci`, `npm test` (ein fehlschlagender Test bricht den Build ab),
   `npm run build`, Bündeln des Bootstrap-Scripts nach `dist/bootstrap.js`.
2. **Laufzeit-Stage:** nur Produktions-Abhängigkeiten, läuft als Benutzer `node`.
3. **Start:** `prisma migrate deploy`, danach `next start` auf Port 3000. Schlägt eine Migration
   fehl, startet die App nicht – Coolify lässt dann den bisherigen Container weiterlaufen.

Der Container läuft bewusst in der Zeitzone **UTC** (Node-Default). Aktionsdaten liegen als
UTC-Mitternacht in der Datenbank, und mehrere Routen rechnen mit der lokalen Zeit des Servers.
`TZ` daher **nicht** setzen.

---

## 2. Projekt und Datenbank anlegen

### Eigenes Docker-Netzwerk (Destination)

Ohne weitere Einstellung landen alle Ressourcen einer Coolify-Instanz im gemeinsamen Netzwerk
`coolify` – Container anderer Projekte auf demselben Server könnten dann die Datenbank dieser App
direkt erreichen. Eine eigene **Destination** trennt App und Datenbank davon ab. Den Reverse-Proxy
verbindet Coolify automatisch mit dem neuen Netzwerk; Domains und SSL funktionieren unverändert.

1. Coolify → **Servers** → Server auswählen → **Destinations** → **Add**
2. Konfiguration:
   - **Name:** `gruene-aktionstool-production`
   - **Network:** `gruene-aktionstool-production-network`
3. Speichern.

> ⚠️ Datenbank **und** Anwendung müssen in **dieser** Destination angelegt werden. Coolify fragt
> beim Anlegen einer Ressource danach, sobald ein Server mehrere Destinations hat. Liegen beide in
> verschiedenen Netzwerken, erreicht die App die Datenbank nicht über die interne URL. Eine
> nachträglich falsch zugeordnete Ressource lässt sich nur umziehen, nicht umhängen – daher von
> Anfang an richtig auswählen.

### Projekt

1. Coolify → **Projects** → **New Project**
2. **Name:** `Aktionskoordination`
3. **Description:** `Wahlkampf-Aktionskoordination (Production)`

### PostgreSQL-Datenbank

1. Im Projekt: **New Resource** → **Database** → **PostgreSQL 17**, als Destination
   `gruene-aktionstool-production` wählen
2. Konfiguration:
   - **Name:** `aktionskoordination-db`
   - **Database Name:** `gruene_aktionen`
   - **Username / Password:** automatisch erzeugen lassen
3. **Scheduled Backups** aktivieren:
   - **Frequency:** `0 2 * * *` (täglich 02:00 UTC)
   - **S3:** den auf der Instanz bereits eingerichteten S3-Speicher auswählen
4. **Netzwerk-Einstellungen:**
   - **SSL:** `Disabled` – App und Datenbank sprechen nur innerhalb des eigenen Docker-Netzwerks
     auf demselben Server miteinander.
   - **Access:** `Private` ⚠️ – `Public` würde die Datenbank über den Coolify-Proxy aus dem
     Internet erreichbar machen. Public port und Proxy timeout spielen dann keine Rolle.
   - **Port mappings:** `127.0.0.1:<PORT>:5432` für den Zugriff per SSH-Tunnel (siehe
     [Abschnitt 12](#12-datenbankzugriff-und-backups)). Einen freien Port wählen
     (`sudo ss -ltnp | grep -E ':54[0-9]{2}'` zeigt belegte). Das Präfix `127.0.0.1` ist
     entscheidend: Ohne es öffnet Docker den Port auf allen Interfaces – an der Firewall (ufw)
     vorbei.
5. **Start** klicken.
6. Die **interne Postgres-URL** (Abschnitt „Internal URL“, beginnt mit `postgres://`) notieren –
   sie wird zu `DATABASE_URL`.

---

## 3. Secrets erzeugen

Lokal ausführen und die Werte in Bitwarden (oder einem anderen Passwortmanager) ablegen:

```bash
# NEXTAUTH_SECRET – signiert die Login-Sessions (min. 32 Zeichen)
openssl rand -base64 32

# CRON_SECRET – schützt die Cron-Endpunkte
openssl rand -hex 32

# BOOTSTRAP_ADMIN_PASSWORD – Passwort des ersten Admin-Accounts (min. 12 Zeichen)
openssl rand -base64 18
```

> **Achtung:** Wird `NEXTAUTH_SECRET` später geändert, werden alle Benutzer*innen abgemeldet.

---

## 4. Anwendung anlegen

1. Im Projekt: **New Resource** → **Application**, als Destination
   `gruene-aktionstool-production` wählen (dieselbe wie die Datenbank)
2. **Typ:** **Git Repository (with GitHub App)** – nur damit richtet Coolify den Webhook für
   automatische Deployments ein. (Nicht die Kachel „Dockerfile“: Die ist für ein in Coolify
   eingefügtes Dockerfile ohne Git; das Dockerfile-Build-Pack wird in Schritt 3 gewählt.)
   - **Source:** die GitHub App der Instanz → Repository `gruene_wk_aktionstool` (der eigene Fork)
   - Taucht das Repository nicht auf, hat die GitHub App keinen Zugriff darauf. Auf GitHub unter
     **Settings** → **Applications** → **Installed GitHub Apps** → Coolify-App → **Configure** →
     **Repository access** das Repository hinzufügen.
3. Konfiguration:
   - **Branch:** `production` ⚠️ nicht `main`
   - **Build Pack:** `Dockerfile`
   - **Base Directory:** `/`
   - **Dockerfile Location:** `/Dockerfile`
   - **Ports Exposes:** `3000`
   - **Auto Deploy:** ✅ aktiviert (deployt bei jedem Push auf `production`)
   - **Watch Paths:** leer lassen. Auf `production` wird nur bewusst per Release gepusht, und
     jedes Release soll deployen. Eine Pfadliste müsste alle build-relevanten Dateien im Root
     enthalten (`package-lock.json`, `next.config.ts`, …) – eine später hinzugekommene, aber
     vergessene Datei würde dann still kein Deployment auslösen.
4. **Domains:** `https://<DOMAIN>` (z. B. `https://aktionen.<kreisverband>.de`)
   - Der DNS-A-Record (und ggf. AAAA-Record) muss auf den Coolify-Server zeigen,
     sonst kann Let's Encrypt kein Zertifikat ausstellen.

### Health-Check

Unter **Health Checks**:

| Einstellung | Wert |
|---|---|
| Enabled | ✅ |
| Path | `/api/health` |
| Port | `3000` |
| Interval | `30s` |
| Timeout | `5s` |
| Retries | `3` |
| Start Period | `60s` |

Das Dockerfile enthält bewusst keine `HEALTHCHECK`-Anweisung – der Health-Check ist nur hier
definiert. Ist er deaktiviert, schaltet Coolify bei einem Deployment auch auf einen Container
um, der nicht funktioniert.

`/api/health` antwortet mit `200 {"status":"ok"}`, wenn die App läuft und die Datenbank
erreichbar ist, sonst mit `503 {"status":"error"}`.

---

## 5. Umgebungsvariablen

Unter **Environment Variables**. Über **Developer view** können alle Variablen auf einmal im
`.env`-Format eingefügt werden. Werte dort **ohne** umschließende Anführungszeichen eintragen –
und nach dem ersten Deployment auf der Datenschutzseite prüfen, ob Sonderzeichen und Umlaute
korrekt ankommen.

Jede Variable hat in Coolify zwei Schalter:

- **Available at Buildtime** – der Wert steht beim `docker build` zur Verfügung
- **Available at Runtime** – der Wert steht dem laufenden Container zur Verfügung

Die Tabellen unten geben an, welche Schalter gesetzt sein müssen.

### 5.1 Secrets – nur Runtime

⚠️ Bei diesen Variablen **„Available at Buildtime“ abwählen**. Build-Argumente landen in den
Metadaten des Images; Secrets haben dort nichts zu suchen.

| Variable | Wert |
|---|---|
| `DATABASE_URL` | interne Postgres-URL aus [Abschnitt 2](#postgresql-datenbank) |
| `NEXTAUTH_SECRET` | aus [Abschnitt 3](#3-secrets-erzeugen) |
| `CRON_SECRET` | aus [Abschnitt 3](#3-secrets-erzeugen) |
| `SMTP_PASSWORD` | Passwort des SMTP-Postfachs |
| `BOOTSTRAP_ADMIN_PASSWORD` | nur für die Grundeinrichtung, danach löschen ([Abschnitt 7](#7-grundeinrichtung-bootstrap)) |

### 5.2 Pflichtwerte – Runtime

| Variable | Beispiel | Hinweis |
|---|---|---|
| `NEXTAUTH_URL` | `https://<DOMAIN>` | **Muss gesetzt sein.** Basis für alle Links in E-Mails (Abmelde-Links!). Fehlt der Wert, zeigen die Links auf die Berlin-Mitte-Domain. |
| `AUTH_TRUST_HOST` | `true` | nötig hinter dem Reverse-Proxy |
| `SMTP_HOST` | `smtp.example.org` | leer = es werden keine E-Mails versendet |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` nur bei Port 465 |
| `SMTP_USER` | `aktionen@<DOMAIN>` | |
| `EMAIL_FROM` | `aktionen@<DOMAIN>` | muss zum SMTP-Konto passen |
| `EMAIL_FROM_NAME` | `BÜNDNIS 90/DIE GRÜNEN Leipzig` | |
| `BOOTSTRAP_ADMIN_EMAIL` | `vorname.nachname@example.org` | nur für die Grundeinrichtung |
| `BOOTSTRAP_ADMIN_NAME` | `Vorname Nachname` | optional, Default `Admin` |

### 5.3 Build-Variablen – Buildtime **und** Runtime

Diese Werte werden beim Build fest in die Anwendung eingebaut. **Nach einer Änderung ist ein
Redeploy nötig** (Neubau des Images) – ein Restart reicht nicht.

| Variable | Beispiel | Wirkung |
|---|---|---|
| `NEXT_PUBLIC_ORG_SHORT_NAME` | `B90/GRÜNE Leipzig` | Kurzname in Kopfzeilen, Login, Seitentitel |
| `ORG_FULL_NAME` | `BÜNDNIS 90/DIE GRÜNEN Leipzig` | Meta-Beschreibung (statisch gerenderte Seiten) und Texte |
| `NEXT_PUBLIC_MAP_CENTER` | `51.3397,12.3731` | Startansicht der Karte (Breitengrad,Längengrad) |
| `NEXT_PUBLIC_MAP_ZOOM` | `12` | Zoomstufe der Startansicht |
| `NEXT_PUBLIC_WAHLKREIS_LABEL` | `Stadtbezirk` | Bezeichnung der Gebietseinheit (Default „Wahlkreis“; hier „Stadtbezirk“) |
| `NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL` | `Stadtbezirke` | |
| `NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT` | `Stadtbezirk` | |
| `NEXT_PUBLIC_THEME` | `emerald` | Visuelles Theme: `brutalist` (Default) oder `emerald` (Design der OBM-Kampagne 2027) – Farben, Schrift, Formen, Logo/Wortmarke, Karten-Marker und E-Mails |
| `ALLOWED_EMBED_DOMAIN` | `https://www.<kreisverband>.de` | Domain, die das Anmeldeformular per `<iframe>` einbinden darf; leer = keine Einbindung |

Das Dockerfile reicht genau diese Variablen in den Build durch. Kommt eine neue
`NEXT_PUBLIC_*`-Variable hinzu, muss sie auch dort als `ARG` ergänzt werden.

### 5.4 Kreisverbands-Konfiguration – Runtime

Steuert Datenschutzerklärung, Impressum, E-Mail-Texte und Geocoding. Diese Werte werden zur
Laufzeit gelesen; nach einer Änderung genügt ein **Restart**.

> ⚠️ **Alle Werte sind optional und fallen auf Berlin-Mitte zurück.** Eine fehlende Variable
> führt also nicht zu einem Fehler, sondern zu **falschen Angaben** – etwa dem Berliner
> Datenschutzbeauftragten in der Datenschutzerklärung. Daher alle Variablen setzen und nach dem
> Deployment Datenschutz und Impressum im Browser prüfen.

| Variable(n) | Inhalt |
|---|---|
| `ORG_LEGAL_NAME`, `ORG_RESPONSIBLE`, `ORG_SUBTITLE` | rechtlicher Name, verantwortliche Stelle, Untertitel |
| `ORG_TEAM_NAMES` | Unterschrift der E-Mails an Freiwillige |
| `CONTACT_EMAIL`, `WEBSITE_URL`, `IMPRESSUM_URL` | Kontakt und Website des Kreisverbands |
| `ADDRESS_STREET`, `ADDRESS_POSTAL_CODE`, `ADDRESS_CITY` | Anschrift der Geschäftsstelle |
| `GEOCODING_CITY` | Stadt, die beim Geocoding an Adressen angehängt wird (Default `ADDRESS_CITY`) |
| `DSB_NAME`, `DSB_STREET`, `DSB_POSTAL_CODE`, `DSB_CITY`, `DSB_EMAIL`, `DSB_PHONE` | Datenschutzbeauftragte*r |
| `DSB_CONTACT_URL` | Kontaktformular der*des Datenschutzbeauftragten (optional). Ist es gesetzt, dürfen `DSB_EMAIL` und `DSB_PHONE` fehlen – sie werden dann nicht angezeigt statt auf Berlin zurückzufallen. |
| `AUFSICHT_NAME`, `AUFSICHT_STREET`, `AUFSICHT_POSTAL_CODE`, `AUFSICHT_CITY`, `AUFSICHT_PHONE`, `AUFSICHT_EMAIL`, `AUFSICHT_URL` | zuständige Datenschutz-Aufsichtsbehörde (je Bundesland verschieden) |
| `HOSTING_PROVIDER`, `HOSTING_ADDRESS`, `HOSTING_LOCATION`, `HOSTING_PRIVACY_URL` | Auftragsverarbeiter Hosting – hier der Anbieter des Coolify-Servers, nicht der Default Hetzner |
| `EMAIL_PROVIDER`, `EMAIL_PROVIDER_PRIVACY_URL` | Auftragsverarbeiter E-Mail |
| `DATENSCHUTZ_STAND` | Stand der Datenschutzerklärung, z. B. `Oktober 2026` |
| `ACCOUNT_DELETION_DATE` | Datum, bis zu dem Nutzerkonten nach dem Wahlkampf gelöscht werden |
| `WAHLKREISE_JSON` | Wahlkreise bzw. Stadtbezirke als JSON-Array, z. B. `[{"nummer":1,"name":"Mitte"},{"nummer":2,"name":"Nordost"}]` – siehe Hinweis unten |

> ⚠️ **`WAHLKREISE_JSON` wird an zwei Stellen gelesen:** von der Grundeinrichtung
> ([Abschnitt 7](#7-grundeinrichtung-bootstrap)), die daraus Stadtbezirke und Teams anlegt, und
> **zur Laufzeit** vom Excel-Import, der die Nummer in der Spalte „Stadtbezirk“ gegen die Anzahl
> der Einträge prüft. Fehlt die Variable, gelten die 7 Berliner Wahlkreise – Importe für die
> Stadtbezirke 8–10 würden dann abgelehnt. Die Variable also dauerhaft gesetzt lassen.

Beispielwerte und Defaults stehen in [`.env.example`](../../.env.example), die konkreten Werte
für Leipzig in [Abschnitt 5.5](#55-konfiguration-ob-wahl-leipzig-2027).

### Nicht setzen

| Variable | Grund |
|---|---|
| `NODE_ENV` | ist im Dockerfile auf `production` gesetzt; beim Build würde `production` die devDependencies (Tests, TypeScript) weglassen |
| `PORT` | ist im Dockerfile auf `3000` gesetzt |
| `TZ` | Container muss in UTC laufen (siehe [Abschnitt 1](#was-der-container-macht)) |

### 5.5 Konfiguration OB-Wahl Leipzig 2027

Die vollständige Konfiguration zum Einfügen über **Developer view**. Grundlage ist die lokale
Entwicklungsumgebung; abweichend sind nur Domain, SMTP und die Secrets.

Bei der OB-Wahl gibt es keine Wahlkreise. Die App verwendet stattdessen die **10 Leipziger
Stadtbezirke** (Nummern 1–10) und bezeichnet sie in der Oberfläche durchgängig als
„Stadtbezirk“. Intern heißen Variablen und Datenbanktabellen weiterhin `WAHLKREIS…`.

```env
# ── Secrets: nur Runtime, "Available at Buildtime" abwählen ──
DATABASE_URL=<interne Postgres-URL aus Coolify>
NEXTAUTH_SECRET=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -hex 32>
SMTP_PASSWORD=<SMTP-Passwort>
BOOTSTRAP_ADMIN_PASSWORD=<openssl rand -base64 18, nach der Grundeinrichtung löschen>

# ── Pflichtwerte ──
NEXTAUTH_URL=https://aktionen.gruene-leipzig.de
AUTH_TRUST_HOST=true
SMTP_HOST=<SMTP-Server>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=aktionen@gruene-leipzig.de
EMAIL_FROM=aktionen@gruene-leipzig.de
EMAIL_FROM_NAME=BÜNDNIS 90/DIE GRÜNEN Leipzig
BOOTSTRAP_ADMIN_EMAIL=<E-Mail des ersten Admins>
BOOTSTRAP_ADMIN_NAME=<Vorname Nachname>

# ── Build-Variablen: Buildtime UND Runtime ──
NEXT_PUBLIC_ORG_SHORT_NAME=B90/GRÜNE Leipzig
ORG_FULL_NAME=BÜNDNIS 90/DIE GRÜNEN Leipzig
NEXT_PUBLIC_MAP_CENTER=51.3397,12.3731
NEXT_PUBLIC_MAP_ZOOM=12
NEXT_PUBLIC_WAHLKREIS_LABEL=Stadtbezirk
NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL=Stadtbezirke
NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT=Stadtbezirk
NEXT_PUBLIC_THEME=emerald
# ALLOWED_EMBED_DOMAIN=https://gruene-leipzig.de   (nur falls Formulare eingebettet werden)

# ── Kreisverbands-Konfiguration: Runtime ──
ORG_LEGAL_NAME=BÜNDNIS 90/DIE GRÜNEN Kreisverband Leipzig
ORG_RESPONSIBLE=Kreisvorstand BÜNDNIS 90/DIE GRÜNEN Leipzig
ORG_SUBTITLE=Wahlkampfteam
ORG_TEAM_NAMES=Euer Wahlkampfteam
CONTACT_EMAIL=info@gruene-leipzig.de
WEBSITE_URL=gruene-leipzig.de
IMPRESSUM_URL=https://gruene-leipzig.de/impressum/
ADDRESS_STREET=Hohe Straße 58
ADDRESS_POSTAL_CODE=04107
ADDRESS_CITY=Leipzig
DSB_NAME=Vetter Consulting
DSB_STREET=Oschatzer Str. 46
DSB_POSTAL_CODE=01127
DSB_CITY=Dresden
DSB_CONTACT_URL=https://gruene-sachsen.de/datenschutz/anfrage-zum-datenschutz/
AUFSICHT_NAME=Sächsische Datenschutz- und Transparenzbeauftragte
AUFSICHT_STREET=Maternistraße 17
AUFSICHT_POSTAL_CODE=01067
AUFSICHT_CITY=Dresden
AUFSICHT_PHONE=+49 351 85471-101
AUFSICHT_EMAIL=post@sdtb.sachsen.de
AUFSICHT_URL=https://www.datenschutz.sachsen.de
HOSTING_PROVIDER=netcup GmbH
HOSTING_ADDRESS=Emmy-Noether-Straße 10, 76131 Karlsruhe
HOSTING_LOCATION=Deutschland
HOSTING_PRIVACY_URL=https://www.netcup.com/de/kontakt/datenschutzerklaerung
EMAIL_PROVIDER=Verdigado eG
EMAIL_PROVIDER_PRIVACY_URL=https://www.verdigado.com/datenschutz
DATENSCHUTZ_STAND=Oktober 2026
ACCOUNT_DELETION_DATE=30. April 2027
WAHLKREISE_JSON=[{"nummer":1,"name":"Mitte"},{"nummer":2,"name":"Nordost"},{"nummer":3,"name":"Ost"},{"nummer":4,"name":"Südost"},{"nummer":5,"name":"Süd"},{"nummer":6,"name":"Südwest"},{"nummer":7,"name":"West"},{"nummer":8,"name":"Alt-West"},{"nummer":9,"name":"Nordwest"},{"nummer":10,"name":"Nord"}]
```

`GEOCODING_CITY` ist nicht gesetzt und fällt damit auf `ADDRESS_CITY` (Leipzig) zurück.

---

## 6. Erstes Deployment

Voraussetzung: `production` enthält den aktuellen Stand von `main` mit dem `Dockerfile` –
sonst zuerst ein Release wie in [Abschnitt 10](#10-updates-deployen) durchführen.

1. In der Anwendung auf **Deploy** klicken (ab jetzt geschieht das automatisch bei jedem Push
   auf `production`).
2. Build-Log verfolgen. Der Build dauert einige Minuten; `npm test` und `npm run build` müssen
   ohne Fehler durchlaufen.
3. Im Container-Log (**Logs**) muss nach dem Start erscheinen:

   ```
   All migrations have been successfully applied.
   ...
   ✓ Ready in ...
   ```

4. Health-Check prüfen:

   ```bash
   curl https://<DOMAIN>/api/health
   # {"status":"ok"}
   ```

Die Datenbank enthält jetzt alle Tabellen, aber noch keine Wahlkreise und keinen Account.

---

## 7. Grundeinrichtung (Bootstrap)

Das Bootstrap-Script legt an:

- die Stadtbezirke aus `WAHLKREISE_JSON`,
- **je Stadtbezirk ein Team** mit dem Namen „Team <Stadtbezirk>“ (z. B. „Team Alt-West“),
- einen Admin-Account aus `BOOTSTRAP_ADMIN_*`.

Es legt **keine** Demo-Daten an.

> ⚠️ **In Production niemals `prisma db seed` ausführen.** Der Seed legt Demo-Accounts mit
> bekannten Passwörtern (`admin1234`, `expert1234`) und Demo-Aktionen an.

1. Prüfen, dass `WAHLKREISE_JSON`, `BOOTSTRAP_ADMIN_EMAIL` und `BOOTSTRAP_ADMIN_PASSWORD`
   gesetzt sind und der Container nach dem Setzen neu gestartet wurde.
2. In der Anwendung: **Terminal** → Container auswählen → ausführen:

   ```bash
   node dist/bootstrap.js
   ```

   Erwartete Ausgabe:

   ```
   Wahlkreis 1: Mitte
     Team angelegt: Team Mitte
   Wahlkreis 2: Nordost
     Team angelegt: Team Nordost
   ...
   Wahlkreis 10: Nord
     Team angelegt: Team Nord
   Admin-Account vorname.nachname@example.org angelegt
   ```

3. **`BOOTSTRAP_ADMIN_PASSWORD` in Coolify löschen** (und optional die anderen
   `BOOTSTRAP_ADMIN_*`-Variablen), dann Restart. `WAHLKREISE_JSON` bleibt gesetzt.
4. Unter `https://<DOMAIN>/login` mit dem Admin-Account anmelden.
5. Unter **Admin** → **Benutzer*innen** die Accounts der Teamleitungen anlegen und dem Team ihres
   Stadtbezirks zuordnen.

Das Script kann gefahrlos erneut ausgeführt werden:

- Stadtbezirke werden anhand ihrer Nummer aktualisiert (geänderte Namen werden übernommen).
  Stadtbezirke, die nicht mehr in `WAHLKREISE_JSON` stehen, bleiben bestehen – das Script gibt
  dazu eine Warnung aus.
- Ein Team wird nur für Stadtbezirke angelegt, denen noch kein Team zugeordnet ist. Im Admin-Bereich
  umbenannte Teams bleiben unverändert. Ein gelöschtes Team legt das Script beim nächsten Lauf
  allerdings neu an.
- Ein bereits vorhandener Account wird **nicht** verändert, auch nicht sein Passwort.
- Bei ungültigem `WAHLKREISE_JSON` bricht das Script ab, statt die Berlin-Mitte-Defaults
  anzulegen. Fehlt die Variable ganz, werden die Defaults verwendet (mit Warnung).

---

## 8. Scheduled Tasks (Cron-Jobs)

Die drei Cron-Endpunkte werden als **Scheduled Tasks** der Anwendung eingerichtet. Coolify führt
den Befehl im laufenden Container aus; `curl` ist im Image enthalten, `CRON_SECRET` steht dort als
Umgebungsvariable zur Verfügung.

In der Anwendung: **Scheduled Tasks** → **Add**

| Name | Befehl | Frequency (UTC) |
|---|---|---|
| `daily-summary` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-summary` | `0 19 * * *` |
| `cleanup-anmeldungen` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup-anmeldungen` | `0 * * * *` |
| `send-erinnerungen` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-erinnerungen` | `0 17 * * *` |

Bei **Container** jeweils den Container der Anwendung eintragen (bei einer einzelnen Anwendung
in der Regel bereits vorausgewählt).

| Task | Zweck | Zeitpunkt |
|---|---|---|
| `daily-summary` | Tagesübersicht an die Ansprechpersonen | 21:00 Sommerzeit / 20:00 Winterzeit. Der Endpunkt rechnet mit dem UTC-Datum, darf also nicht nach 24:00 UTC laufen. |
| `cleanup-anmeldungen` | löscht Anmeldedaten 72 h nach Aktionsende (DSGVO) | stündlich |
| `send-erinnerungen` | Erinnerung an Angemeldete am Abend vor der Aktion | 19:00 Sommerzeit / 18:00 Winterzeit |

**Zeitzone:** Coolify interpretiert die Frequenz in der Zeitzone, die unter **Servers** →
Server → **General** → **Timezone** eingestellt ist. Die Zeiten oben setzen **UTC** voraus –
die Einstellung einmal prüfen.

**Prüfen:** Jeden Task einmal über **Execute Now** starten. In den **Executions** muss eine
JSON-Antwort wie `{"message":"0 Aktionen bereinigt, ..."}` stehen. Erscheint stattdessen
`401` bzw. `Nicht autorisiert`, wurde `$CRON_SECRET` nicht aufgelöst – den Befehl dann als
`sh -c '<Befehl>'` eintragen.

---

## 9. Abschluss-Checkliste

- [ ] `https://<DOMAIN>` lädt mit gültigem Zertifikat
- [ ] `https://<DOMAIN>/api/health` liefert `{"status":"ok"}`
- [ ] Health-Check in Coolify ist aktiv und grün
- [ ] Login mit dem Bootstrap-Admin funktioniert
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` ist aus Coolify gelöscht
- [ ] **Datenschutzerklärung** (`/datenschutz`) zeigt die richtigen Angaben: Kreisverband,
      Datenschutzbeauftragte*r, Aufsichtsbehörde, Hosting-Anbieter, E-Mail-Anbieter
- [ ] **Impressum** (`/impressum`) ist korrekt
- [ ] Kopfzeile und Login-Seite zeigen den richtigen Kurznamen
- [ ] Karte startet über dem richtigen Ort
- [ ] Testanmeldung durchgeführt: Bestätigungs-E-Mail kommt an, Abmelde-Link führt auf `<DOMAIN>`
- [ ] Alle drei Scheduled Tasks einmal manuell ausgeführt, Antwort ohne Fehler
- [ ] Datenbank-Backup einmal manuell ausgeführt (**Backup Now**) und im S3-Speicher sichtbar
- [ ] Auftragsverarbeitungsvertrag (AVV) mit dem Hosting-Anbieter liegt vor

---

## 10. Updates deployen

Entwickelt wird auf `main`. Ein Push auf `main` deployt nichts; erst das Zusammenführen in
`production` löst das Deployment aus.

```bash
# 1. Änderungen auf main
git checkout main
git push origin main

# 2. Release: main nach production übernehmen
git checkout production
git pull origin production
git merge --ff-only main
git push origin production
# → Coolify baut und deployt automatisch

git checkout main
```

`--ff-only` stellt sicher, dass `production` immer genau einem Stand von `main` entspricht.
Schlägt es fehl, wurde direkt auf `production` committet – dann erst klären, bevor gemergt wird.

### Vor Releases mit Datenbank-Migration

Enthält das Release neue Dateien unter `prisma/migrations/`:

1. Coolify → Datenbank → **Backups** → **Backup Now**
2. Danach wie oben deployen. Die Migration läuft beim Containerstart; ihr Ergebnis steht im
   Container-Log.

### Nach dem Deployment

- Build- und Container-Log ohne Fehler
- `curl https://<DOMAIN>/api/health`
- kurzer Rundgang: Startseite, Login, Dashboard

---

## 11. Rollback

### Code zurückrollen

**Variante A – über Coolify (schnell):** In der Anwendung unter **Rollback** ein früheres Image
auswählen und starten. Coolify hält die letzten Images vor.

**Variante B – über Git (dauerhaft):**

```bash
git checkout production
git revert <commit>      # oder mehrere Commits
git push origin production
```

Der Revert muss anschließend auch nach `main` übernommen werden (`git checkout main && git merge production`),
sonst schlägt das nächste `--ff-only` fehl.

### Migrationen

Prisma rollt Migrationen **nicht** automatisch zurück. Ein älteres Image startet in der Regel auch
mit einem neueren Schema, solange die Migration nur Spalten oder Tabellen hinzugefügt hat. Bei
destruktiven Migrationen (Spalten gelöscht oder umbenannt) hilft nur das Backup:

1. Anwendung in Coolify stoppen
2. Datenbank aus dem Backup vor dem Release wiederherstellen
3. Älteres Image starten bzw. Revert deployen

---

## 12. Datenbankzugriff und Backups

### Zugriff per SSH-Tunnel

Die Datenbank ist nur auf `127.0.0.1` des Servers veröffentlicht (Port-Mapping aus
[Abschnitt 2](#postgresql-datenbank)). Zugriff vom eigenen Rechner:

```bash
ssh -N -L 5440:127.0.0.1:<PORT> <BENUTZER>@<COOLIFY-SERVER>
```

Danach z. B. mit pgAdmin, DBeaver oder `psql` auf `localhost:5440` verbinden – Benutzer und
Passwort stehen in Coolify bei der Datenbank. Für Prisma Studio:

```bash
DATABASE_URL="postgresql://<USER>:<PASSWORT>@localhost:5440/gruene_aktionen" npx prisma studio --port 3201
```

> Die Datenbank enthält personenbezogene Daten von Freiwilligen. Keine Kopien auf dem eigenen
> Rechner speichern, die nicht unmittelbar benötigt werden.

### Backups

- **Automatisch:** täglich 02:00 UTC nach S3 (siehe [Abschnitt 2](#postgresql-datenbank))
- **Manuell:** Datenbank → **Backups** → **Backup Now**
- **Wiederherstellen:** Datenbank → **Backups** → gewünschte Ausführung → **Restore**

Anmeldedaten werden 72 h nach Aktionsende gelöscht, bleiben aber bis zum Ablauf der
Aufbewahrungsfrist in älteren Backups enthalten. Die Aufbewahrung der Backups in Coolify
entsprechend kurz halten und in der Datenschutzerklärung berücksichtigen.

---

## 13. Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| Build bricht bei `npm test` ab | Ein Test schlägt fehl – lokal mit `npm test` nachvollziehen. Das bisherige Deployment läuft weiter. |
| Container startet nicht, Log zeigt Prisma-Fehler | `DATABASE_URL` falsch oder Datenbank nicht gestartet; bei `migrate deploy`-Fehlern die Migration prüfen. |
| Health-Check schlägt fehl, `/api/health` liefert 503 | App läuft, aber die Datenbank ist nicht erreichbar. Container-Log zeigt `Health-Check: Datenbank nicht erreichbar` mit Details. |
| Login schlägt fehl, Log zeigt `[auth][error] MissingCSRF` | Die App wird unter einer anderen Adresse aufgerufen als in `NEXTAUTH_URL` – meist per `http://` (z. B. über die von Coolify generierte sslip.io-Domain oder bevor das Zertifikat ausgestellt ist), während `NEXTAUTH_URL` mit `https://` beginnt. Auth.js setzt das CSRF-Cookie dann als `__Host-`/`Secure`-Cookie, das der Browser über http verwirft. Lösung: nur unter der Domain aus `NEXTAUTH_URL` per https aufrufen; die generierte Domain in Coolify entfernen. |
| Login leitet immer wieder auf `/login` um | `NEXTAUTH_URL` stimmt nicht mit der Domain überein oder `AUTH_TRUST_HOST` fehlt. |
| Alle Benutzer*innen plötzlich abgemeldet | `NEXTAUTH_SECRET` wurde geändert. |
| Links in E-Mails zeigen auf eine falsche Domain | `NEXTAUTH_URL` fehlt oder ist falsch. |
| Keine E-Mails | `SMTP_HOST` leer oder Zugangsdaten falsch. Jeder Versuch wird protokolliert (Prisma-Modell `EmailLog`); Fehlschläge mit dem Präfix `FEHLER:`. |
| Kopfzeile, Karte oder Gebietsbezeichnung falsch | Build-Variable ([5.3](#53-build-variablen--buildtime-und-runtime)) fehlt oder „Available at Buildtime“ ist nicht gesetzt – korrigieren und **Redeploy**. |
| Datenschutz/Impressum zeigt Berlin-Mitte | Variable aus [5.4](#54-kreisverbands-konfiguration--runtime) fehlt – setzen und Restart. |
| Scheduled Task liefert `Nicht autorisiert` | `CRON_SECRET` im Befehl nicht aufgelöst – siehe [Abschnitt 8](#8-scheduled-tasks-cron-jobs). |
| Anmeldungen werden mit „Zu viele Anfragen“ abgelehnt | Das Rate-Limiting zählt pro IP im Speicher des Containers; ein Restart setzt die Zähler zurück. |
