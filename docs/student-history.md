# Sunday School student history from names

Saved child names in Sunday School staff views open a read-only dialog with
Attendance, Notes, and Visitations tabs. The current page stays mounted, so
filters, scroll position, and unsaved attendance marks survive. Closing the
history restores focus to the name that opened it.

`StudentHistoryProvider` is mounted only in `app/dashboard/servants/layout.tsx`.
Servants Prep retains its normal name links, student details, grading, mentor
views, and command-palette behavior. There is no Prep history endpoint.

Use `StudentName` from `components/student-history-provider.tsx` for Sunday
School child names, passing the child's record ID rather than looking up a
student by their displayed name. The history target and response types accept
only the Sunday School program. Draft imports and registration applications
are not child records yet.

The provider loads the dialog on demand. `lib/swr.ts` keys history by child ID
and signed-in viewer. Opening a dialog revalidates access; denied responses
hide retained data. The panel retains the SP Student badge for linked children
and resolves photos from the Sunday School photo, then the linked account.
These display details do not grant access to Prep records.

## Data and authorization

- `GET /api/sunday-school/children/[id]/history` reloads the viewer's role and
  disabled state, resolves Sunday School assignments, and checks the child's
  current class. Each historical attendance, visitation, and phone-call query
  also filters by the viewer's visible classes. A child moving classes does
  not expose records from unrelated classes. Guardian contacts are omitted.
- Attendance rates use saved marks, with half credit for late marks. Excused
  and unrecorded meetings do not affect the denominator.
- General notes use the existing roster text field. Confidential pastoral
  notes use the separate existing `/priest-notes` endpoint and its
  author/priest checks. Super Admins and View as sessions cannot read them.
  The main history payload never includes confidential notes.

All data comes from existing tables. This feature requires no migration or
database update and does not introduce note revision history.

Route and component tests cover class scope, confidential-note restrictions,
linked-account badges and photos, duplicate names, lazy loading, failures,
focus restoration, and preservation of unsaved attendance marks.
