CREATE TABLE "SundaySchoolAttendanceCheckIn" (
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "SundaySchoolAttendanceCheckIn_pkey" PRIMARY KEY ("sessionId")
);
CREATE UNIQUE INDEX "SundaySchoolAttendanceCheckIn_tokenHash_key" ON "SundaySchoolAttendanceCheckIn"("tokenHash");
ALTER TABLE "SundaySchoolAttendanceCheckIn" ADD CONSTRAINT "SundaySchoolAttendanceCheckIn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SundaySchoolSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolChildAttendance" ADD COLUMN "selfCheckedInAt" TIMESTAMP(3);
CREATE TABLE "SundaySchoolAttendanceCheckInRequest" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "approved" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SundaySchoolAttendanceCheckInRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SundaySchoolAttendanceCheckInRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SundaySchoolSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SundaySchoolAttendanceCheckInRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "SundaySchoolChild"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SundaySchoolAttendanceCheckInRequest_sessionId_childId_key" ON "SundaySchoolAttendanceCheckInRequest"("sessionId", "childId");
CREATE INDEX "SundaySchoolAttendanceCheckInRequest_sessionId_reviewedAt_idx" ON "SundaySchoolAttendanceCheckInRequest"("sessionId", "reviewedAt");
