-- CreateEnum
CREATE TYPE "DigitalExamState" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DigitalAttemptState" AS ENUM ('ACTIVE', 'PAUSED', 'SUBMITTED');

-- CreateTable
CREATE TABLE "DigitalExamSheet" (
    "examId" TEXT NOT NULL,
    "state" "DigitalExamState" NOT NULL DEFAULT 'DRAFT',
    "choiceCounts" INTEGER[],
    "answerKey" TEXT[],
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalExamSheet_pkey" PRIMARY KEY ("examId")
);

-- CreateTable
CREATE TABLE "DigitalExamAttempt" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "state" "DigitalAttemptState" NOT NULL DEFAULT 'ACTIVE',
    "answers" TEXT[],
    "sessionHash" TEXT NOT NULL,
    "pageVisible" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "correctCount" INTEGER,

    CONSTRAINT "DigitalExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalExamEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "clientEventId" TEXT,
    "clientAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalExamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigitalExamAttempt_examId_state_idx" ON "DigitalExamAttempt"("examId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalExamAttempt_examId_studentId_key" ON "DigitalExamAttempt"("examId", "studentId");

-- CreateIndex
CREATE INDEX "DigitalExamEvent_attemptId_createdAt_idx" ON "DigitalExamEvent"("attemptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalExamEvent_attemptId_clientEventId_key" ON "DigitalExamEvent"("attemptId", "clientEventId");

-- AddForeignKey
ALTER TABLE "DigitalExamSheet" ADD CONSTRAINT "DigitalExamSheet_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalExamAttempt" ADD CONSTRAINT "DigitalExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "DigitalExamSheet"("examId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalExamAttempt" ADD CONSTRAINT "DigitalExamAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalExamEvent" ADD CONSTRAINT "DigitalExamEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DigitalExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

