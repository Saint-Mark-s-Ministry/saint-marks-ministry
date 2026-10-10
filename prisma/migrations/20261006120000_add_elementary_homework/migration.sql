-- Elementary is an explicit, year-scoped ministry band. Existing installations
-- already use this name; the flag survives later renames.
ALTER TABLE "SundaySchoolAgeGroup"
ADD COLUMN "isElementary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SundaySchoolAgeGroup"
SET "isElementary" = true
WHERE LOWER(TRIM("name")) = 'elementary';

-- PostgreSQL treats NULLs as distinct, so coalesce the legacy no-year rows to
-- enforce the same one-Elementary-band rule there as in year-bound data.
CREATE UNIQUE INDEX "SundaySchoolAgeGroup_one_elementary_per_year"
ON "SundaySchoolAgeGroup" (COALESCE("sundaySchoolYearId", '__legacy__'))
WHERE "isElementary" = true;

CREATE TYPE "SundaySchoolHomeworkCompletionStatus" AS ENUM ('COMPLETED', 'NOT_COMPLETED');

CREATE TABLE "SundaySchoolHomework" (
    "id" TEXT NOT NULL,
    "weeklyLessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SundaySchoolHomework_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SundaySchoolHomeworkResource" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SundaySchoolHomeworkResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SundaySchoolHomeworkCompletion" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "status" "SundaySchoolHomeworkCompletionStatus" NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SundaySchoolHomeworkCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SundaySchoolHomework_weeklyLessonId_key" ON "SundaySchoolHomework"("weeklyLessonId");
CREATE INDEX "SundaySchoolHomework_archivedAt_idx" ON "SundaySchoolHomework"("archivedAt");
CREATE INDEX "SundaySchoolHomework_createdById_idx" ON "SundaySchoolHomework"("createdById");
CREATE INDEX "SundaySchoolHomework_updatedById_idx" ON "SundaySchoolHomework"("updatedById");
CREATE UNIQUE INDEX "SundaySchoolHomeworkResource_homeworkId_sortOrder_key" ON "SundaySchoolHomeworkResource"("homeworkId", "sortOrder");
CREATE INDEX "SundaySchoolHomeworkResource_homeworkId_idx" ON "SundaySchoolHomeworkResource"("homeworkId");
CREATE UNIQUE INDEX "SundaySchoolHomeworkCompletion_homeworkId_childId_key" ON "SundaySchoolHomeworkCompletion"("homeworkId", "childId");
CREATE INDEX "SundaySchoolHomeworkCompletion_childId_idx" ON "SundaySchoolHomeworkCompletion"("childId");
CREATE INDEX "SundaySchoolHomeworkCompletion_status_idx" ON "SundaySchoolHomeworkCompletion"("status");
CREATE INDEX "SundaySchoolHomeworkCompletion_recordedById_idx" ON "SundaySchoolHomeworkCompletion"("recordedById");

ALTER TABLE "SundaySchoolHomework" ADD CONSTRAINT "SundaySchoolHomework_weeklyLessonId_fkey" FOREIGN KEY ("weeklyLessonId") REFERENCES "SundaySchoolWeeklyLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomework" ADD CONSTRAINT "SundaySchoolHomework_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomework" ADD CONSTRAINT "SundaySchoolHomework_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomeworkResource" ADD CONSTRAINT "SundaySchoolHomeworkResource_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "SundaySchoolHomework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomeworkCompletion" ADD CONSTRAINT "SundaySchoolHomeworkCompletion_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "SundaySchoolHomework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomeworkCompletion" ADD CONSTRAINT "SundaySchoolHomeworkCompletion_childId_fkey" FOREIGN KEY ("childId") REFERENCES "SundaySchoolChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolHomeworkCompletion" ADD CONSTRAINT "SundaySchoolHomeworkCompletion_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
