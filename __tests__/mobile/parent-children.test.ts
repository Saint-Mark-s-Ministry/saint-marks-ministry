import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  canViewFamily,
  isoDay,
  normalizePhone,
  parseBirthDate,
  parseDraft,
  placementLabel,
  requestLabel,
  requiredProgress,
  serializeDraft,
  validateRegistration,
  type RegistrationForm,
} from "../../apps/mobile/src/data/parent-children";

const today = new Date(2026, 9, 6);
const complete: RegistrationForm = {
  ...EMPTY_FORM,
  firstName: "Anna",
  lastName: "Lee",
  birthDate: "2019-02-03",
  level: "GRADE_2",
  guardianName: "Mary Lee",
  guardianPhone: "(555) 123-4567",
};

describe("birth date", () => {
  it("accepts a real calendar day and rejects one that rolls over", () => {
    expect(parseBirthDate("2020-02-29", today)).not.toBeNull();
    expect(parseBirthDate("2019-02-31", today)).toBeNull();
    expect(parseBirthDate("2019-04-31", today)).toBeNull();
  });

  it("rejects a future date", () => {
    expect(parseBirthDate("2026-10-07", today)).toBeNull();
    expect(parseBirthDate("2026-10-06", today)).not.toBeNull();
  });

  it("names the field and the fix when the date is wrong", () => {
    expect(validateRegistration({ ...complete, birthDate: "2019-02-31" }, today).birthDate).toMatch(/real birth date/);
  });
});

describe("guardian phone", () => {
  it("normalizes common formats to digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("+1 555.123.4567")).toBe("+15551234567");
  });

  it("refuses letters and short numbers, with a message that names the fix", () => {
    expect(normalizePhone("555-CALL-ME")).toBeNull();
    expect(validateRegistration({ ...complete, guardianPhone: "12345" }, today).guardianPhone).toMatch(/7 to 15 digits/);
  });
});

describe("whole form", () => {
  it("passes a complete, valid form", () => {
    expect(validateRegistration(complete, today)).toEqual({});
  });

  it("flags each missing required field", () => {
    const errors = validateRegistration(EMPTY_FORM, today);
    expect(Object.keys(errors).sort()).toEqual(
      ["birthDate", "firstName", "guardianName", "guardianPhone", "lastName", "level"].sort(),
    );
  });

  it("accepts a blank email but rejects a malformed one", () => {
    expect(validateRegistration({ ...complete, guardianEmail: "" }, today).guardianEmail).toBeUndefined();
    expect(validateRegistration({ ...complete, guardianEmail: "mary@" }, today).guardianEmail).toMatch(/name@example.com/);
  });

  it("counts required fields for the progress indicator", () => {
    expect(requiredProgress(EMPTY_FORM)).toEqual({ done: 0, total: 6 });
    expect(requiredProgress({ ...complete, notes: "allergies" })).toEqual({ done: 6, total: 6 });
  });
});

describe("saved draft", () => {
  it("round-trips a draft exactly", () => {
    expect(parseDraft(serializeDraft(complete))).toEqual(complete);
  });

  it("ignores a damaged or wrongly shaped draft instead of breaking the form", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ firstName: 3 }))).toBeNull();
    expect(parseDraft(JSON.stringify("text"))).toBeNull();
  });

  it("formats the picker's day as the form's YYYY-MM-DD", () => {
    expect(isoDay(new Date(2019, 1, 3))).toBe("2019-02-03");
  });
});

describe("status wording and access", () => {
  it("says what happens next for each request state", () => {
    expect(requestLabel("PENDING")).toEqual({ label: "Waiting for review", tone: "warning" });
    expect(requestLabel("APPROVED").label).toBe("Approved");
    expect(requestLabel("REJECTED").label).toBe("Not approved");
  });

  it("says a child isn't placed until a coordinator places them", () => {
    expect(placementLabel(null)).toBe("Not placed in a class yet");
    expect(placementLabel({ name: "Grade 2 Girls" })).toBe("Grade 2 Girls");
  });

  it("opens family screens for parents only", () => {
    expect(canViewFamily("PARENT")).toBe(true);
    for (const role of ["STUDENT", "MENTOR", "SERVANT", "SUPER_ADMIN", null, undefined]) {
      expect(canViewFamily(role)).toBe(false);
    }
  });
});
