# Servants Prep attendance autosave

The Prep roll call saves edited students after 600 ms without further edits.
Status, arrival time, notes and conduct changes use the existing batch endpoint.
A save leaves the lesson open. Only **Finish attendance** fills unmarked students
in the current filtered view as absent and returns to the lesson list. Finish
also flushes pending edits made before changing the current search or filters.
Sunday School retains its existing autosave and Finish behavior.

Each account and lesson has its own recovery draft in browser storage. Only
unsent student IDs and attendance fields are stored, without names or contact
information. Acknowledged edits are removed from storage. A newer edit made
while a request is running keeps its own pending save. Navigation aborts the
old view's requests, and an old response cannot update another lesson or account.
Recovered drafts are filtered to the current roll call and require review before
sending. Storage failures preserve in-memory edits and warn before closing.
When supported, browser locks prevent editing the same lesson in two tabs for
the same account.

Connectivity failures retain pending edits and retry on reconnection or after
five seconds. Authorization and validation errors require a deliberate retry.
The server checks the expected account and rechecks active in-person enrollment,
so withdrawn, graduated, unenrolled and async students are excluded even if a
stale roll call still shows them. A Finish save that excludes a stale student
stays open for review. Read-only and future-lesson views cannot write.

Whole-lesson mentor notifications run on Finish (and older manual clients),
not on every autosave. A new conduct removal still sends its notification.
The latest recorder and timestamp come from the acknowledged server save.
No database migration or configuration change is needed.
