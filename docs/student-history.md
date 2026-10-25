# Sunday School student history from names

Saved child names in Sunday School staff views open a read-only dialog with
Profile, Attendance, Notes, and Visitations tabs. The Profile tab opens first
and shows student details, student contact, family/guardian contacts, and the
household address. Contact values open the existing call, message, email,
copy, and directions actions. The current page stays mounted, so
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
  not expose records from unrelated classes. Profile contacts are returned only
  inside this authorized
  `/children/[id]/history` response, with an explicit selection of contact
  fields. Family relations do not include siblings or unrelated records. The
  child’s phone takes priority over the linked account’s phone; the linked
  account also supplies the student email. Summary endpoints and the command
  palette do not return these contacts.
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

## The iOS app

The native app opens the same Sunday School history from a saved child's name,
as a read-only sheet over the current screen (`app/student-history/[id].tsx`).
It calls `GET /api/sunday-school/children/[id]/history`; the response types are
shared with web through `@stmark/contracts` (`StudentHistory`).

- **Where:** Roster, Visitations (list and a record), Search results, Homework,
  Birthdays and Home birthdays, and Take attendance. Where a row already has a
  tap (it opens a profile or record), history is a separate clock button beside
  it; where the name stands alone it is the control. In Take attendance the name
  opens history and the line under it edits the note, apart from the
  Present / Late / Absent buttons.
- **State is kept:** the sheet is pushed over the screen, which stays mounted,
  so filters, scroll, the selected class and date, and unsaved attendance or
  grading marks are exactly as they were when it closes.
- **Identity:** the route carries the child's ID and the program; the name is a
  loading placeholder only. An answer for another ID or program is never shown.
- **Access:** the cache key is viewer + program + ID (`useResource` takes a
  scope). Opening revalidates; a 403 or 404 clears the cached answer instead of
  keeping it on screen. Accounts without Sunday School access are not offered
  the control.
- **Scope of the sheet:** Attendance, Notes and Visitations (with phone calls).
  Guardian and family contacts, and confidential pastoral notes, are not
  rendered; the child's profile screen has the contacts behind its own check.
- **Servants Prep:** there is no Prep history endpoint, so Prep name links,
  grading and mentor views are unchanged.
