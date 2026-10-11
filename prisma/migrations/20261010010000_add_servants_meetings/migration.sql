-- CreateTable
CREATE TABLE "SundaySchoolServantsMeeting" (
    "id" TEXT NOT NULL,
    "ageGroupId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SundaySchoolServantsMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SundaySchoolMeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "servantId" TEXT NOT NULL,
    "status" "SundaySchoolServantAttendanceStatus" NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SundaySchoolMeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SundaySchoolServantsMeeting_academicYearId_idx" ON "SundaySchoolServantsMeeting"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ss_servants_meeting_group_year_date" ON "SundaySchoolServantsMeeting"("ageGroupId", "academicYearId", "date");

-- CreateIndex
CREATE INDEX "SundaySchoolMeetingAttendance_servantId_idx" ON "SundaySchoolMeetingAttendance"("servantId");

-- CreateIndex
CREATE INDEX "SundaySchoolMeetingAttendance_recordedBy_idx" ON "SundaySchoolMeetingAttendance"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "SundaySchoolMeetingAttendance_meetingId_servantId_key" ON "SundaySchoolMeetingAttendance"("meetingId", "servantId");

-- AddForeignKey
ALTER TABLE "SundaySchoolServantsMeeting" ADD CONSTRAINT "SundaySchoolServantsMeeting_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "SundaySchoolAgeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolServantsMeeting" ADD CONSTRAINT "SundaySchoolServantsMeeting_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolMeetingAttendance" ADD CONSTRAINT "SundaySchoolMeetingAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "SundaySchoolServantsMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolMeetingAttendance" ADD CONSTRAINT "SundaySchoolMeetingAttendance_servantId_fkey" FOREIGN KEY ("servantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SundaySchoolMeetingAttendance" ADD CONSTRAINT "SundaySchoolMeetingAttendance_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
