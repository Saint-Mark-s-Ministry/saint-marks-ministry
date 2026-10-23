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

// Confirm this entry's date when the weekly release is deployed.
export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-10-23',
    date: '2026-10-23',
    title: 'A simpler Sunday School experience',
    summary: 'Find your weekly tasks, follow up with children, and prepare lessons with fewer steps.',
    changes: {
      new: [
        'Assign each child a servant for check-ins from Care. Filter to your children and see whose phone call has been logged this week.',
        'Practice children’s names with photo flashcards from Children. Reveal each name, track your progress, and review the names you’re still learning.',
        'Create a Contact update QR from Children so your class can add missing child or parent phone numbers. Existing contacts stay protected. QR links expire after two hours.',
        'Subscribe to your class’s lesson calendar from Lessons to see its schedule in Apple Calendar, Google Calendar, or Outlook. Optionally add Coptic.io’s church calendar for feasts, fasts, and seasons.',
        'Sunday School Home brings together your next lesson, attendance, homework where available, and children who need follow-up. Coordinators can see which classes need attention.',
        'Care brings together children who have missed several meetings, priority visits, calls, and birthdays.',
        'What’s new keeps updates for Sunday School and Servants Prep in one place.',
      ],
      improved: [
        'Dialogs animate smoothly when opening, closing and resizing, with reduced-motion support. Tap a child’s profile photo to enlarge it.',
        'Sunday School is organized around Home, Attendance, Children, Care, and Lessons. Pick your class once and every page follows it.',
        'Take children’s attendance with recent attendance dots, meeting date arrows, and a button to mark everyone else present. Finish saves the meeting and marks unmarked children absent.',
        'Prepare lessons from a calendar on a computer or an upcoming lesson list on a phone, and volunteer to teach with one tap.',
        'Open a child’s centered profile window to review family details, attendance, visits, calls, and notes in one place.',
        'Sunday School attendance charts distinguish children who attended from attendance records, and leave gaps when attendance has not been recorded.',
        'Sunday School family details are matched by complete parent phone numbers, with differing details preserved for each child.',
      ],
      fixed: [
        'If your account access changes while the app is open, you are returned to sign in instead of getting stuck on a loading screen.',
        'Servants can check in only for themselves. Only people authorized to manage the meeting can mark attendance for others.',
      ],
    },
  },
]

export function newestReleasesFirst(releases: readonly ReleaseNote[]): ReleaseNote[] {
  return [...releases].sort((a, b) => b.date.localeCompare(a.date))
}
