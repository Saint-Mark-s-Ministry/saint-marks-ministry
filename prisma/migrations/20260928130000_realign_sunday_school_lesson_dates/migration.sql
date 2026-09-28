-- Weekly Sunday School lessons follow SundaySchoolYear, not the separate
-- Servants Prep AcademicYear. Remove only untouched generated rows that fall
-- outside the open Sunday School year; configured historical lessons remain.
DELETE FROM "SundaySchoolWeeklyLesson" AS lesson
USING "SundaySchoolClass" AS class, "SundaySchoolYear" AS school_year
WHERE lesson."classId" = class."id"
  AND class."sundaySchoolYearId" = school_year."id"
  AND school_year."status" = 'OPEN'
  AND (
    lesson."sundayDate" < school_year."startDate"
    OR lesson."sundayDate" > school_year."endDate"
  )
  AND lesson."title" IS NULL
  AND lesson."ownerId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "SundaySchoolWeeklyLessonResource" AS resource
    WHERE resource."weeklyLessonId" = lesson."id"
  );
