-- CreateEnum
CREATE TYPE "AktionKategorie" AS ENUM ('HAUSTUER', 'STRASSE', 'SONSTIGES');

-- AlterTable
ALTER TABLE "aktionen" ADD COLUMN     "kategorie" "AktionKategorie" NOT NULL DEFAULT 'SONSTIGES';
