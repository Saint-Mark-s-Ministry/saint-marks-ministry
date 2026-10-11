# Makeup exams

Students access **Makeup Exams** from their dashboard, navigation, or command
palette. They select an upcoming Friday and a failed or missed exam, then save. Failed exams appear first, with the
current percentage and the section's passing percentage. Saving
again for the same exam reschedules the existing booking. Students can cancel
future bookings. Bookings persist after the Friday as history.

The calendar offers the next 12 Fridays after the current New York calendar
day. It does not define times, locations, capacity limits, blackout dates, or
an approval workflow. An exam must be before today and either have no score for the
student or a percentage below its section's `passingScore`. A score equal to
or above that threshold is passing and cannot be scheduled. Eligibility is
checked again on save, so a newly passing grade prevents another booking. Active enrollment is required. Year 1 students see Year 1 and shared
exams; Year 2 students also see failed or missed Year 1 exams. Academic years before
the enrollment's starting academic year are excluded. If that year is unknown,
only exams in the active academic year are offered.

Prep administrators and priests see bookings on **Exam Management**, ordered
by Friday with the student's name and email. Recording makeup scores uses the
exam's separate **Makeup exam scores** section. Choose the student, version 1
or 2, date taken, score, and total points. Notes are optional. Each attempt is
preserved separately and can be corrected with **Edit**. A failed retake can
be followed by another attempt, including the other version. Staff do not need
a scheduling record to grade a historical retake.

The original grade is preserved in `ExamScore.originalScore` and
`originalPercentage`. `ExamScore.score` and `percentage` hold the highest
percentage from the original grade and all makeup attempts, normalized onto
the original exam's point scale. Existing student, mentor, dashboard, and
graduation queries therefore use one effective result per exam. A lower
retake does not reduce the effective score. Correcting either an original
grade or a makeup grade recalculates the best result atomically. The original
score editor shows only the original grade. A missed exam may have a makeup
result with no original grade. Passed exams are not eligible for new makeup
attempts, but prior attempts remain editable.

The new additive migration `20261009130000_add_makeup_exam_scores` adds the
original-grade fields, backfills them from existing results without changing
those results, and creates the separate `MakeupExamScore` attempt table. It
must be applied before deploying the grading screens. The score-table
constraints allow versions 1 and 2 and enforce valid points and percentages.

## Database rollout

Booking migration `20261009120000_add_makeup_exam_bookings` creates one
booking per student/exam and enforces Friday dates. Grading migration
`20261009130000_add_makeup_exam_scores` preserves original grades and adds
versioned makeup attempts. Generate the Prisma client before deploying the
code. Apply committed migrations as a separate database deployment step,
following the repository's isolated Neon branch and backup procedure. Builds
do not apply migrations automatically.

The grading migration was rehearsed on an isolated Neon branch copied from
production. Existing score counts and values remained unchanged, original
fields were backfilled correctly, both versions and grade corrections were
verified in a rolled-back transaction, and the migrated schema matched Prisma.
The grading migration has not been applied to production.
