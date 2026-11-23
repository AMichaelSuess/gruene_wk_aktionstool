# Umgebungsvariablen

Die App wird vollständig über Umgebungsvariablen konfiguriert. Eine kommentierte Vorlage steht in [`.env.example`](../.env.example), die Einrichtung in Coolify beschreibt [deployment/coolify-deployment.md](deployment/coolify-deployment.md).

**Build-Variablen:** Alle `NEXT_PUBLIC_*`-Variablen sowie `ORG_FULL_NAME` und `ALLOWED_EMBED_DOMAIN` werden beim Build eingebettet. Nach einer Änderung muss neu gebaut werden; im Docker-Build müssen sie als Build-Argument übergeben werden (im `Dockerfile` als `ARG` deklariert).

## Infrastruktur

| Variable          | Beschreibung                                  | Beispiel                                       |
|-------------------|-----------------------------------------------|------------------------------------------------|
| `DATABASE_URL`    | PostgreSQL-Verbindungsstring                  | `postgresql://user:pass@localhost:5432/dbname` |
| `NEXTAUTH_SECRET` | Schlüssel für die JWT-Signierung (min. 32 Zeichen) | `openssl rand -base64 32`                 |
| `NEXTAUTH_URL`    | Öffentliche URL der App                       | `https://aktionen.gruene-mitte.de`             |
| `AUTH_TRUST_HOST` | Proxy-Header vertrauen (hinter Reverse-Proxy) | `true`                                         |
| `SMTP_HOST`       | SMTP-Server                                   | `smtp.example.com`                             |
| `SMTP_PORT`       | SMTP-Port                                     | `587`                                          |
| `SMTP_SECURE`     | TLS ab Verbindungsaufbau (Port 465); sonst wird STARTTLS verlangt | `false`                    |
| `SMTP_USER`       | SMTP-Benutzername (leer: kein E-Mail-Versand) | `user@example.com`                             |
| `SMTP_PASSWORD`   | SMTP-Passwort                                 | *(geheim)*                                     |
| `EMAIL_FROM`      | Absenderadresse                               | `aktionen@gruene-mitte.de`                     |
| `EMAIL_FROM_NAME` | Anzeigename des Absenders                     | `"Kreisvorstand B90/GRÜNE Berlin-Mitte"`       |
| `CRON_SECRET`     | Bearer-Token für die Cron-Endpunkte (min. 32 Zeichen, sonst gesperrt) | `openssl rand -hex 32`  |
| `ALLOWED_EMBED_DOMAIN` | Domain, die Formulare per iframe einbetten darf, siehe [embedding.md](embedding.md) | `https://www.gruene-mitte.de` |

## Grundeinrichtung

Nur für den einmaligen Lauf von `npm run db:bootstrap` (bzw. `node dist/bootstrap.js` im Container), danach wieder entfernen.

| Variable                   | Beschreibung                           |
|----------------------------|----------------------------------------|
| `BOOTSTRAP_ADMIN_EMAIL`    | E-Mail des ersten Admin-Kontos         |
| `BOOTSTRAP_ADMIN_PASSWORD` | Passwort (min. 12 Zeichen)             |
| `BOOTSTRAP_ADMIN_NAME`     | Name des ersten Admin-Kontos           |

## Kreisverbands-Konfiguration

Alle folgenden Variablen sind **optional** – ohne Angabe gelten die Werte von Berlin-Mitte.

### Organisation

| Variable                      | Beschreibung                                    | Beispiel                                   |
|-------------------------------|-------------------------------------------------|--------------------------------------------|
| `NEXT_PUBLIC_ORG_SHORT_NAME`  | Kurzname in der Oberfläche                      | `B90/GRÜNE Köln`                           |
| `ORG_FULL_NAME`               | Vollständiger Name                              | `BÜNDNIS 90/DIE GRÜNEN Köln`               |
| `ORG_LEGAL_NAME`              | Rechtlicher Name (Datenschutz, Impressum)       | `BÜNDNIS 90/DIE GRÜNEN Kreisverband Köln`  |
| `ORG_RESPONSIBLE`             | Verantwortliche Person oder Rolle               | `Kreisvorstand BÜNDNIS 90/DIE GRÜNEN Köln` |
| `ORG_SUBTITLE`                | Untertitel in E-Mail-Kopfzeilen                 | `Kreisvorstand`                            |
| `ORG_TEAM_NAMES`              | Unterschrift in E-Mails an Freiwillige          | `Anna, Ben und Clara`                      |

### Kontakt und Adresse

| Variable              | Beschreibung              | Beispiel                            |
|-----------------------|---------------------------|-------------------------------------|
| `CONTACT_EMAIL`       | Kontaktadresse            | `info@gruene-koeln.de`              |
| `WEBSITE_URL`         | Website des Kreisverbands | `www.gruene-koeln.de`               |
| `IMPRESSUM_URL`       | Link zum Impressum        | `https://gruene-koeln.de/impressum` |
| `ADDRESS_STREET`      | Straße und Hausnummer     | `Mauritiuswall 1`                   |
| `ADDRESS_POSTAL_CODE` | Postleitzahl              | `50676`                             |
| `ADDRESS_CITY`        | Stadt                     | `Köln`                              |

### Karte und Geocoding

| Variable               | Beschreibung                                               | Beispiel             |
|------------------------|------------------------------------------------------------|----------------------|
| `GEOCODING_CITY`       | Stadt, die beim Geocoding an Adressen angehängt wird (Default: `ADDRESS_CITY`) | `Köln` |
| `NEXT_PUBLIC_MAP_CENTER` | Startansicht der Karte als `Breitengrad,Längengrad`      | `"50.9375,6.9603"`   |
| `NEXT_PUBLIC_MAP_ZOOM` | Zoomstufe der Startansicht                                 | `13`                 |
| `NEXT_PUBLIC_MAP_TILE_URL` | Kachelserver der Karte, nur `https`; der Host wird automatisch in die CSP übernommen (Default: `https://tile.openstreetmap.de/{z}/{x}/{y}.png`, FOSSGIS e.V., Server in der EU) | `"https://sgx.geodatenzentrum.de/…/{z}/{y}/{x}.png"` |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Quellenangabe unter der Karte (HTML, vom Anbieter vorgeschrieben). Bei eigenem Kachelserver mit anpassen | `'© <a href="https://basemap.de">basemap.de</a> / BKG (CC BY 4.0)'` |
| `MAP_TILE_PROVIDER` | Anbieter der Kartenkacheln für die Datenschutzerklärung (Default: FOSSGIS e.V.) | `"Bundesamt für Kartographie und Geodäsie (BKG), Frankfurt am Main"` |
| `MAP_TILE_PROVIDER_PRIVACY_URL` | Datenschutzerklärung des Kachelanbieters | `"https://www.bkg.bund.de/datenschutz"` |

Wer den Kachelserver wechselt, prüft auch, ob der Abschnitt „Übermittlung in Drittländer“ der Datenschutzerklärung noch stimmt. Ein vollständiges Beispiel (basemap.de) steht in [`.env.example`](../.env.example).

### Wahlkreise

| Variable                             | Beschreibung | Beispiel |
|--------------------------------------|--------------|----------|
| `WAHLKREISE_JSON`                    | JSON-Array mit `{nummer, name}` pro Wahlkreis. Ohne Angabe: die 7 Wahlkreise von Berlin-Mitte. Die Nummern müssen zu den Werten im Excel-Import passen. | `'[{"nummer":1,"name":"Wahlkreis 1"}]'` |
| `NEXT_PUBLIC_WAHLKREIS_LABEL`        | Bezeichnung der Gebietseinheit in Oberfläche, Meldungen und Excel-Dateien (Einzahl). Default: `Wahlkreis`. Excel-Importe mit der Spalte „Wahlkreis“ funktionieren weiterhin. | `Stadtbezirk` |
| `NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL` | Mehrzahl. Default: Einzahl + „e“ | `Stadtbezirke` |
| `NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT`  | Kurzform für Filter, Aktionskarten und Karten-Popups. Default: `WK`, bei eigener Einzahl diese | `Stadtbezirk` |
| `NEXT_PUBLIC_WAHLKREIS_NUMMERN`      | `false`, wenn die Gebiete keine Nummern tragen: Die Oberfläche zeigt dann nur Namen, die Nummer bestimmt nur die Reihenfolge | `false` |

### Erscheinungsbild

| Variable                 | Beschreibung | Beispiel |
|--------------------------|--------------|----------|
| `NEXT_PUBLIC_THEME`      | `brutalist` (Default, Grüne CI) oder `emerald` (Leipziger OBM-Kampagne 2027), siehe [design/theming.md](design/theming.md) | `emerald` |
| `NEXT_PUBLIC_HERO_TITLE` | Überschrift im Kampagnen-Kopfbereich der Startseite (nur `emerald`) | `"Mach mit im Wahlkampf!"` |
| `NEXT_PUBLIC_HERO_TEXT`  | Text darunter (nur `emerald`) | `"Jede helfende Hand zählt."` |

### Datenschutzbeauftragte*r

| Variable          | Beschreibung                    | Beispiel                 |
|-------------------|---------------------------------|--------------------------|
| `DSB_NAME`        | Name bzw. Organisation          | `SCO-CON:SULT`           |
| `DSB_STREET`      | Straße und Hausnummer           | `Hauptstraße 27`         |
| `DSB_POSTAL_CODE` | Postleitzahl                    | `53604`                  |
| `DSB_CITY`        | Stadt                           | `Bad Honnef`             |
| `DSB_EMAIL`       | E-Mail-Adresse                  | `datenschutz@example.de` |
| `DSB_PHONE`       | Telefonnummer                   | `02224/988290`           |
| `DSB_CONTACT_URL` | Kontaktformular statt E-Mail und Telefon; ist es gesetzt, dürfen `DSB_EMAIL` und `DSB_PHONE` fehlen | `https://example.org/datenschutz/kontakt/` |

### Aufsichtsbehörde

| Variable               | Beschreibung          | Beispiel                                        |
|------------------------|-----------------------|-------------------------------------------------|
| `AUFSICHT_NAME`        | Name der Behörde      | `LfDI Baden-Württemberg`                        |
| `AUFSICHT_STREET`      | Straße und Hausnummer | `Lautenschlagerstr. 20`                         |
| `AUFSICHT_POSTAL_CODE` | Postleitzahl          | `70173`                                         |
| `AUFSICHT_CITY`        | Stadt                 | `Stuttgart`                                     |
| `AUFSICHT_PHONE`       | Telefonnummer         | `0711 / 615541-0`                               |
| `AUFSICHT_EMAIL`       | E-Mail-Adresse        | `poststelle@lfdi.bwl.de`                        |
| `AUFSICHT_URL`         | Website               | `https://www.baden-wuerttemberg.datenschutz.de` |

### Auftragsverarbeiter

| Variable                     | Beschreibung                              | Beispiel                                          |
|------------------------------|-------------------------------------------|---------------------------------------------------|
| `HOSTING_PROVIDER`           | Hosting-Anbieter                          | `Hetzner Online GmbH`                             |
| `HOSTING_ADDRESS`            | Adresse des Hosting-Anbieters             | `Industriestr. 25, 91710 Gunzenhausen`            |
| `HOSTING_LOCATION`           | Serverstandort                            | `Deutschland`                                     |
| `HOSTING_PRIVACY_URL`        | Datenschutzerklärung des Hosters          | `https://www.hetzner.com/de/legal/privacy-policy` |
| `EMAIL_PROVIDER`             | E-Mail-Dienstleister                      | `Verdigado eG`                                    |
| `EMAIL_PROVIDER_PRIVACY_URL` | Datenschutzerklärung des E-Mail-Anbieters | `https://www.verdigado.com/datenschutz`           |

### Sonstiges

| Variable                | Beschreibung                           | Beispiel           |
|-------------------------|----------------------------------------|--------------------|
| `DATENSCHUTZ_STAND`     | Stand der Datenschutzerklärung         | `März 2026`        |
| `ACCOUNT_DELETION_DATE` | Löschfrist für Konten nach dem Wahlkampf | `31. Oktober 2026` |
