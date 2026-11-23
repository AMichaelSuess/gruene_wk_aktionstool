-- Statistics of hard-deleted actions are removed instead of kept orphaned.
-- Orphans can only exist since 20261123192806 (before that the delete was
-- blocked), so they all stem from deleted test actions. Their team links
-- go with them via ON DELETE CASCADE on aktion_statistik_teams.
DELETE FROM "aktion_statistiken" WHERE "aktionId" IS NULL;

-- DropForeignKey
ALTER TABLE "aktion_statistiken" DROP CONSTRAINT "aktion_statistiken_aktionId_fkey";

-- AddForeignKey
ALTER TABLE "aktion_statistiken" ADD CONSTRAINT "aktion_statistiken_aktionId_fkey" FOREIGN KEY ("aktionId") REFERENCES "aktionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
