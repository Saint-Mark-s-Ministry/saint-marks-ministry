# Student history from names

Saved student names in staff views open one shared, read-only dialog with
Attendance, Notes, and Visitations tabs. The current page stays mounted, so
filters, scroll position, and unsaved attendance or grading drafts survive.
Closing the dialog restores focus to the name that opened it.

Use `StudentName` from `components/student-history-provider.tsx` for a name,
or supply `studentId` and an optional `program` to `PersonCell`. The program
defaults to `prep`; Sunday School children must use `sunday-school`. Always
pass the record ID, never look up a student by their displayed name. Draft
imports and registration applications are not student records yet.

The app-level `StudentHistoryProvider` loads the dialog on demand. `lib/swr.ts`
keys history by program, record ID, and signed-in viewer. Opening a dialog
revalidates access; denied responses hide retained data. Names inside another
interactive control must be separated into their own button, as in the exam
monitor and attendance-slips list.

## Data and authorization

- `GET /api/students/[id]/history` uses the current database authorization
  context's Prep student scope. Administrators and priests may read Prep
  histories; mentors are limited to their assigned students. It returns only
  the fields the dialog needs, including enrollment notes and authored notes.
- Current async students use elapsed serving-rotation weeks, never lesson
  attendance. In-person rates use half credit for late marks and exclude
  excused, N/A, exam-day, and cancelled lessons.
- `GET /api/sunday-school/children/[id]/history` reloads the viewer's role and
  disabled state, resolves Sunday School assignments, and checks the child's
  current class. Each historical attendance, visitation, and phone-call query
  also filters by the viewer's visible classes. A child moving classes does
  not expose records from unrelated classes. Guardian contacts are omitted.
- Confidential pastoral notes use the separate existing `/priest-notes`
  endpoint and its author/priest checks. Super Admins and View as sessions
  cannot read them. The main history payload never includes those notes.
- Prep and Sunday School records remain independent. Prep's Visitations tab
  explains that visitation records belong to Sunday School; linked accounts
  do not merge the two programs or grant additional access.

All data comes from existing tables. This feature requires no migration or
database update. Sunday School's general notes remain the existing roster text
field; this feature does not introduce note revision history.

Route and component tests cover scopes, confidential-note restrictions, async
attendance, duplicate names, lazy loading, failures, focus, and draft preservation.
