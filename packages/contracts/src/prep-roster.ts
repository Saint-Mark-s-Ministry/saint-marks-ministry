// Mirrors the people fields of GET /api/enrollments, GET /api/students/[id]/details
// (student.enrollments[]), GET /api/students/[id]/analytics (enrollment) and
// GET /api/mentor-options (lib/mentor-contact.ts, lib/student-mentor-contact.ts,
// lib/mentor-eligibility.ts). Type-only: no server code reaches native bundles.

/**
 * The mentor to show and contact for an enrollment, resolved by the server. It
 * already prefers the student's confirmed annual mentor details over the raw
 * enrollment and account fields, which can be stale. `null` means the server has
 * no current mentor to show (none assigned, or a Year 2 student who has not yet
 * confirmed this year's mentor).
 */
export interface PrepMentorContact {
  name: string;
  email: string | null;
  phone: string | null;
}

/** Year 2 students confirm their mentor each year. `REQUIRED` means nothing is confirmed yet. */
export interface PrepMentorFormState {
  status: "REQUIRED" | "PENDING_REVIEW" | "REVIEWED";
  submission: (PrepMentorContact & { updatedAt: string; submittedAt: string }) | null;
}

export interface PrepFatherOfConfession {
  id: string;
  name: string;
  phone: string | null;
  church: string | null;
}

/** The raw assigned account. Prefer `mentorContact`; this can be stale. */
export interface PrepAssignedMentor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

/** The people fields every enrollment answer carries. `mentorContact` is absent only on an older server. */
export interface PrepEnrollmentPeople {
  mentor?: PrepAssignedMentor | null;
  mentorId?: string | null;
  mentorContact?: PrepMentorContact | null;
  mentorForm?: PrepMentorFormState | null;
  fatherOfConfession?: PrepFatherOfConfession | null;
}

/** One row of GET /api/mentor-options: any enabled account the server allows as a mentor. The role is informational only. */
export interface PrepMentorOption {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  role: string;
}
