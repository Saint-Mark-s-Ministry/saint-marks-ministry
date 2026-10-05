import { describe, expect, it } from "vitest";
import {
  canReviewRegistrations,
  canReviewServantApplications,
  canSubmitReview,
  canViewRegistrations,
  duplicateEmails,
  filterByStatus,
  formatGrade,
  inviteCodeStatus,
  inviteCodeSubtitle,
  isDuplicate,
  isIncomplete,
  type InviteCode,
  type Submission,
} from "../../apps/mobile/src/data/prep-registrations";

const submission = (overrides: Partial<Submission>): Submission => ({
  id: "s1",
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "(201) 555-0142",
  dateOfBirth: "2008-03-04",
  grade: "GRADE_12",
  fatherOfConfessionName: "Fr. Markos",
  currentlyServing: false,
  previouslyServed: false,
  previousServiceLocation: null,
  previouslyAttendedPrep: false,
  previousPrepLocation: null,
  approvalFormUrl: "https://blob/x.pdf",
  profileImageUrl: null,
  mentorName: "Mentor Name",
  mentorPhone: "(201) 555-0188",
  mentorEmail: "mentor@example.com",
  status: "PENDING",
  reviewNote: null,
  reviewer: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  ...overrides,
});

const inviteCode = (overrides: Partial<InviteCode>): InviteCode => ({
  id: "c1",
  code: "FALL26-7QX",
  label: "Fall 2026",
  maxUses: 4,
  usageCount: 1,
  expiresAt: "2026-11-01T12:00:00.000Z",
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  _count: { registrations: 1 },
  ...overrides,
});

describe("Registrations + Servant applications (SMM-40)", () => {
  describe("happy path", () => {
    it("filters the queue by status, including the ALL pass-through", () => {
      const rows = [submission({ id: "a", status: "PENDING" }), submission({ id: "b", status: "APPROVED" })];
      expect(filterByStatus(rows, "PENDING").map((r) => r.id)).toEqual(["a"]);
      expect(filterByStatus(rows, "ALL")).toHaveLength(2);
    });

    it("formats the real grade enum for display instead of the design source's placeholder text", () => {
      expect(formatGrade("GRADE_9")).toBe("9th grade");
      expect(formatGrade("COLLEGE_JUNIOR")).toBe("College junior");
      expect(formatGrade("SOMETHING_UNKNOWN")).toBe("SOMETHING_UNKNOWN");
    });

    it("flags same-email submissions as duplicates, case-insensitively, regardless of status", () => {
      const rows = [
        submission({ id: "a", email: "Jane@Example.com", status: "PENDING" }),
        submission({ id: "b", email: "jane@example.com", status: "REJECTED" }),
        submission({ id: "c", email: "other@example.com" }),
      ];
      const dupes = duplicateEmails(rows);
      expect(isDuplicate(rows[0], dupes)).toBe(true);
      expect(isDuplicate(rows[1], dupes)).toBe(true);
      expect(isDuplicate(rows[2], dupes)).toBe(false);
    });

    it("derives invite code status the same way the web admin page does: revoked > expired > exhausted > active", () => {
      const now = new Date("2026-10-05T00:00:00.000Z");
      expect(inviteCodeStatus(inviteCode({ isActive: false }), now)).toBe("revoked");
      expect(inviteCodeStatus(inviteCode({ expiresAt: "2026-01-01T00:00:00.000Z" }), now)).toBe("expired");
      expect(inviteCodeStatus(inviteCode({ maxUses: 4, usageCount: 4, expiresAt: null }), now)).toBe("exhausted");
      expect(inviteCodeStatus(inviteCode({ expiresAt: null }), now)).toBe("active");
      expect(inviteCodeSubtitle(inviteCode({}), now)).toBe("Fall 2026 · 1/4 uses · expires Nov 1");
    });

    it("requires a reject note client-side (matching the design source's placeholder) but never blocks approve", () => {
      expect(canSubmitReview("reject", "")).toBe(false);
      expect(canSubmitReview("reject", "  ")).toBe(false);
      expect(canSubmitReview("reject", "Missing documents")).toBe(true);
      expect(canSubmitReview("approve", "")).toBe(true);
    });
  });

  describe("highest-risk path", () => {
    it("gates the queue and review actions by the real, distinct role sets", () => {
      expect(canViewRegistrations("PRIEST")).toBe(true);
      expect(canReviewRegistrations("PRIEST")).toBe(false);
      expect(canReviewRegistrations("SERVANT_PREP")).toBe(true);
      expect(canViewRegistrations("STUDENT")).toBe(false);
      expect(canViewRegistrations("MENTOR")).toBe(false);
    });

    it("gates servant applications to SUPER_ADMIN only — SERVANT_PREP has no view tier here, unlike registrations", () => {
      expect(canReviewServantApplications("SUPER_ADMIN")).toBe(true);
      expect(canReviewServantApplications("SERVANT_PREP")).toBe(false);
      expect(canReviewServantApplications("PRIEST")).toBe(false);
    });

    it("flags incomplete using the server's own REGISTRATION_INCOMPLETE definition, not a stricter guess", () => {
      expect(isIncomplete(submission({}))).toBe(false);
      expect(isIncomplete(submission({ fatherOfConfessionName: null }))).toBe(true);
      expect(isIncomplete(submission({ approvalFormUrl: null }))).toBe(true);
      expect(isIncomplete(submission({ mentorEmail: null }))).toBe(true);
    });
  });
});
