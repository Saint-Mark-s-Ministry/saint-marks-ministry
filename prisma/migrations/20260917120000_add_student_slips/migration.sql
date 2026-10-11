-- Catch-up migration: the confession-tracker / attendance-slip schema landed in
-- a18fe48 (2026-09-17) via `prisma db push`, so it reached the database without
-- ever being written down as a migration. That left the migration files unable
-- to rebuild the schema from scratch.
--
-- The DDL below was generated from prisma/schema.prisma and verified statement
-- by statement against the live database (columns, nullability, SlipType values,
-- and all three indexes matched exactly). It is dated to the day the feature
-- shipped so the history reads chronologically.
--
-- On any database that already has these objects, mark this migration as applied
-- instead of running it:
--   bunx prisma migrate resolve --applied 20260917120000_add_student_slips

-- CreateEnum
CREATE TYPE "SlipType" AS ENUM ('ATTENDANCE', 'CONFESSION');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "slipId" TEXT;

-- CreateTable
CREATE TABLE "StudentSlip" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "SlipType" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentSlip_type_idx" ON "StudentSlip"("type");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSlip_studentId_type_periodStart_key" ON "StudentSlip"("studentId", "type", "periodStart");

-- CreateIndex
CREATE INDEX "AttendanceRecord_slipId_idx" ON "AttendanceRecord"("slipId");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "StudentSlip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSlip" ADD CONSTRAINT "StudentSlip_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSlip" ADD CONSTRAINT "StudentSlip_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

