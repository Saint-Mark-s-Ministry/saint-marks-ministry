// Mirrors types/rotation-forms.ts and GET /api/sunday-school/progress (rotation fields).
// Type-only: no server code reaches native bundles.
import type { SundaySchoolLevel } from "@prisma/client";

export type RotationFormStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RotationFormSummary {
  id: string;
  level: SundaySchoolLevel;
  fileUrl: string;
  filename: string;
  version: number;
  status: RotationFormStatus;
  reviewNotes: string | null;
  createdAt: string;
}

export interface RotationAssignment {
  assignmentId: string;
  class: { id: string; name: string; level: SundaySchoolLevel } | null;
  rotationForm: RotationFormSummary | null;
  grade: string;
  gradeDisplayName?: string;
  yearLevel: string | null;
  academicYear: { id: string; name: string };
  totalWeeks: number;
  startDate: string;
  isActive: boolean;
}

export interface RotationProgressResponse {
  studentId: string;
  completedRotations: number;
  requiredRotations: number;
  assignments: RotationAssignment[];
  graduation: { allMet: boolean; needsRotation: boolean };
}

/** One row of GET /api/sunday-school/assignments (the servant-facing list). */
export interface PrepRotationAssignmentRow {
  id: string;
  studentId: string;
  student: { id: string; name: string; email: string };
  grade: string;
  classId?: string | null;
  class?: { id: string; name: string; level?: string } | null;
  academicYearId: string;
  academicYear?: { id: string; name: string };
  startDate: string;
  totalWeeks: number;
  presentCount: number;
  totalLogged: number;
  isActive: boolean;
  rotationForm?: { status: RotationFormStatus } | null;
  percentage?: number | null;
  yearLevel?: string | null;
}

/** One row of GET /api/sunday-school/rotation-forms for a reviewer. */
export interface RotationFormReviewRow extends RotationFormSummary {
  assignment: {
    id: string;
    studentId: string;
    student: { id: string; name: string };
    class: { id: string; name: string; level: SundaySchoolLevel } | null;
    grade: string;
    startDate: string;
    isActive: boolean;
  };
  reviewer?: { id: string; name: string } | null;
}

/** The body of a successful POST /api/sunday-school/rotation-forms/[id]/review. */
export interface RotationReviewResult {
  status: "APPROVED" | "REJECTED";
  nextAssignment?: { id?: string; class?: { name: string } | null } | null;
  rotationsComplete?: boolean;
}
