# Five more Sunday School guides

This change expands the signed-in Guides library from four to nine tutorials.
It adds videos, English captions, posters, written steps, troubleshooting, and
contextual Watch guide links for:

- Learning names with photo flashcards.
- Publishing Elementary homework and saving completion.
- Collecting missing phone numbers with Contact update QR.
- Setting memorization and saving scores out of 100.
- Subscribing to class lesson dates and birthdays.

No database migration or environment change is required. The videos show the
current desktop website with fictional records. The production application is
`https://stmarkministry.app`; recorded calendar and roster tokens were created
only for a disposable rehearsal class on an isolated database branch and are
not production access links. Temporary capture settings are not shipped.

## Draft What’s new copy

Add this under the actual deployment date when preparing the combined release;
do not change the published November 10 history or imply a deployment date from
the feature commit date.

> Five more Sunday School guides show how to learn children’s names, publish
> Elementary homework, collect missing phone details with a QR, save memorization
> scores, and add lesson dates and birthdays to your calendar. Each includes a
> short captioned video and written steps. Watch guide links open the relevant
> tutorial from the page you are using.

## Review

Use `/dashboard/guides` and its nine permanent anchors. English captions and
on-screen captions are available for every video. These are desktop website
videos; the written phone notes remain available while native-app videos wait
for the iOS release.

Confirm the planned date in the weekly release’s What’s new entry before merging
that release into `main`. Rolling back application code restores the previous
four-guide library; no data rollback is needed.
