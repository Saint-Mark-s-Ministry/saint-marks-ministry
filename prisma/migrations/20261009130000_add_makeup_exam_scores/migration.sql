ALTER TABLE "ExamScore" ADD COLUMN "originalScore" DOUBLE PRECISION, ADD COLUMN "originalPercentage" DOUBLE PRECISION;
-- Preserve every original result before any retakes affect the effective grade.
UPDATE "ExamScore" SET "originalScore" = "score", "originalPercentage" = "percentage";
CREATE TABLE "MakeupExamScore" (
  "id" TEXT NOT NULL,
  "examScoreId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "totalPoints" INTEGER NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL,
  "takenDate" DATE NOT NULL,
  "notes" TEXT,
  "gradedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MakeupExamScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MakeupExamScore_version_check" CHECK ("version" IN (1, 2)),
  CONSTRAINT "MakeupExamScore_points_check" CHECK ("totalPoints" > 0 AND "score" >= 0 AND "score" <= "totalPoints" AND "percentage" >= 0 AND "percentage" <= 100)
);
CREATE INDEX "MakeupExamScore_examScoreId_idx" ON "MakeupExamScore"("examScoreId");
CREATE INDEX "MakeupExamScore_gradedBy_idx" ON "MakeupExamScore"("gradedBy");
ALTER TABLE "MakeupExamScore" ADD CONSTRAINT "MakeupExamScore_examScoreId_fkey" FOREIGN KEY ("examScoreId") REFERENCES "ExamScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupExamScore" ADD CONSTRAINT "MakeupExamScore_gradedBy_fkey" FOREIGN KEY ("gradedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
