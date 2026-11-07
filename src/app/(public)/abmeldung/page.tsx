export default async function AbmeldungPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;
  const isError = fehler === "1";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="bg-white rounded-card border-ui border-line p-8 shadow-ui-brand-lg">
        {isError ? (
          <>
            <p className="font-headline font-bold text-danger text-2xl case-ui mb-2">
              Abmeldung nicht möglich
            </p>
            <p className="text-ink mt-2">
              Der Abmelde-Link ist ungültig oder wurde bereits verwendet.
              Falls du dich von einer Aktion abmelden möchtest, wende dich
              bitte direkt an die Ansprechperson.
            </p>
          </>
        ) : (
          <>
            <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
              Erfolgreich abgemeldet
            </p>
            <p className="text-ink mt-2">
              Du wurdest erfolgreich von der Aktion abgemeldet.
              Vielen Dank für dein Interesse!
            </p>
          </>
        )}
        <a
          href="/"
          className="mt-6 inline-block text-primary hover:underline font-bold"
        >
          ← Zurück zur Aktionsübersicht
        </a>
      </div>
    </div>
  );
}
