-- Read-only audit against the database used by the affected deployment.
-- Supply the reported student name with psql -v student_name='Student Name'.
-- Historical lesson records are retained for audit; current async enrollments
-- must never expose these records as applicable lesson attendance.

-- Verify the reported student and lesson dates without returning contact details.
SELECT u.id AS student_id, u.name, e."isAsyncStudent", e."asyncApprovedAt",
       l."scheduledDate" AS lesson_date, a.status AS stored_legacy_status,
       CASE WHEN e."isAsyncStudent" THEN 'ASYNC_ROTATION_NOT_COUNTED'
            ELSE a.status::text END AS expected_lesson_display
FROM "User" u
JOIN "StudentEnrollment" e ON e."studentId" = u.id
JOIN "Lesson" l ON l."scheduledDate" IN (TIMESTAMP '2026-10-02', TIMESTAMP '2026-10-09')
LEFT JOIN "AttendanceRecord" a ON a."studentId" = u.id AND a."lessonId" = l.id
WHERE lower(trim(u.name)) = lower(trim(:'student_name'))
ORDER BY l."scheduledDate";

-- Measure scope across every current async enrollment, including inactive ones.
SELECT COUNT(DISTINCT e."studentId") AS async_students_with_lesson_records,
       COUNT(*) AS legacy_lesson_records,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT') AS legacy_absences,
       COUNT(DISTINCT e."studentId") FILTER (WHERE a.status = 'ABSENT') AS students_with_legacy_absences,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT' AND e."isActive" = true
         AND l."isExamDay" = false AND l.status NOT IN ('CANCELLED', 'NO_CLASS')
         AND (e."asyncApprovedAt" IS NULL OR l."scheduledDate" < date_trunc('day', e."asyncApprovedAt")))
         AS absences_leaking_through_old_date_rule
FROM "StudentEnrollment" e
JOIN "AttendanceRecord" a ON a."studentId" = e."studentId"
JOIN "Lesson" l ON l.id = a."lessonId"
WHERE e."isAsyncStudent" = true;

-- Date-specific scope for the two reported lessons (no student names).
SELECT l."scheduledDate" AS lesson_date,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT') AS legacy_async_absences,
       COUNT(DISTINCT e."studentId") AS async_students_with_records
FROM "StudentEnrollment" e
JOIN "AttendanceRecord" a ON a."studentId" = e."studentId"
JOIN "Lesson" l ON l.id = a."lessonId"
WHERE e."isAsyncStudent" = true
  AND l."scheduledDate" IN (TIMESTAMP '2026-10-02', TIMESTAMP '2026-10-09')
GROUP BY l."scheduledDate"
ORDER BY l."scheduledDate";
