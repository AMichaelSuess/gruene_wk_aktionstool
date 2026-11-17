-- Prisma has always written these columns in UTC. Convert them explicitly as
-- UTC so the result does not depend on the database session's time zone
-- (Prisma's generated statement would use the session time zone).
-- AlterTable
ALTER TABLE "aktion_statistiken" ALTER COLUMN "geloeschtAm" SET DATA TYPE TIMESTAMPTZ(3) USING "geloeschtAm" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "aktionen" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "anmeldungen" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "email_logs" ALTER COLUMN "gesendetAm" SET DATA TYPE TIMESTAMPTZ(3) USING "gesendetAm" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "teams" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "wahlkreise" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
