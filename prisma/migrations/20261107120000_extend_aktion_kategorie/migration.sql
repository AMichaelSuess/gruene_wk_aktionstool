-- "Straße" heißt jetzt "Infostand"; bestehende Aktionen behalten ihre Kategorie.
ALTER TYPE "AktionKategorie" RENAME VALUE 'STRASSE' TO 'INFOSTAND';

-- Neue Kategorien
ALTER TYPE "AktionKategorie" ADD VALUE 'FLYERN' BEFORE 'INFOSTAND';
ALTER TYPE "AktionKategorie" ADD VALUE 'PLAKATIEREN' BEFORE 'SONSTIGES';
