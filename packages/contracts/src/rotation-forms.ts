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
