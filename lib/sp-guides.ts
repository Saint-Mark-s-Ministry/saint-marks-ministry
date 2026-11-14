export const prepGuides = [
  {
    "id": "attendance",
    "seconds": 22,
    "title": "Take weekly attendance",
    "openHref": "/dashboard/admin/attendance",
    "steps": [
      {
        "title": "Choose the meeting",
        "description": "Open Attendance and choose the correct academic year and lesson."
      },
      {
        "title": "Mark the students",
        "description": "Mark each student Present, Late, Absent, or Excused, according to what happened."
      },
      {
        "title": "Correct and verify",
        "description": "Correct any mistaken mark and wait for the saved confirmation before leaving."
      },
      {
        "title": "Review the result",
        "description": "Review the saved meeting. Exam days and no-class days do not count as normal lesson attendance."
      }
    ]
  },
  {
    "id": "student-progress",
    "seconds": 20,
    "title": "Review a student’s progress",
    "openHref": "/dashboard/admin/students",
    "steps": [
      {
        "title": "Find the student",
        "description": "Open Students and search for the student you want to follow up with."
      },
      {
        "title": "Open their profile",
        "description": "Select the student’s name to review their enrollment and progress."
      },
      {
        "title": "Check the details",
        "description": "Review attendance, section grades, and mentor information together."
      },
      {
        "title": "Plan your follow-up",
        "description": "Use the recorded history to identify what needs attention. Do not infer progress from a missing record."
      }
    ]
  },
  {
    "id": "exam-scores",
    "seconds": 22,
    "title": "Enter exam and makeup scores",
    "openHref": "/dashboard/admin/exams",
    "steps": [
      {
        "title": "Choose the exam",
        "description": "Open Exams and check the academic year, section, and exam date."
      },
      {
        "title": "Enter original scores",
        "description": "Open score entry and enter the student’s actual score out of the exam’s total points."
      },
      {
        "title": "Save and check",
        "description": "Save the scores and check the confirmation and updated results."
      },
      {
        "title": "Keep makeups separate",
        "description": "Use the student’s makeup score controls for paper makeups. Keep the original result as part of the history."
      }
    ]
  },
  {
    "id": "registrations",
    "seconds": 23,
    "title": "Review registrations",
    "openHref": "/dashboard/admin/registrations",
    "steps": [
      {
        "title": "Find pending applications",
        "description": "Open Registrations and filter to Pending applications."
      },
      {
        "title": "Review the application",
        "description": "Open the applicant and check their contact details, mentor information, and approval form."
      },
      {
        "title": "Check for an existing account",
        "description": "Resolve any existing-account or duplicate warning before approving the application."
      },
      {
        "title": "Confirm your decision",
        "description": "Approve only after reviewing the details, then confirm the saved status and resulting student record."
      }
    ]
  },
  {
    "id": "mentors",
    "seconds": 23,
    "title": "Manage mentors",
    "openHref": "/dashboard/admin/students",
    "steps": [
      {
        "title": "Open the student",
        "description": "Find the student in Students and open their enrollment details."
      },
      {
        "title": "Check the current form",
        "description": "For Year Two, check the mentor information submitted for the current academic year."
      },
      {
        "title": "Verify and assign",
        "description": "Review the form and choose the correct mentor account where assignment is available."
      },
      {
        "title": "Confirm the relationship",
        "description": "Save and check the assigned mentor. Submitted contact information and an app account are separate details."
      }
    ]
  },
  {
    "id": "lesson-calendar",
    "seconds": 23,
    "title": "Manage the lesson calendar",
    "openHref": "/dashboard/admin/curriculum",
    "steps": [
      {
        "title": "Choose the academic year",
        "description": "Open Curriculum and check the academic year before editing the schedule."
      },
      {
        "title": "Add the lesson",
        "description": "Choose Add lesson, then enter the topic, section, date, and other details you know."
      },
      {
        "title": "Save schedule changes",
        "description": "Save the lesson and check the scheduled row. Edit the date when a meeting moves."
      },
      {
        "title": "Use the right status",
        "description": "Use Cancelled or No class when appropriate. Mark exam days explicitly so attendance calculations stay correct."
      }
    ]
  },
  {
    "id": "exam-setup",
    "seconds": 20,
    "title": "Prepare a live exam",
    "openHref": "/dashboard/admin/exam-monitoring",
    "steps": [
      {
        "title": "Choose the exam",
        "description": "Open Exam Monitoring and choose the exam you are preparing."
      },
      {
        "title": "Configure the answer sheet",
        "description": "Set up the fifty-question answer key and the available choices for each question."
      },
      {
        "title": "Save and review",
        "description": "Save setup, then check the complete answer key before students begin."
      },
      {
        "title": "Open deliberately",
        "description": "Open the exam only when the class is ready. Opening locks the choices and answer key."
      }
    ]
  },
  {
    "id": "exam-monitoring",
    "seconds": 26,
    "title": "Monitor and finish an exam",
    "openHref": "/dashboard/admin/exam-monitoring",
    "steps": [
      {
        "title": "Open the dashboard",
        "description": "Open the exam dashboard to review the eligible roster and student progress."
      },
      {
        "title": "Review pauses",
        "description": "Check paused attempts and connection status. Unlock only after the student has returned and reconnected."
      },
      {
        "title": "Close the exam",
        "description": "Close when the sitting is finished. Closing uses answers already saved on the server."
      },
      {
        "title": "Release after checking",
        "description": "Review the closed exam, then release results. Student submissions remain final, and paper makeups stay separate."
      }
    ]
  },
  {
    "id": "async-rotations",
    "seconds": 24,
    "title": "Manage async rotations",
    "openHref": "/dashboard/admin/async-students",
    "steps": [
      {
        "title": "Check the assignment",
        "description": "Open Async students to review the student’s current serving assignment and start date."
      },
      {
        "title": "Review the signed form",
        "description": "Open Rotation forms and check the four completed weeks, signatures, and dates."
      },
      {
        "title": "Approve or return",
        "description": "Approve complete evidence, or return the form with clear correction notes."
      },
      {
        "title": "Check the next rotation",
        "description": "After approval, confirm that the next grade and start date appear. Uploading a form alone does not advance a rotation."
      }
    ]
  },
  {
    "id": "confession",
    "seconds": 22,
    "title": "Track confession follow-up",
    "openHref": "/dashboard/admin/confession",
    "steps": [
      {
        "title": "Check the current period",
        "description": "Open Confession and check the academic year and two-month period."
      },
      {
        "title": "Find outstanding follow-up",
        "description": "Use Due or Missed to find students whose records need attention."
      },
      {
        "title": "Review the sign-off",
        "description": "Open the student’s period entry and review the submitted sign-off or available upload controls."
      },
      {
        "title": "Verify the saved record",
        "description": "Check the recorded period and history after an update. Keep pastoral information relevant and private."
      }
    ]
  }
] as const

export function findPrepGuide(id: string) { return prepGuides.find(guide => guide.id === id) }
