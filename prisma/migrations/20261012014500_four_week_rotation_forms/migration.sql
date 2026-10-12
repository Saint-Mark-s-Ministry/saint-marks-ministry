-- CreateEnum
CREATE TYPE "RotationFormStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "SundaySchoolAssignment_studentId_academicYearId_key";

-- AlterTable
ALTER TABLE "SundaySchoolAssignment" ALTER COLUMN "totalWeeks" SET DEFAULT 4;

-- AlterTable
ALTER TABLE "SundaySchoolLog" ADD COLUMN     "rotationFormId" TEXT;

-- CreateTable
CREATE TABLE "SundaySchoolRotationForm" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "level" "SundaySchoolLevel" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RotationFormStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SundaySchoolRotationForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SundaySchoolRotationForm_assignmentId_key" ON "SundaySchoolRotationForm"("assignmentId");

-- CreateIndex
CREATE INDEX "SundaySchoolRotationForm_status_createdAt_idx" ON "SundaySchoolRotationForm"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SundaySchoolRotationForm_reviewedById_idx" ON "SundaySchoolRotationForm"("reviewedById");

-- CreateIndex
CREATE INDEX "SundaySchoolLog_rotationFormId_idx" ON "SundaySchoolLog"("rotationFormId");

-- AddForeignKey
ALTER TABLE "SundaySchoolLog" ADD CONSTRAINT "SundaySchoolLog_rotationFormId_fkey" FOREIGN KEY ("rotationFormId") REFERENCES "SundaySchoolRotationForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolRotationForm" ADD CONSTRAINT "SundaySchoolRotationForm_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SundaySchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolRotationForm" ADD CONSTRAINT "SundaySchoolRotationForm_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Multiple completed rotations may exist in one academic year, but a student
-- cannot move into two classes at once. Do not silently retire existing rows.
CREATE UNIQUE INDEX "SundaySchoolAssignment_one_active_student_key"
ON "SundaySchoolAssignment" ("studentId") WHERE "isActive" = true;

-- Preserve historical lengths; every current/new rotation must be four weeks.
ALTER TABLE "SundaySchoolAssignment" ADD CONSTRAINT "SundaySchoolAssignment_active_four_weeks_check"
CHECK (NOT "isActive" OR "totalWeeks" = 4);

ALTER TABLE "SundaySchoolRotationForm" ADD CONSTRAINT "SundaySchoolRotationForm_rotation_level_check"
CHECK ("level" IN ('PRE_K', 'KINDERGARTEN', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8'));
