import { districtConfig } from "@/lib/district-config";

export default function DatenschutzPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-headline text-3xl font-bold text-primary case-ui mb-2">
        Datenschutzerklärung
      </h1>

      <div className="bg-white rounded-card border-ui border-line p-6 md:p-8 space-y-6 shadow-ui leading-relaxed">

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Verantwortliche Stelle
          </h2>
          <p>
            {districtConfig.orgLegalName}<br />
            {districtConfig.addressStreet}<br />
            {districtConfig.addressPostalCode} {districtConfig.addressCity}<br />
            E-Mail: {districtConfig.contactEmail}
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Datenschutzbeauftragte*r
          </h2>
          <p className="mb-2">
            Den Datenschutzbeauftragten für {districtConfig.orgFullName} erreichst du unter:
          </p>
          <p>
            {districtConfig.dsbName}<br />
            {districtConfig.dsbStreet}<br />
            {districtConfig.dsbPostalCode} {districtConfig.dsbCity}
            {districtConfig.dsbEmail && (
              <>
                <br />
                E-Mail:{" "}
                <a href={`mailto:${districtConfig.dsbEmail}`} className="text-primary underline">
                  {districtConfig.dsbEmail}
                </a>
              </>
            )}
            {districtConfig.dsbPhone && (
              <>
                <br />
                Tel.: {districtConfig.dsbPhone}
              </>
            )}
            {districtConfig.dsbContactUrl && (
              <>
                <br />
                Kontakt:{" "}
                <a
                  href={districtConfig.dsbContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Kontaktformular
                </a>
              </>
            )}
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Erhobene Daten und Zweck der Verarbeitung
          </h2>
          <p className="mb-2">
            Bei der Anmeldung zu Wahlkampfaktionen werden folgende personenbezogene Daten erhoben
            und ausschließlich zur Koordination dieser Aktionen genutzt:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-3">
            <li>Vorname und Nachname</li>
            <li>E-Mail-Adresse</li>
            <li>Telefonnummer (alternativ: Signal-Nutzername)</li>
            <li>Signal-Name (optional)</li>
          </ul>
          <p className="mb-2">Die Daten werden konkret verwendet für:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Bestätigung und Erinnerung der Anmeldung per E-Mail</li>
            <li>Benachrichtigung bei Änderungen oder Absagen von Aktionen</li>
            <li>Koordination der Aktionen durch die zuständigen Ansprechpersonen</li>
          </ul>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Rechtsgrundlage
          </h2>
          <p className="mb-3">
            Die Verarbeitung erfolgt auf Grundlage deiner Einwilligung gemäß Art. 6 Abs. 1 lit. a
            DSGVO, die du durch das Setzen des Häkchens im Anmeldeformular erteilst.
          </p>
          <p>
            Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen – formlos
            per E-Mail an{" "}
            <a href={`mailto:${districtConfig.contactEmail}`} className="text-primary underline">
              {districtConfig.contactEmail}
            </a>{" "}
            oder über den Abmeldelink in deiner Bestätigungs-E-Mail. Der Widerruf berührt nicht die
            Rechtmäßigkeit der bis dahin erfolgten Verarbeitung (Art. 7 Abs. 3 DSGVO).
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Empfänger und Auftragsverarbeiter
          </h2>
          <p className="mb-3">
            Deine Daten werden nicht an Dritte verkauft oder zu anderen Zwecken weitergegeben. Zur
            technischen Bereitstellung dieser Plattform setzen wir folgende Dienstleister als
            Auftragsverarbeiter ein, mit denen Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO
            geschlossen wurden:
          </p>
          <p className="font-bold mb-1">Hosting</p>
          <p className="mb-3">
            {districtConfig.hostingProvider}<br />
            {districtConfig.hostingAddress}<br />
            Serverstandort: {districtConfig.hostingLocation}<br />
            <a
              href={districtConfig.hostingPrivacyUrl}
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {districtConfig.hostingPrivacyUrl}
            </a>
          </p>
          <p className="font-bold mb-1">E-Mail-Versand</p>
          <p>
            {districtConfig.emailProvider}<br />
            <a
              href={districtConfig.emailProviderPrivacyUrl}
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {districtConfig.emailProviderPrivacyUrl}
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Kartendarstellung
          </h2>
          <p className="mb-3">
            Auf der Startseite zeigen wir die Orte der Aktionen auf einer Karte. Die Kartenbilder
            lädt dein Browser direkt vom Kartendienst {districtConfig.mapTileProvider}. Dabei
            erhält der Kartendienst deine IP-Adresse, Angaben zu deinem Browser, die Adresse
            unserer Website und den Zeitpunkt des Abrufs. Ohne diese Übermittlung kann die Karte
            nicht angezeigt werden. Der Kartendienst setzt keine Cookies.
          </p>
          <p className="mb-3">
            Rechtsgrundlage ist unser berechtigtes Interesse, die Orte der Aktionen anschaulich
            darzustellen (Art. 6 Abs. 1 lit. f DSGVO). Für die Verarbeitung beim Kartendienst ist
            dieser selbst verantwortlich. Näheres in seiner Datenschutzerklärung:
          </p>
          <p>
            <a
              href={districtConfig.mapTileProviderPrivacyUrl}
              className="text-primary underline break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              {districtConfig.mapTileProviderPrivacyUrl}
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Übermittlung in Drittländer
          </h2>
          <p>
            Eine Übermittlung deiner Daten in Länder außerhalb der Europäischen Union oder des
            Europäischen Wirtschaftsraums findet nicht statt.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Speicherdauer und Löschung
          </h2>
          <p className="mb-3">
            Deine Anmeldedaten (Vorname, Nachname, E-Mail-Adresse, Telefonnummer, Signal-Name)
            werden <strong>72 Stunden nach Ende der jeweiligen Aktion automatisch gelöscht</strong>.
            Anschließend werden ausschließlich anonymisierte Gesamtzahlen (Anzahl der Anmeldungen
            pro Aktion) zu statistischen Zwecken gespeichert. Aus diesen Zahlen ist kein Rückschluss
            auf einzelne Personen möglich.
          </p>
          <p className="mb-3">
            Zu jeder E-Mail, die wir verschicken, speichern wir ein kurzes Versandprotokoll
            (E-Mail-Adresse, Art der Nachricht, Zeitpunkt; bei einer Abmeldung auch deinen Namen).
            Diese Versandprotokolle werden <strong>nach 7 Tagen automatisch gelöscht</strong>.
          </p>
          <p>
            Nutzer-Accounts der Expert*innen und Administrator*innen sowie Team-Zuordnungen werden
            spätestens am {districtConfig.accountDeletionDate} gelöscht.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Automatisierte Entscheidungsfindung
          </h2>
          <p>
            Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne
            von Art. 22 DSGVO statt.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Cookies
          </h2>
          <p>
            Diese Website verwendet keine Tracking-Cookies. Wenn du dich nur für Aktionen anmeldest,
            setzen wir überhaupt keine Cookies.
          </p>
          <p className="mt-3">
            Nur beim Login von Expert*innen und Administrator*innen setzen wir technisch
            notwendige Cookies: ein Sitzungs-Cookie mit der verschlüsselten Anmeldung und, während
            des Logins, Cookies zum Schutz vor gefälschten Anfragen. Sie werden nicht zur
            Verfolgung genutzt. Das Sitzungs-Cookie bleibt auch nach dem Schließen des Browsers
            erhalten: Es gilt 24 Stunden ab der letzten Nutzung, eine Sitzung endet spätestens
            7 Tage nach dem Login. Beim Abmelden wird es gelöscht. Im internen Bereich merkt sich
            dein Browser außerdem die gewählten Filter (im lokalen Speicher des Browsers); diese
            Angaben werden nicht an uns übertragen.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Deine Rechte
          </h2>
          <p className="mb-2">
            Dir stehen gegenüber der verantwortlichen Stelle folgende Rechte zu:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-3">
            <li>Auskunft (Art. 15 DSGVO)</li>
            <li>Berichtigung (Art. 16 DSGVO)</li>
            <li>Löschung (Art. 17 DSGVO)</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
            <li>Selbstabmeldung über den Link in der Bestätigungs-E-Mail</li>
            <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
          </ul>
          <p>
            Zur Ausübung deiner Rechte wende dich an:{" "}
            <a href={`mailto:${districtConfig.contactEmail}`} className="text-primary underline">
              {districtConfig.contactEmail}
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Zuständige Aufsichtsbehörde
          </h2>
          <p className="mb-2">
            Du hast das Recht, dich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren:
          </p>
          <p>
            {districtConfig.aufsichtName}<br />
            {districtConfig.aufsichtStreet}<br />
            {districtConfig.aufsichtPostalCode} {districtConfig.aufsichtCity}<br />
            Telefon: {districtConfig.aufsichtPhone}<br />
            E-Mail:{" "}
            <a href={`mailto:${districtConfig.aufsichtEmail}`} className="text-primary underline">
              {districtConfig.aufsichtEmail}
            </a>
            <br />
            <a
              href={districtConfig.aufsichtUrl}
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {districtConfig.aufsichtUrl}
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-primary case-ui mb-3">
            Kontakt bei Datenschutzfragen
          </h2>
          <p>
            Bei Fragen zum Datenschutz wende dich an:{" "}
            <a href={`mailto:${districtConfig.contactEmail}`} className="text-primary underline">
              {districtConfig.contactEmail}
            </a>
          </p>
        </section>

        <p className="text-sm text-gray-500 border-t-ui border-line pt-4">
          {districtConfig.orgLegalName} · Stand: {districtConfig.datenschutzStand}
        </p>
      </div>
    </div>
  );
}
