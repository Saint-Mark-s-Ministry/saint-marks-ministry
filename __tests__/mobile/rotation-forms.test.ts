import { describe, expect, it } from "vitest";
import {
  ROTATION_FORM_MAX_BYTES,
  canViewOwnRotation,
  formNote,
  formStatus,
  isImageFile,
  progressLabel,
  progressSegments,
  resolveMimeType,
  rotationCanSubmit,
  rotationFormHtml,
  rotationRange,
  rotationSignature,
  rotationWeekDate,
  uploadBlocker,
  uploadBlockerMessage,
  uploadErrorMessage,
  uploadOpensOn,
  validateRotationFile,
  type RotationAssignment,
} from "../../apps/mobile/src/data/rotation-forms";

const START = "2026-10-04T00:00:00.000Z"; // a Sunday, stored at UTC midnight

function assignment(overrides: Partial<RotationAssignment> = {}): RotationAssignment {
  return {
    assignmentId: "a1",
    class: { id: "c1", name: "Grade 2 Girls", level: "GRADE_2" as never },
    rotationForm: null,
    grade: "GRADE_2",
    yearLevel: "YEAR_1",
    academicYear: { id: "y1", name: "2026-2027" },
    totalWeeks: 4,
    startDate: START,
    isActive: true,
    ...overrides,
  };
}

const form = (status: "PENDING" | "APPROVED" | "REJECTED", overrides = {}) => ({
  id: "f1",
  level: "GRADE_2" as never,
  fileUrl: "https://blob.example/f1",
  filename: "form.jpg",
  version: 1,
  status,
  reviewNotes: null,
  createdAt: "2026-10-26T00:00:00.000Z",
  ...overrides,
});

describe("server calendar convention (UTC days)", () => {
  it("puts week 4 three weeks after the start, at UTC midnight (happy path)", () => {
    expect(rotationWeekDate(START, 1).toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(rotationWeekDate(START, 4).toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("opens upload exactly at the fourth week's UTC midnight, not a moment earlier (highest-risk path)", () => {
    expect(rotationCanSubmit(START, new Date("2026-10-24T23:59:59.999Z"))).toBe(false);
    expect(rotationCanSubmit(START, new Date("2026-10-25T00:00:00.000Z"))).toBe(true);
    expect(rotationCanSubmit(START, new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("shows the date range and opening date as UTC calendar days, regardless of device time zone", () => {
    expect(rotationRange(START, 4)).toBe("Oct 4, 2026 – Oct 25, 2026");
    expect(uploadOpensOn(START)).toBe("October 25, 2026");
  });
});

describe("form status", () => {
  it("is one of four labels per card", () => {
    expect(formStatus(null)).toEqual({ label: "Not submitted", tone: "neutral" });
    expect(formStatus(form("PENDING"))).toEqual({ label: "Awaiting review", tone: "warning" });
    expect(formStatus(form("REJECTED"))).toEqual({ label: "Changes requested", tone: "danger" });
    expect(formStatus(form("APPROVED"))).toEqual({ label: "Approved", tone: "success" });
  });

  it("tells the student they stay in class until approval, and what to do after changes are requested", () => {
    expect(formNote(null)).toBeNull();
    expect(formNote(form("PENDING"))).toContain("remain in this class");
    expect(formNote(form("REJECTED"))).toContain("upload it again");
    expect(formNote(form("APPROVED"))).toBe("Four weeks approved.");
  });
});

describe("upload eligibility", () => {
  const before = new Date("2026-10-20T12:00:00.000Z");
  const after = new Date("2026-10-26T12:00:00.000Z");

  it("is open once the fourth week has arrived (happy path)", () => {
    expect(uploadBlocker(assignment(), after)).toEqual({ kind: "open" });
    expect(uploadBlockerMessage({ kind: "open" })).toBeNull();
  });

  it("is blocked before the fourth week, naming the exact date (highest-risk path)", () => {
    const blocker = uploadBlocker(assignment(), before);
    expect(blocker).toEqual({ kind: "not-yet", opensOn: "October 25, 2026" });
    expect(uploadBlockerMessage(blocker)).toContain("October 25, 2026");
  });

  it("never opens after three weeks, however the form is submitted", () => {
    expect(uploadBlocker(assignment(), new Date("2026-10-24T23:59:59.999Z")).kind).toBe("not-yet");
  });

  it("is closed for an approved form, an inactive rotation, and a rotation not set to four weeks", () => {
    expect(uploadBlocker(assignment({ rotationForm: form("APPROVED") }), after).kind).toBe("approved");
    expect(uploadBlocker(assignment({ isActive: false }), after).kind).toBe("inactive");
    expect(uploadBlocker(assignment({ totalWeeks: 6 }), after).kind).toBe("not-four-weeks");
  });

  it("still lets a rejected or pending form be replaced", () => {
    expect(uploadBlocker(assignment({ rotationForm: form("REJECTED") }), after).kind).toBe("open");
    expect(uploadBlocker(assignment({ rotationForm: form("PENDING") }), after).kind).toBe("open");
  });
});

describe("file validation (matches lib/rotation-forms.ts)", () => {
  it("accepts a photo or PDF up to 4.5 MB (happy path)", () => {
    expect(validateRotationFile({ mimeType: "image/jpeg", size: 1_000_000, name: "a.jpg" })).toBeNull();
    expect(validateRotationFile({ mimeType: "application/pdf", size: ROTATION_FORM_MAX_BYTES, name: "a.pdf" })).toBeNull();
    for (const type of ["image/png", "image/webp", "image/gif"]) {
      expect(validateRotationFile({ mimeType: type, size: 10, name: "x" })).toBeNull();
    }
  });

  it("rejects over-size and empty files with a next step (highest-risk path)", () => {
    const tooBig = validateRotationFile({ mimeType: "image/jpeg", size: ROTATION_FORM_MAX_BYTES + 1, name: "a.jpg" });
    expect(tooBig).toContain("4.5 MB");
    expect(tooBig).toContain("smaller");
    expect(validateRotationFile({ mimeType: "image/jpeg", size: 0, name: "a.jpg" })).toContain("empty");
  });

  it("rejects types the server would, including HEIC, and says how to get a usable photo", () => {
    expect(validateRotationFile({ mimeType: "image/heic", size: 10, name: "a.heic" })).toContain("HEIC");
    expect(validateRotationFile({ mimeType: "text/plain", size: 10, name: "a.txt" })).not.toBeNull();
    expect(validateRotationFile({ mimeType: null, size: 10, name: "noextension" })).not.toBeNull();
  });

  it("infers the type from the file name when the picker gives none", () => {
    expect(resolveMimeType(null, "Scan.PDF")).toBe("application/pdf");
    expect(resolveMimeType(undefined, "photo.jpeg")).toBe("image/jpeg");
    expect(resolveMimeType("IMAGE/PNG", "x")).toBe("image/png");
    expect(isImageFile(null, "form.webp")).toBe(true);
    expect(isImageFile("application/pdf", "form.pdf")).toBe(false);
  });
});

describe("upload errors", () => {
  it("tells the student what to do, and keeps server text that already does", () => {
    expect(uploadErrorMessage(null)).toContain("still selected");
    expect(uploadErrorMessage(413)).toContain("4.5 MB");
    expect(uploadErrorMessage(401)).toContain("Sign in");
    expect(uploadErrorMessage(400, "Complete all four weeks before uploading your signed form")).toBe(
      "Complete all four weeks before uploading your signed form",
    );
    expect(uploadErrorMessage(409, "The rotation changed. Refresh before uploading")).toContain("Refresh");
    expect(uploadErrorMessage(500)).toContain("Try again");
  });
});

describe("progress", () => {
  it("reads approved rotations out of ten grade levels", () => {
    expect(progressLabel(3, 10)).toBe("3 of 10 grade levels approved");
    const segments = progressSegments(3, 10);
    expect(segments).toHaveLength(10);
    expect(segments.filter(Boolean)).toHaveLength(3);
  });
});

describe("revalidation signature", () => {
  const base = { completedRotations: 2, assignments: [assignment({ rotationForm: form("PENDING") })] };

  it("is stable while nothing relevant changes", () => {
    expect(rotationSignature(base)).toBe(rotationSignature({ ...base }));
  });

  it("changes when a reviewer approves, requests changes, or the class moves (highest-risk path)", () => {
    const approved = {
      completedRotations: 3,
      assignments: [assignment({ rotationForm: form("APPROVED") })],
    };
    expect(rotationSignature(approved)).not.toBe(rotationSignature(base));
    const rejected = { ...base, assignments: [assignment({ rotationForm: form("REJECTED") })] };
    expect(rotationSignature(rejected)).not.toBe(rotationSignature(base));
    const moved = {
      ...base,
      assignments: [assignment({ class: { id: "c2", name: "Grade 3 Boys", level: "GRADE_3" as never }, rotationForm: form("PENDING") })],
    };
    expect(rotationSignature(moved)).not.toBe(rotationSignature(base));
  });

  it("changes when a replacement upload bumps the version", () => {
    const replaced = { ...base, assignments: [assignment({ rotationForm: form("PENDING", { version: 2 }) })] };
    expect(rotationSignature(replaced)).not.toBe(rotationSignature(base));
  });
});

describe("printable rotation form", () => {
  const html = rotationFormHtml();

  it("is the corrected form itself: two copies, each with four signed-week rows", () => {
    expect(html.match(/Servants Prep Rotations Form/g)).toHaveLength(2);
    expect(html.match(/Servant Signature/g)).toHaveLength(2);
    expect(html.match(/<th class="week" scope="row">/g)).toHaveLength(8);
    expect(html).toContain("Attendee Name:");
    expect(html).toContain("Only sign if the attendee was present");
  });

  it("does not hand students to Google Docs", () => {
    expect(html).not.toMatch(/docs\.google|<a /i);
  });
});

describe("who can see it", () => {
  it("is students only; the server enforces the same", () => {
    expect(canViewOwnRotation("STUDENT")).toBe(true);
    expect(canViewOwnRotation("MENTOR")).toBe(false);
    expect(canViewOwnRotation(undefined)).toBe(false);
  });
});
