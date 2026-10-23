-- Responsibility is tied to a year-bound class staffing assignment, not a role.
ALTER TABLE "SundaySchoolChild" ADD COLUMN "followUpAssignmentId" TEXT;
CREATE INDEX "SundaySchoolChild_followUpAssignmentId_idx" ON "SundaySchoolChild"("followUpAssignmentId");
ALTER TABLE "SundaySchoolChild" ADD CONSTRAINT "SundaySchoolChild_followUpAssignmentId_fkey" FOREIGN KEY ("followUpAssignmentId") REFERENCES "SundaySchoolServantAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
