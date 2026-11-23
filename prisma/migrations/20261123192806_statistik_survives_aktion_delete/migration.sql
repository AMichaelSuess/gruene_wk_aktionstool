-- DropForeignKey
ALTER TABLE "aktion_statistiken" DROP CONSTRAINT "aktion_statistiken_aktionId_fkey";

-- AlterTable
ALTER TABLE "aktion_statistiken" ALTER COLUMN "aktionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "aktion_statistiken" ADD CONSTRAINT "aktion_statistiken_aktionId_fkey" FOREIGN KEY ("aktionId") REFERENCES "aktionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
