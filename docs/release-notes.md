# Weekly release notes

**What’s new** is available to every signed-in user from the desktop sidebar,
the phone **More** menu, and search. Servants Prep uses `/dashboard/whats-new`;
Sunday School uses `/dashboard/servants/whats-new`. Both render the same history
and retain the surrounding ministry navigation.

History starts with the next deployment. Past commits have deliberately not
been presented as deployed releases.

## Publishing a weekly update

1. While preparing a deployment, review the changes since the previous release
   and add one entry to `releaseNotes` in `lib/release-notes.ts` in the same code
   change. Use the actual planned deployment date; adjust it if the release moves.
2. Write short, user-facing notes under `new`, `improved`, and/or `fixed`. Name
   the affected ministry or audience when a change applies to only one group.
   Omit empty sections and internal refactors with no user-visible effect.
   The page is strictly client-facing: describe what people can do and what
   improved, using plain language. Keep deployment details, commit references,
   infrastructure, database changes, and publishing instructions out of the UI
   and release-note content. Technical instructions belong only in this document.
3. Use a unique, stable `id` (for example, `2026-10-25`) and a `YYYY-MM-DD` date.
   Multiple deployments on one day can use IDs such as `2026-10-25-2`.
4. Check the notes on both routes and ship them through the existing Vercel
   deployment. Notes are bundled with the application; no database migration,
   runtime Git access, or separate publishing step is needed.

Example format (illustrative only; replace with verified release details):

```typescript
export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-10-25',
    date: '2026-10-25',
    title: 'Weekly ministry update',
    summary: 'A short summary of this week’s changes.',
    changes: {
      new: ['A description of a new feature and who can use it.'],
      improved: ['A description of an improvement to an existing workflow.'],
      fixed: ['A description of a resolved user-visible issue.'],
    },
  },
]
```

The page orders entries newest first and marks the first as **Latest update**.
Each release title links to its anchor for sharing within the portal.
Only include shipped changes; keep draft notes outside the published array.
Do not include credentials, personal records, or confidential ministry details.

This is an editorial step in the deployment workflow. It does not automatically
infer releases from Git commits or run a scheduled publishing job.
The [weekly deployment workflow](weekly-deployments.md) and
[release PR template](../.github/PULL_REQUEST_TEMPLATE/weekly-release.md) include
this step before production approval.
