# Weekly deployments

Collect each week's changes on a dated release branch and review them in one
master pull request into `main`. Keep the master PR in draft while work is being
added. Merging the master PR into `main` is the production release step; do not
merge it while preparing or testing the week's changes.

## Branches and pull requests

- Name the weekly branch `release/YYYY-MM-DD`, using the Monday that starts
  the release week. This week's branch is `release/2026-10-19` for October 19–25.
- Open one draft master PR from that branch into `main`, using the
  [weekly release template](../.github/PULL_REQUEST_TEMPLATE/weekly-release.md).
- Base new feature and fix branches on the weekly branch. Target their PRs at
  that release branch, and merge reviewed changes there throughout the week.
- Update the master PR's included-changes list when a feature PR is merged.
  Changes still under review do not count as included.
- Review and test the combined release branch. Individual feature checks do
  not replace validation of the final combined code.
- Keep production configured to deploy from `main`; use release/feature branches
  for previews. Production releases go through the weekly master PR.

The regular deployment day and time are pending a team decision. The weekly
window is Monday through Sunday; no automatic merge or deployment is configured
by this workflow.

## Preparing a release

1. Confirm the included changes and defer unfinished work to the next week.
   Add a plain-language **What’s new** entry for the week's user-visible
   changes in `lib/release-notes.ts`, using the actual deployment date. Follow
   [the release-note workflow](release-notes.md); keep technical details in the
   PR and internal documentation. History starts with this next deployment.
2. Resolve conflicts with current `main`, if needed. Re-run checks after changes.
3. Run the repository checks on the final release head:
   `bunx tsc --noEmit`, `bun lint`, and `bun test:run`. Confirm the intended
   Vercel preview builds and review the affected flows there.
4. Record schema and configuration requirements in the master PR. Builds must
   never apply database migrations. Follow the existing isolated-branch and
   backup procedure in [AGENTS.md](../AGENTS.md) and the applicable migration
   runbook for any database change.
5. Confirm a rollback plan: retain the previous known-good production
   deployment and identify any database changes that would affect rollback.
6. Have the release owner review the final diff and approve the deployment.
   Mark the master PR ready and merge into `main` on the chosen release day.
7. Verify production deployment status, `/api/health`, and the affected flows.
   Record the deployed commit and validation result in the master PR.

## Starting the next week

After the release, create the next dated release branch from the updated `main`
and open a new draft master PR. Rebase or retarget unfinished feature work onto
that branch and carry its tracking entries forward. Do not keep using a merged
weekly master PR for a new deployment.

## Urgent fixes

When a fix cannot wait for release day, use a separately reviewed hotfix PR into
`main`. After deployment, merge the updated `main` into the active weekly branch
and validate the combined changes so the next weekly release retains the fix.

## Current release schema checklist

PR #289’s combined schema requirements, production audit, and ordered rollout
are recorded in [the October 19–25 release checklist](releases/2026-10-19.md).
Use `bun scripts/check-release-schema.ts` for a read-only migration/column/enum
preflight before and after applying the committed migration bundle.
