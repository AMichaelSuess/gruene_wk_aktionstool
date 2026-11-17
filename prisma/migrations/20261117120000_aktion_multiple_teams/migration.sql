-- Eine Aktion kann jetzt mehreren Teams gehoeren. Die bisherige Einzel-Zuordnung
-- (aktionen.teamId, aktion_statistiken.teamId) wird in Verknuepfungstabellen
-- uebernommen, bevor die alten Spalten entfernt werden.

-- CreateTable
CREATE TABLE "aktion_teams" (
    "aktionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "aktion_teams_pkey" PRIMARY KEY ("aktionId","teamId")
);

-- CreateTable
CREATE TABLE "aktion_statistik_teams" (
    "statistikId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "aktion_statistik_teams_pkey" PRIMARY KEY ("statistikId","teamId")
);

-- CreateIndex
CREATE INDEX "aktion_teams_teamId_idx" ON "aktion_teams"("teamId");

-- CreateIndex
CREATE INDEX "aktion_statistik_teams_teamId_idx" ON "aktion_statistik_teams"("teamId");

-- AddForeignKey
ALTER TABLE "aktion_teams" ADD CONSTRAINT "aktion_teams_aktionId_fkey" FOREIGN KEY ("aktionId") REFERENCES "aktionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aktion_teams" ADD CONSTRAINT "aktion_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aktion_statistik_teams" ADD CONSTRAINT "aktion_statistik_teams_statistikId_fkey" FOREIGN KEY ("statistikId") REFERENCES "aktion_statistiken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aktion_statistik_teams" ADD CONSTRAINT "aktion_statistik_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing assignments
INSERT INTO "aktion_teams" ("aktionId", "teamId")
SELECT "id", "teamId" FROM "aktionen" WHERE "teamId" IS NOT NULL;

INSERT INTO "aktion_statistik_teams" ("statistikId", "teamId")
SELECT "id", "teamId" FROM "aktion_statistiken" WHERE "teamId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "aktion_statistiken" DROP CONSTRAINT "aktion_statistiken_teamId_fkey";

-- DropForeignKey
ALTER TABLE "aktionen" DROP CONSTRAINT "aktionen_teamId_fkey";

-- AlterTable
ALTER TABLE "aktion_statistiken" DROP COLUMN "teamId";

-- AlterTable
ALTER TABLE "aktionen" DROP COLUMN "teamId";
