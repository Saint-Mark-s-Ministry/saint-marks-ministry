// The native Application screen follows the server's own flags. These drive the REAL route handler (database mocked, as in
// __tests__/api/annual-mentor-eligibility.test.ts) through every enrollment shape and feed its answers to the native rules, so
// the screen is proven for each experience, including yearless async students, without assuming any of them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enrollment: vi.fn(), annual: vi.fn(), application: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireAuth: async () => ({ id: "student-1", role: "STUDENT" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  academicYear: { findFirst: async () => ({ id: "year-1", name: "2026-2027" }) },
  studentEnrollment: { findUnique: mocks.enrollment },
  annualMentorInformation: { findUnique: mocks.annual },
  registrationSubmission: { findFirst: mocks.application },
} }));

import { GET } from "@/app/api/registration/application/route";
import {
  applicationHeading, applicationProgress, describeLoadFailure, firstFieldProblem, reviewBadge, visibleSections,
  type ApplicationState,
} from "../../apps/mobile/src/data/prep-application";

const registration = {
  id: "reg-1", fatherOfConfessionName: "Fr. Mark", approvalFormUrl: "https://example.invalid/a.pdf", approvalFormFilename: "a.pdf",
  mentorName: "Mentor", mentorPhone: "555-0100", mentorEmail: "mentor@example.invalid",
};
const enrollment = (extra: Record<string, unknown>) => ({
  id: "e1", isActive: true, status: "ACTIVE", isAsyncStudent: false, yearLevel: "YEAR_1", mentorName: "Mentor", mentorPhone: "555-0100",
  approvalFormUrl: null, approvalFormFilename: null, ...extra,
});
const read = async () => {
  const response = await GET();
  const body = await response.json();
  return { status: response.status, body: body as ApplicationState & { error?: string } };
};

describe("the native Application screen against every server shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.application.mockResolvedValue(null);
    mocks.annual.mockResolvedValue(null);
  });

  it("in-person Year 1 with an approved registration: the existing flow, unchanged", async () => {
    mocks.application.mockResolvedValue({ ...registration, fatherOfConfessionName: null, approvalFormUrl: null, approvalFormFilename: null });
    mocks.enrollment.mockResolvedValue(enrollment({}));
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(visibleSections(body)).toEqual(["mentor", "church", "approvalForm"]);
    expect(applicationProgress(body)).toEqual({ done: 1, total: 3 });
    expect(applicationHeading(body).title).toBe("Application");
    expect(reviewBadge(body)).toBeNull();
    expect(firstFieldProblem(body, "", { mentorName: "A", mentorPhone: "1", mentorEmail: "a@b.co" })?.field).toBe("fatherOfConfessionName");
  });

  it("active Year 2: confirm your mentor for the year, pending review after submission, confirmed once reviewed", async () => {
    mocks.application.mockResolvedValue(registration);
    mocks.enrollment.mockResolvedValue(enrollment({ yearLevel: "YEAR_2" }));
    let { body } = await read();
    expect(applicationHeading(body)).toMatchObject({ title: "Confirm your mentor" });
    expect(reviewBadge(body)).toEqual({ label: "Update required", tone: "warning" });
    mocks.annual.mockResolvedValue({ mentorName: "M", mentorPhone: "1", mentorEmail: "m@x.co", reviewedAt: null });
    ({ body } = await read());
    expect(reviewBadge(body)).toEqual({ label: "Awaiting admin review", tone: "info" });
    expect(body.complete).toBe(false);
    mocks.annual.mockResolvedValue({ mentorName: "M", mentorPhone: "1", mentorEmail: "m@x.co", reviewedAt: new Date() });
    ({ body } = await read());
    expect(reviewBadge(body)).toEqual({ label: "Confirmed", tone: "success" });
    expect(body.complete).toBe(true);
  });

  it("a yearless async student WITH a registration: the normal application, no annual confirmation on today's server", async () => {
    mocks.application.mockResolvedValue(registration);
    mocks.enrollment.mockResolvedValue(enrollment({ isAsyncStudent: true, yearLevel: null }));
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.annualMentorRequired).toBe(false);
    expect(visibleSections(body)).toEqual(["mentor", "church", "approvalForm"]);
    expect(reviewBadge(body)).toBeNull();
  });

  it("a yearless async student WITHOUT a registration: a readable, retryable message that never blames a registration", async () => {
    mocks.enrollment.mockResolvedValue(enrollment({ isAsyncStudent: true, yearLevel: null }));
    const { status, body } = await read();
    expect(status).toBe(404);
    const failure = describeLoadFailure(body.error);
    expect(failure.title).toBe("Application unavailable");
    expect(failure.body).not.toMatch(/approved registration|not approved/i);
  });

  it("a yearless async student the server DOES ask to confirm (annual requirement, no registration): only the mentor section, no year", async () => {
    // The shape #199 produced. If the server asks again, the native screen already follows it with no cohort year.
    const shape: ApplicationState = {
      application: { fatherOfConfessionName: null, approvalFormUrl: null, approvalFormFilename: null, mentorName: null, mentorPhone: null, mentorEmail: null },
      mentorReviewStatus: "UPDATE_REQUIRED", showChurchInformation: false, showApprovalForm: true, annualMentorRequired: true,
      academicYear: { id: "year-1", name: "2026-2027" }, missingDetails: ["approvalForm", "mentorInformation"], complete: false,
    };
    expect(visibleSections(shape)).toEqual(["mentor", "approvalForm"]);
    expect(firstFieldProblem(shape, "", { mentorName: "A", mentorPhone: "1", mentorEmail: "a@b.co" })).toBeNull();
    expect(applicationHeading(shape).subtitle).toContain("2026-2027");
    expect(reviewBadge(shape)).toEqual({ label: "Update required", tone: "warning" });
  });
});
