# Five more Sunday School guides

This change expands the signed-in Guides library from four to nine tutorials.
It adds videos, English captions, posters, written steps, troubleshooting, and
contextual Watch guide links for:

- Learning names with photo flashcards.
- Publishing Elementary homework and saving completion.
- Collecting missing phone numbers with Contact update QR.
- Setting memorization and saving scores out of 100.
- Subscribing to class lesson dates and birthdays.

The guides themselves need no database migration or environment change. The
combined other-church feature requires `20261111131500_child_other_church` before
production deployment; it adds `attendsOtherChurch` and `otherChurchName` to
`SundaySchoolChild`. The videos show the
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
four-guide library. The additive church fields can remain when rolling back
application code.


## Combined local review

The review also includes the other-church marker, optional church name/location,
and a tag beside the child’s name from PR #334. This is family-reported information
and does not change a child’s class, attendance, enrollment, or account access.

Local testing uses a separate PostgreSQL copy of production with the additive
migration applied. Existing account passwords and roles are preserved in the
copy. Only the local copy receives test edits; production is read-only during
copying. The local environment file is ignored by Git. Email delivery remains
in sandbox mode, without an email API key.

Review the combined guides, other-church, and web passkey changes at
`http://localhost:3212`:

1. Sign in with your existing email and password.
2. Open Children and edit a child in a class you can serve.
3. Mark Attends another church, add a name/location if known, save, and reload.
4. Check the tag beside the child’s name, including the church name; name search
   continues to work as before.
5. Clear the marker and save; the old church name should clear too.
6. Open Guides or use Watch guide. Check all nine entries and the five new
   captioned desktop videos.
7. Open My account → Passkeys. Add a named passkey, sign out, and use Sign in
   with a passkey. Remove it from My account and confirm password sign-in still
   works. Use a browser/device that supports passkeys; local credentials belong
   to `localhost` and do not sign in to the production domain.

This review includes web PR #244's passkey visibility, retry, and configuration
diagnostics, plus secure setup-cookie cleanup after configuration normalization.
The existing passkey tables are present in the local copy. These changes need
no new passkey migration. Production still needs valid passkey environment
settings and the deployment checks in `docs/passkeys.md`; this local review does
not enable production passkeys. The separate native iOS PR #308 is not included.

At the release owner's request, the combined PR targets `main` directly. It has
not been merged or deployed by the agent.

Local test edits are not copied back to production. For the release’s What’s new
entry, also include: “Sunday School servants can note that a child attends another
church and see that church’s name in a tag beside the child’s name.”
Also include: “My account now keeps Passkeys visible and offers a retry when
passkey setup is unavailable.”
