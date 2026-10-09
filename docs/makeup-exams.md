# Makeup exam scheduling

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
existing exam score flow: edit the existing score for a retake, or add a score
for a previously missed exam. A booking never changes an exam score or graduation
calculations.

## Database rollout

The additive migration is
`prisma/migrations/20261009120000_add_makeup_exam_bookings/migration.sql`.
It creates one booking per student/exam and enforces Friday dates. Generate
the Prisma client before deploying the code. Apply the migration as a separate
database deployment step, following the repository's isolated Neon branch
and backup procedure. Builds do not apply it automatically.

Validation in this change: full application typecheck, lint, test suite,
and migration against an isolated local PostgreSQL database. The migration
still needs validation on an isolated branch of the actual Neon project before
production rollout. Production has not been modified.
