/** One entry per deployment, using its actual deployment date (YYYY-MM-DD).
 * Add reviewed, user-facing notes here as part of the weekly release.
 * See docs/release-notes.md for the publishing workflow and an example.
 */
export interface ReleaseNote {
  id: string
  date: string
  title: string
  summary: string
  changes: {
    new?: string[]
    improved?: string[]
    fixed?: string[]
  }
}

// History starts with the next deployment; Git commit dates are not release dates.
export const releaseNotes: ReleaseNote[] = []

export function newestReleasesFirst(releases: readonly ReleaseNote[]): ReleaseNote[] {
  return [...releases].sort((a, b) => b.date.localeCompare(a.date))
}
