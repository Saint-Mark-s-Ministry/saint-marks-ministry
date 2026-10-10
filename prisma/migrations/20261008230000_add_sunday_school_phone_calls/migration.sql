CREATE TYPE "SundaySchoolPhoneCallOutcome" AS ENUM (
  'CONNECTED',
  'LEFT_VOICEMAIL',
  'NO_ANSWER',
  'OTHER'
);

CREATE TABLE "SundaySchoolPhoneCall" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "callerId" TEXT,
  "callerName" TEXT NOT NULL,
  "calledAt" DATE NOT NULL,
  "outcome" "SundaySchoolPhoneCallOutcome" NOT NULL,
  "note" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SundaySchoolPhoneCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SundaySchoolPhoneCall_classId_calledAt_idx"
  ON "SundaySchoolPhoneCall"("classId", "calledAt");
CREATE INDEX "SundaySchoolPhoneCall_childId_calledAt_idx"
  ON "SundaySchoolPhoneCall"("childId", "calledAt");

ALTER TABLE "SundaySchoolPhoneCall"
  ADD CONSTRAINT "SundaySchoolPhoneCall_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "SundaySchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolPhoneCall"
  ADD CONSTRAINT "SundaySchoolPhoneCall_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "SundaySchoolChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolPhoneCall"
  ADD CONSTRAINT "SundaySchoolPhoneCall_callerId_fkey"
  FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
