# Year 2 mentor renewal

Moving a student into Year 2 clears their mentor account, mentor name and phone,
and current-year mentor form in the same transaction. Previous mentor assignments
are ended with the promotion reason and retained as history. Assignment-derived
access is recalculated; the mentor keeps access to any other active mentees.
Saving a student who is already in Year 2 does not repeat the reset.

An active or withdrawn Year 2 student's mentor is populated only from their submitted form for
the active academic year. The original application, enrollment fields and previous
account cannot supply a fallback. Until submission, the roster displays **Form
not submitted** and account assignment is unavailable.

Submitting or resubmitting the form records a pending verification and creates a
persistent in-app notification for enabled Servants Prep servants and super admins
who may verify it. Priests and disabled staff receive no review task. The link
opens the student on **Student roster**, where staff can inspect the submitted
name, email and phone and choose **Verify mentor form**. Verification checks the
exact submission version, records the reviewer, clears all staff tasks for that
student/year and clears the student's mentor-information reminder. Resubmission
requires verification again and replaces earlier review notifications.

The submitted mentor contact and assigned app account remain separate: mentors
without an app account can still be submitted and verified. Assignment of an app
account to an active Year 2 student requires a submitted current-year form.

## Late submissions from withdrawn students

Withdrawn Year 2 students can still open Application, submit their current-year
mentor contact details, and upload the signed approval form, including legacy
students without an approved registration record. Submission creates the usual
staff verification notification. Staff can select Withdrawn on Student roster
(or follow the notification) and verify the form there.

Submission alone leaves the student withdrawn and excluded from attendance.
When staff verify a pending form, the same transaction reactivates a withdrawn
Year 2 enrollment, returning the student to the active attendance sheet on its
next load. Existing attendance records and the attendance start date are retained.
A stale or rejected verification cannot reactivate the student. Re-reviewing an
already verified form does not undo a later withdrawal, and graduated students
are never reactivated by this flow. No database migration is required.

## Existing records before deployment

No schema change or scheduled task is needed. Before deploying, take the normal
backup and preview the one-time repair for carried-over assignments:

```sh
bun scripts/reset-unsubmitted-year-two-mentors.ts
```

Using the intended database connection, apply the reviewed repair with:

```sh
bun scripts/reset-unsubmitted-year-two-mentors.ts --apply
```

The preview returns only a count and writes nothing. Applying clears mentor
details and ends assignment access only for active Year 2 enrollments without an
annual mentor submission in the active year. Submitted forms, other students,
assignment history and registration history are retained. The transaction is
serializable; a concurrent change aborts the repair rather than clearing a newly
submitted form. Re-running the repair is a no-op. Production data is never used
by the automated tests.

## Validation

The opt-in database suite requires `SP_DATABASE_URL`,
`SP_DATABASE_URL_UNPOOLED` and `MENTOR_RENEWAL_TEST_DATABASE_URL` to point to an
isolated PostgreSQL schema named `mentor_renewal_test` on `127.0.0.1`, prepared
with the current Prisma schema. It clears that schema's fixtures between tests.

```sh
RUN_MENTOR_RENEWAL_DB_TESTS=1 bun test:run __tests__/integration/year-two-mentor-renewal.test.ts
```

## Signed approval form uploads

Application accepts any file format, including iPhone HEIC/HEIF photos, PDFs,
Office documents and files without a reported MIME type, up to 100 MB. New pages
request an authenticated, short-lived token for a server-generated pathname,
upload directly to Vercel Blob (multipart above 4 MB), then ask the API to verify
and save the uploaded reference. Only small JSON requests reach the application
server, avoiding Vercel's 4.5 MB request-body limit. The existing Blob read/write
configuration is reused; no schema or environment-variable change is required.

Token generation and completion both recheck application/annual-mentor
eligibility, including withdrawn Year 2 students. Tokens allow only one random
pathname, cannot overwrite existing blobs, and require an octet-stream content
type. Completion resolves the pathname in our own Blob store, checks ownership,
size and content type, and saves the provider's download URL and original display
filename. Arbitrary formats are downloaded rather than rendered as active content.
A failed upload or verification leaves the previous saved form intact. Uploading
alone does not verify the mentor information or reactivate the student.

The old multipart API remains for previously opened pages, with a 4 MB file cap
and a refresh instruction for larger files. New pages accept 100 MB directly.
Non-JSON hosting errors, expired sessions and invalid success responses produce
an actionable message rather than Safari's vague JSON parsing error. The exact
reported incident could not be confirmed without its file or request details;
regression tests simulate that Safari error and non-JSON hosting responses.

Before production release, check an authenticated iPhone upload/replacement of
HEIC and PDF files, including a file above 4.5 MB, and download the saved form as
staff. Check failed upload retry and withdrawn-student submission as well.

## Staff corrections

Enabled Servants Prep servants and Super Admins can select **Edit mentor form**
on the Year 2 student roster or the student record. The record also offers the
editor for students with an approved original registration. Staff can submit
missing current-year mentor details, correct the mentor name/phone/email, and
replace the signed approval form. The upload accepts the same file types and
100 MB limit as student uploads and keeps the previous file if saving fails.
The assigned mentor app account remains managed by its separate account picker.

The staff API resolves current role tags from the database, blocks View as,
disabled/read-only actors and priests, and requires an existing Prep enrollment
with an approved application or an eligible annual requirement. This grants no
Sunday School authority. GET returns a version covering the source application,
annual submission and enrollment; stale contact saves/uploads return 409.
Staff changes are recorded in AuditEvent. Contact, enrollment display fields,
review notifications and audit data commit together.

A current-year staff correction (including replacing an existing annual form's
file) resets verification and queues the new version for the usual review.
Staff must verify it separately; only that existing approval route can restore
a withdrawn Year 2 student to active attendance. Updating a form never changes
status, isActive, mentor account assignments or role grants. File-only uploads
before any annual contact submission still require the contact fields to be
submitted before verification. No additional migration is required for this flow.
