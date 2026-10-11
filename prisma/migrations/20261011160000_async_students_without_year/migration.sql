BEGIN;

ALTER TABLE "StudentEnrollment" ALTER COLUMN "yearLevel" DROP NOT NULL;
ALTER TABLE "SundaySchoolAssignment" ALTER COLUMN "yearLevel" DROP NOT NULL;

UPDATE "StudentEnrollment" SET "yearLevel" = NULL WHERE "isAsyncStudent";
-- Serving rotations belong to academic years, not prep cohort years.
UPDATE "SundaySchoolAssignment" SET "yearLevel" = NULL;

ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_attendance_mode_year_check"
  CHECK (("isAsyncStudent" AND "yearLevel" IS NULL)
    OR (NOT "isAsyncStudent" AND "yearLevel" IS NOT NULL));

COMMIT;
