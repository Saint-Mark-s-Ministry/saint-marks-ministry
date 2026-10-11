-- Async students' Sunday School rotations can point at a real Sunday School
-- class. Additive and nullable: existing rotations keep their grade.

-- AlterTable
ALTER TABLE "SundaySchoolAssignment" ADD COLUMN     "classId" TEXT;

-- CreateIndex
CREATE INDEX "SundaySchoolAssignment_classId_idx" ON "SundaySchoolAssignment"("classId");

-- AddForeignKey
ALTER TABLE "SundaySchoolAssignment" ADD CONSTRAINT "SundaySchoolAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SundaySchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
