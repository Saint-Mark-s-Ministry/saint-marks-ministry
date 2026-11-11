export const GUIDES_HREF = '/dashboard/guides'
export const GUIDE_MEDIA_VERSION = '2026-11-10-mac-sketch'
export const LESSON_GUIDE_ID = 'sunday-school-lessons'
export const LESSON_GUIDE_HREF = `${GUIDES_HREF}#${LESSON_GUIDE_ID}`

export const lessonGuideSteps = [
  {
    title: 'Prepare your sharing links',
    description: 'Put your slides, worksheet, or video in Google Drive, OneDrive, or another service. Copy the sharing link and check that the intended viewers can open it.',
  },
  {
    title: 'Find the right lesson',
    description: 'Open Lessons. On a computer, switch from Calendar to List; phones already show the list. Choose I teach and check your class and lesson date.',
  },
  {
    title: 'Add your title',
    description: 'Select Edit lesson and enter a clear lesson title.',
  },
  {
    title: 'Add your resources',
    description: 'Select Add link. Give the resource a name, such as Lesson slides, and paste its web sharing link. Repeat for worksheets, videos, or other resources.',
  },
  {
    title: 'Save and check',
    description: 'Select Save lesson and wait for Lesson links saved. Open a saved resource to check the link. You can reopen Edit lesson to make changes.',
  },
] as const

export const QR_ATTENDANCE_GUIDE_ID = 'sunday-school-qr-attendance'
export const ATTENDANCE_GUIDE_ID = 'sunday-school-weekly-attendance'
export const CARE_GUIDE_ID = 'sunday-school-class-follow-up'
export const QR_ATTENDANCE_GUIDE_HREF = `${GUIDES_HREF}#${QR_ATTENDANCE_GUIDE_ID}`
export const ATTENDANCE_GUIDE_HREF = `${GUIDES_HREF}#${ATTENDANCE_GUIDE_ID}`
export const CARE_GUIDE_HREF = `${GUIDES_HREF}#${CARE_GUIDE_ID}`

export interface PortalGuide {
  id: string
  title: string
  description: string
  seconds: number
  media: string
  openHref: string
  openLabel: string
  phoneNote: string
  steps: ReadonlyArray<{ title: string; description: string }>
  help: ReadonlyArray<{ title: string; description: string }>
}

export const sundaySchoolGuides: PortalGuide[] = [
  {
    id: LESSON_GUIDE_ID,
    title: 'Add your Sunday School lesson',
    description: 'Find your assigned lesson, add its title and resource links, and save it to the portal.',
    seconds: 45, media: 'sunday-school-lesson-upload',
    openHref: '/dashboard/servants/lessons?view=list', openLabel: 'Open Lessons',
    phoneNote: 'Open Lessons from the bottom menu and choose I teach. Lessons already uses a list on phones, so skip the Calendar → List step.',
    steps: lessonGuideSteps,
    help: [
      { title: 'Where do I upload my file?', description: 'The lesson editor saves sharing links. Upload your file to Google Drive, OneDrive, or another service first. Upload schedule CSV is for teaching dates and assignments; use Edit lesson for your lesson materials.' },
      { title: 'I can’t find my lesson.', description: 'Check Your class in the sidebar or phone menu. I teach shows upcoming lessons assigned to you. Try Upcoming or Past, and ask your class coordinator to check the teaching assignment if needed.' },
      { title: 'My link won’t open.', description: 'Paste the full web sharing link, including https://. Check access permissions in the service that hosts the resource. Saving a link in the portal does not change those permissions.' },
      { title: 'The lesson won’t save.', description: 'Check the message beside the links. Each resource needs a name and a web link; remove any partly filled rows you don’t need. If the connection fails, your changes stay in the open editor so you can retry.' },
    ],
  },
  {
    id: QR_ATTENDANCE_GUIDE_ID,
    title: 'Use QR attendance for your class',
    description: 'Display your meeting’s QR code, review check-in requests, and confirm the children who are there.',
    seconds: 43, media: 'sunday-school-qr-attendance',
    openHref: '/dashboard/servants/attendance', openLabel: 'Open Attendance',
    phoneNote: 'Open Attendance from the bottom menu. The same class, meeting date, QR controls, and request-review steps apply. Children use the web check-in screen; no account is needed.',
    steps: [
      { title: 'Check the class and meeting date', description: 'Open Attendance and check Your class and Date. Each meeting has its own QR code.' },
      { title: 'Display the QR code', description: 'Choose Show attendance QR and display it for your class. Children scan it, enter their full name, and tap I’m here. Use Servant controls to open or copy the check-in link.' },
      { title: 'Review each request', description: 'Close the QR display to return to the roster. A name submission is a request, not an attendance mark. Confirm only children who are there; dismiss requests you cannot verify.' },
      { title: 'Include children without phones', description: 'Mark their attendance manually. A confirmed QR request shows the QR check-in badge; check all marks before finishing.' },
      { title: 'Finish the meeting', description: 'Review every waiting request first. Finish closes QR check-in and marks anyone still unmarked absent. Stop check-in under Servant controls closes the QR without finishing the roster.' },
    ],
    help: [
      { title: 'When can children check in?', description: 'Saturday classes: 10:30 a.m.–12:30 p.m. Sunday classes: 11:30 a.m.–1:30 p.m. All times are New York time. Preparing or replacing a QR does not extend that window.' },
      { title: 'A child’s name was submitted but they are not marked present.', description: 'Check the waiting requests in the roster. Only a servant’s confirmation can add QR attendance. For an unmatched name, verify the child and mark attendance manually.' },
      { title: 'Can I reuse an old QR?', description: 'Use a new code for each meeting. Replace code immediately invalidates the previous code. Finish and Stop check-in close it early.' },
      { title: 'What does the child need?', description: 'A device with a camera or the check-in link, and their full name as it appears on the roster. No login, birth date, or contact details are requested.' },
    ],
  },
  {
    id: ATTENDANCE_GUIDE_ID,
    title: 'Take weekly attendance',
    description: 'Mark your class, correct a selection, and understand the final Finish step.',
    seconds: 40, media: 'sunday-school-weekly-attendance',
    openHref: '/dashboard/servants/attendance', openLabel: 'Open Attendance',
    phoneNote: 'Open Attendance from the bottom menu. The roster and mark controls stack for a smaller screen, and Finish stays above the bottom navigation.',
    steps: [
      { title: 'Choose the right class and date', description: 'Open Attendance, check Your class, and use Date or the meeting arrows to select the meeting you are recording.' },
      { title: 'Find each child', description: 'Choose Sort by first name or Sort by last name. Photos and Group by gender can help you recognize the roster.' },
      { title: 'Mark and correct attendance', description: 'Choose Present, Late, or Absent for each child. Marks save automatically. To correct a mistake, select the right mark and wait for saving to complete.' },
      { title: 'Review unmarked children and QR requests', description: 'Check the number still unmarked. If QR attendance is in use, confirm or dismiss waiting requests before finishing.' },
      { title: 'Finish and check the saved result', description: 'Finish records everyone still unmarked as absent and closes QR check-in for that meeting. Check the saved confirmation. Use History to review earlier attendance.' },
    ],
    help: [
      { title: 'Do I need Finish for each mark?', description: 'Individual marks save automatically. Finish is the deliberate last step that records unmarked absences and closes QR check-in.' },
      { title: 'The connection failed.', description: 'Read the saving message before leaving. Unsaved marks stay in the local draft when browser storage is available. Review any recovered marks and use Retry pending marks or Resume saving marks when connected.' },
      { title: 'Why is Finish unavailable?', description: 'Wait for saving to finish and review waiting QR requests. Check the error message if the roster could not load or a save failed.' },
    ],
  },
  {
    id: CARE_GUIDE_ID,
    title: 'Follow up with your class',
    description: 'Find your assigned check-ins, record calls and visits, and review the saved history.',
    seconds: 45, media: 'sunday-school-class-follow-up',
    openHref: '/dashboard/servants/care', openLabel: 'Open Care',
    phoneNote: 'Open More → Care. Use the same check-in filters and Log call controls. Visits & calls is a tab within Care.',
    steps: [
      { title: 'Open Care for your class', description: 'Check Your class. Assigned check-ins shows a servant’s responsibility for each child; Needs a call or visit highlights repeated absences and priority visits.' },
      { title: 'Find this week’s check-ins', description: 'Use Mine for children assigned to you, or Not called this week for children with no call attempt logged this week. The week runs Monday–Sunday in New York time.' },
      { title: 'Record a call after making it', description: 'Choose Log call beside the child. Check Date called, select the actual Outcome, and enter a brief, relevant Call note. Choose Save call and check the saved history.' },
      { title: 'Record a visitation', description: 'Use Log call or visit in the follow-up list, or open the child from Visits & calls. Under New visitation entry, check the status and date, add relevant notes, then select Save entry.' },
      { title: 'Review the follow-up history', description: 'Return to Care to check the weekly call status and follow-up list. Record the actual outcome, including no answer. Keep notes relevant and avoid unnecessary personal details.' },
    ],
    help: [
      { title: 'Does No answer count as a call?', description: 'All saved call outcomes count as an attempt for the weekly check-in. Use the actual outcome; a logged attempt does not mean a conversation took place.' },
      { title: 'Mine is empty.', description: 'Check Your class. Mine shows children assigned to you for check-in responsibility. Use All children or ask your class coordinator about the assignment.' },
      { title: 'Does a call remove someone from Needs a call or visit?', description: 'That list is based on attendance and priority visits. Logging a call updates the call history and weekly check-in status; the attendance or priority reason may remain.' },
    ],
  },
]
