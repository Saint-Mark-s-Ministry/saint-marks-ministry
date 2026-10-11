CREATE TABLE "MakeupExamBooking" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MakeupExamBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MakeupExamBooking_friday_check" CHECK (EXTRACT(ISODOW FROM "scheduledDate") = 5)
);
CREATE UNIQUE INDEX "MakeupExamBooking_studentId_examId_key" ON "MakeupExamBooking"("studentId", "examId");
CREATE INDEX "MakeupExamBooking_scheduledDate_idx" ON "MakeupExamBooking"("scheduledDate");
CREATE INDEX "MakeupExamBooking_examId_idx" ON "MakeupExamBooking"("examId");
ALTER TABLE "MakeupExamBooking" ADD CONSTRAINT "MakeupExamBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupExamBooking" ADD CONSTRAINT "MakeupExamBooking_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
