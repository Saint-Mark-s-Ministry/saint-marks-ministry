## Release window

Week: MM-DD-YYYY through MM-DD-YYYY
Branch: `release/MM-DD-YYYY` → `main` (US date format; Monday of the release week)
Release owner: TBD
Deployment day/time: TBD

Keep this PR in draft while collecting changes. Merge into `main` only when the
weekly release is approved. See `docs/weekly-deployments.md` for the workflow.

## Included changes

List merged feature/fix PRs or commits already present on this release branch.

- [ ] Add change, source PR, and the resulting user behavior.

## Pending or deferred

List work that is not included yet. Move unfinished work to the next week.

## Release validation

- [ ] Final scope and combined diff reviewed.
- [ ] Client-facing What’s new entry covers the shipped changes and uses the actual deployment date.
- [ ] TypeScript, lint, and full tests pass on the final release head.
- [ ] Intended preview deployment builds and affected flows are checked.
- [ ] Schema migrations and configuration requirements are documented, or none are needed.
- [ ] Rollback plan and previous known-good production deployment are identified.
- [ ] Release owner approves the final head for production.

## Database and configuration

Describe required steps, or write “None.” Builds never apply database migrations.

## After deployment

- [ ] Production deployment is ready; deployed commit recorded below.
- [ ] `/api/health` and affected production flows verified.

Deployed commit:
Validation result:
