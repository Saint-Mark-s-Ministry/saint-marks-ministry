export const GUIDES_HREF = '/dashboard/guides'
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
