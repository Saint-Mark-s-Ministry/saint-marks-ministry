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
    id: '2026-11-12',
    date: '2026-11-12',
    title: 'More guides, church tags, and clearer passkey setup',
    summary: 'Learn more Sunday School tasks with step-by-step videos, see a child’s other church beside their name, and find passkey setup in My account.',
    changes: {
      new: [
        'Five new Sunday School guides cover learning children’s names, publishing Elementary homework, collecting phone details with Contact update QR, saving memorization scores, and subscribing to class lesson dates and birthdays. Each includes a captioned video, written steps, and help for common questions.',
        'Sunday School servants can mark that a child attends another church and optionally enter its name or location. A tag beside the child’s name shows the church when known. Edit the child to update or clear it.',
      ],
      improved: [
        'Watch guide links open the relevant tutorial from Children, Homework, Memorization, and the calendar subscription controls.',
        'My account keeps Passkeys visible, shows when setup is unavailable, and offers Check again. When passkeys are available, you can add one after signing in; your password and Google sign-in remain available.',
      ],
    },
  },
  {
    id: '2026-11-10',
    date: '2026-11-10',
    title: 'Easier attendance, readings, and class follow-up',
    summary: 'Watch the new guides, check in with your class QR, find the right readings, and organize your roster on your phone.',
    changes: {
      new: [
        'Guides brings short captioned videos and written steps into the portal: adding lesson materials, using QR attendance, taking weekly attendance, and following up with your class. Watch guide links take you there from Lessons, Attendance, and Care.',
        'Sunday School servants can display a separate attendance QR for each class meeting. Children enter their first and last name. Servants confirm requests from children who are there before attendance is marked.',
        'QR check-in is available from 10:30 a.m. to 12:30 p.m. on Saturdays and 11:30 a.m. to 1:30 p.m. on Sundays, in New York time. Codes change for every class meeting and close when attendance is finished.',
        'A QR check-in badge shows which attendance marks came from confirmed classroom scans. Servants can review and correct marks.',
        'Trip and event organizers can open the church payment-link creator from the bottom of Sunday School Home.',
      ],
      improved: [
        'Sunday School guides have sharper video, a consistent desktop window, and hand-drawn callouts that guide you through each action. Start one guide and any other playing guide pauses automatically.',
        'Sort Visitations by first or last name. The Children roster’s sorting control is also available on phones, with matching search and sorting controls.',
        'Larger student photos make Servants Prep attendance roll call easier on computers and phones. Tap a photo to enlarge it.',
      ],
      fixed: [
        'Lessons page actions use matching button sizes and a full-width layout on phones.',
        'Lesson saves ignore unused blank link rows, identify incomplete links, keep the editor open while saving, and show the confirmed saved lesson without a second refresh.',
        'Sunday and Holy 50s readings now appear with matching day names. Holy Week readings remain unavailable from our calendar source.',
        'The attendance Finish button stays above the bottom navigation on phones.',
        'Servants Prep curriculum year filters include lessons scheduled within that academic year, including lessons moved from an earlier year.',
        'When a withdrawn Year 2 student returns after mentor verification, missing attendance for qualifying past classes is recorded without changing existing marks.',
      ],
    },
  },
  {
    id: '2026-11-01',
    date: '2026-11-01',
    title: 'Mentor updates and easier Sunday School follow-up',
    summary: 'Manage mentor forms, choose makeup exam notifications, and return to your class group more easily.',
    changes: {
      new: [
        'Super Admins can choose who receives makeup exam booking and reschedule notifications from Users. Selected staff receive email and in-app alerts, plus push where enabled.',
        'Servants Prep servants and admins can correct students’ mentor details and replace signed forms from the roster or student record. Current-year changes return for verification.',
      ],
      improved: [
        'Tap a child’s name in Needs you on Sunday School Home to open their profile.',
      ],
      fixed: [
        'Child profiles and care forms have a larger Close control that stays above the scrolling content and adjusts around iPhone Safari controls and the keyboard.',
        'Priests keep their overseen age group when returning from a child or class link. Deliberate changes in the Viewing picker still work.',
      ],
    },
  },
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
