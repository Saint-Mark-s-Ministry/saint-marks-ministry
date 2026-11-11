export const GUIDES_HREF = '/dashboard/guides'
export const GUIDE_MEDIA_VERSION = '2026-11-11-five-guides'
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

export const NAMES_GUIDE_HREF = `${GUIDES_HREF}#sunday-school-learn-names`
export const HOMEWORK_GUIDE_HREF = `${GUIDES_HREF}#sunday-school-homework`
export const CONTACT_GUIDE_HREF = `${GUIDES_HREF}#sunday-school-contact-update`
export const MEMORIZATION_GUIDE_HREF = `${GUIDES_HREF}#sunday-school-memorization`
export const CALENDAR_GUIDE_HREF = `${GUIDES_HREF}#sunday-school-calendar-subscriptions`

export interface PortalGuide {
  id: string
  title: string
  description: string
  updated?: string
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
    seconds: 42, media: 'sunday-school-qr-attendance',
    openHref: '/dashboard/servants/attendance', openLabel: 'Open Attendance',
    phoneNote: 'Open Attendance from the bottom menu. The same class, meeting date, QR controls, and request-review steps apply. Children use the web check-in screen.',
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
      { title: 'What does the child need?', description: 'A device with a camera or the check-in link, and their full name as it appears on the roster.' },
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
  {
    "id": "sunday-school-learn-names",
    "title": "Learn your children’s names",
    "description": "Practice with photo flashcards, reveal each name, and revisit the ones you are still learning.",
    "seconds": 31,
    "media": "sunday-school-learn-names",
    "openHref": "/dashboard/servants/roster",
    "openLabel": "Open Children",
    "phoneNote": "Open Children from the bottom menu, then Learn names. Reveal and review each card using the same controls.",
    "steps": [
      {
        "title": "Open your class roster",
        "description": "Open Children and check Your class. Learn names uses active children in this class who have a photo."
      },
      {
        "title": "Recall, then reveal",
        "description": "Choose Learn names. Try to recall the child’s name from their photo, then select Reveal name."
      },
      {
        "title": "Choose your next practice",
        "description": "Choose Got it! if you remembered, or Practice again if you would like another try. Either choice moves to the next card."
      },
      {
        "title": "Review the round",
        "description": "At Round complete, practice the remaining names again or play again with everyone. Shuffle rearranges only the cards you have not reviewed."
      },
      {
        "title": "Return whenever you need",
        "description": "Close the game to return to Children. Practice progress is just for this session and is not saved to a child’s record."
      }
    ],
    "help": [
      {
        "title": "Why is a child missing?",
        "description": "Only active children in the selected class with a photo are included. Add their photo on the roster, then reopen Learn names."
      },
      {
        "title": "Does the score affect the child?",
        "description": "No. This is a servant’s name practice. It does not change attendance, assessments, or the child’s record."
      }
    ],
    "updated": "2026-11-11"
  },
  {
    "id": "sunday-school-homework",
    "title": "Publish and review class homework",
    "description": "Set homework for an Elementary meeting, add resources, and save each child’s completion.",
    "seconds": 41,
    "media": "sunday-school-homework",
    "openHref": "/dashboard/servants/homework",
    "openLabel": "Open Homework",
    "phoneNote": "Open Lessons and choose Homework. The editor and completion roster use the same Publish homework and Save completion buttons.",
    "steps": [
      {
        "title": "Choose the assigned meeting",
        "description": "Open Lessons → Homework and check Your class and Assigned meeting. Homework is available for Elementary classes. The due date is one week after that meeting."
      },
      {
        "title": "Write the assignment",
        "description": "Choose Publish homework. Enter a clear title and instructions for the children."
      },
      {
        "title": "Add resources and publish",
        "description": "Use Add link for a named worksheet, reading, or video. Paste a full web sharing link with suitable access, then select Publish homework and wait for confirmation."
      },
      {
        "title": "Review completion",
        "description": "At the next meeting, choose Completed or Not completed for each child you have reviewed. Leave children unrecorded if you have not checked their work; Clear removes a selection."
      },
      {
        "title": "Save and check",
        "description": "Select Save completion and wait for Homework completion saved. Review the saved completion roster and school-year history."
      }
    ],
    "help": [
      {
        "title": "There are no assigned meetings.",
        "description": "Ask your coordinator to check the class’s lesson schedule. Homework attaches to a scheduled meeting; this screen does not create teaching dates."
      },
      {
        "title": "Are completion marks saved automatically?",
        "description": "No. Select Save completion before leaving. Unrecorded weeks are excluded from the completion rate."
      },
      {
        "title": "Can I change the homework?",
        "description": "Use Edit for the selected meeting. Archive removes it from the active assignment while preserving its history."
      }
    ],
    "updated": "2026-11-11"
  },
  {
    "id": "sunday-school-contact-update",
    "title": "Collect missing phone details with a QR",
    "description": "Create a temporary contact-update link for your class and close it when you finish.",
    "seconds": 39,
    "media": "sunday-school-contact-update",
    "openHref": "/dashboard/servants/roster",
    "openLabel": "Open Children",
    "phoneNote": "Open Children from the bottom menu and choose Contact update QR. Display or copy the link, then return to the dialog to close it.",
    "steps": [
      {
        "title": "Open Contact update QR",
        "description": "Open Children, check Your class, and choose Contact update QR. This fills missing phone numbers for children already on this class’s roster."
      },
      {
        "title": "Create a temporary link",
        "description": "Add an optional label and select Create contact update link. The QR expires after two hours. Save, copy, or print it now; the same link cannot be displayed again after you close the dialog."
      },
      {
        "title": "Use it during class",
        "description": "Show the QR to your class. The form asks for the child’s first name, last name, and date of birth as recorded on the roster, plus at least one missing phone number."
      },
      {
        "title": "Submit and verify",
        "description": "Select Submit phone details. Existing phone numbers are not shown or replaced. The thank-you message protects whether a roster match was found; ask a servant to confirm or correct details."
      },
      {
        "title": "Close the link",
        "description": "Return to Contact update QR and select Close link for that link when finished. Closing stops new submissions and keeps saved details."
      }
    ],
    "help": [
      {
        "title": "Is this for new children?",
        "description": "No. Contact update QR only fills missing phone numbers for existing children in this class. Ask a servant to add a new child through the roster."
      },
      {
        "title": "A phone number did not change.",
        "description": "Existing numbers stay unchanged. A name and birth date must match the roster; ask a servant to check a missing birth date, confirm the saved details, or correct an existing number."
      },
      {
        "title": "Can anyone with the link use it?",
        "description": "Anyone who has the link and a child’s name and birth date can submit missing phone details for this class. Share it during class and close it afterward."
      }
    ],
    "updated": "2026-11-11"
  },
  {
    "id": "sunday-school-memorization",
    "title": "Set memorization and save scores",
    "description": "Add a verse, prayer, or hymn for your class, then record scores out of 100.",
    "seconds": 35,
    "media": "sunday-school-memorization",
    "openHref": "/dashboard/servants/memorization",
    "openLabel": "Open Memorization",
    "phoneNote": "Open More → Memorization. Add the item, enter scores, and choose Save scores just as on a computer.",
    "steps": [
      {
        "title": "Choose your class",
        "description": "Open Memorization and check Your class. Use the Memorization selector to revisit an existing item."
      },
      {
        "title": "Set what to learn",
        "description": "Select Add memorization. Enter a title, and optionally add instructions and a date."
      },
      {
        "title": "Save the item",
        "description": "Select Add memorization in the dialog. Check that the saved title and instructions appear before entering scores."
      },
      {
        "title": "Enter scores and notes",
        "description": "Use whole-number scores from 0 to 100 and brief optional notes. Leave the score blank for a child who has not been assessed."
      },
      {
        "title": "Save scores and review",
        "description": "Select Save scores and wait for Scores saved. Check the recorded count and average. Edit changes the assignment; Archive preserves recorded scores."
      }
    ],
    "help": [
      {
        "title": "Are blank scores counted as zero?",
        "description": "No. Blank means not scored. Enter 0 only when that is the child’s actual score."
      },
      {
        "title": "Are scores saved automatically?",
        "description": "No. Choose Save scores after entering or changing them, and wait for the confirmation."
      },
      {
        "title": "Why can’t I save?",
        "description": "Check for whole numbers between 0 and 100, and make sure you are serving the selected class."
      }
    ],
    "updated": "2026-11-11"
  },
  {
    "id": "sunday-school-calendar-subscriptions",
    "title": "Add lessons and birthdays to your calendar",
    "description": "Create personal subscriptions that keep class lesson dates and birthdays in your calendar app.",
    "seconds": 38,
    "media": "sunday-school-calendar-subscriptions",
    "openHref": "/dashboard/servants/lessons",
    "openLabel": "Open Lessons",
    "phoneNote": "Use Add lessons to calendar in Lessons, or More → Care → Birthdays for birthday subscriptions. Apple Calendar supports subscriptions on the phone; add a Google Calendar subscription from a computer browser.",
    "steps": [
      {
        "title": "Start with lesson dates",
        "description": "Open Lessons and select Add lessons to calendar. Check the class, then choose Get subscription link."
      },
      {
        "title": "Subscribe in your calendar app",
        "description": "Use Open Apple Calendar / Outlook or Open Google Calendar, then confirm the subscription in that app. Alternatively choose Copy calendar link and paste it into your calendar’s subscription or From URL option."
      },
      {
        "title": "Add birthdays separately",
        "description": "Open Care → Birthdays and select Add birthdays to calendar. Check the class and choose Get subscription link."
      },
      {
        "title": "Subscribe to the birthday feed",
        "description": "Use the calendar-app button or Copy calendar link again. Lessons and birthdays are separate subscriptions, so repeat the subscription step for each."
      },
      {
        "title": "Keep the subscription personal",
        "description": "Treat subscription links as private: they contain access to class dates or children’s names and birthdays. Changes appear when your calendar app refreshes. Renew for the next class year."
      }
    ],
    "help": [
      {
        "title": "Subscribe or import?",
        "description": "Use a subscription or From URL option. Importing a downloaded file makes a one-time copy and will not receive later changes."
      },
      {
        "title": "How do I add Google Calendar on my phone?",
        "description": "Add the subscription through Google Calendar in a computer browser using From URL. It then appears in the same Google account on your phone; check that the calendar is enabled."
      },
      {
        "title": "Why hasn’t a change appeared?",
        "description": "Calendar apps refresh on their own schedules. Refresh or check later. These feeds are read-only, and access can end when your class access or password changes."
      },
      {
        "title": "Will this notify everyone?",
        "description": "No. This creates your own subscription. Copy calendar link copies a private feed URL; it does not subscribe anyone or send invitations."
      }
    ],
    "updated": "2026-11-11"
  },
]
