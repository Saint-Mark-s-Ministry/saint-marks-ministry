ALTER TABLE "DigitalExamAttempt" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "retakeReady" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "resultReleasedAt" TIMESTAMP(3);
ALTER TABLE "DigitalExamEvent" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
UPDATE "DigitalExamAttempt" a SET "resultReleasedAt" = s."releasedAt"
 FROM "DigitalExamSheet" s WHERE a."examId" = s."examId" AND a.state = 'SUBMITTED' AND s."releasedAt" IS NOT NULL;
CREATE TABLE "DigitalExamAttemptArchive" (
 "id" TEXT NOT NULL PRIMARY KEY, "attemptId" TEXT NOT NULL,
 "attemptNumber" INTEGER NOT NULL, "snapshot" JSONB NOT NULL,
 "approvedBy" TEXT NOT NULL, "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DigitalExamAttemptArchive_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DigitalExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DigitalExamAttemptArchive_attemptId_attemptNumber_key" ON "DigitalExamAttemptArchive"("attemptId", "attemptNumber");
