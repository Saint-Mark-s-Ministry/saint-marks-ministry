import { describe, expect, it } from "vitest";
import { PREP_STUDENT_LABEL, showsPrepStudentBadge, withPrepStudentSpoken } from "../../apps/mobile/src/data/prep-student";

describe("SP Student badge", () => {
  it("shows only when the server's flag is exactly true", () => {
    expect(showsPrepStudentBadge({ isServantsPrepStudent: true })).toBe(true);
    expect(showsPrepStudentBadge({ isServantsPrepStudent: false })).toBe(false);
    expect(showsPrepStudentBadge({})).toBe(false);
    expect(showsPrepStudentBadge({ isServantsPrepStudent: null })).toBe(false);
    // A malformed value is not truthy enough: the server sends a boolean.
    expect(showsPrepStudentBadge({ isServantsPrepStudent: "true" as unknown as boolean })).toBe(false);
  });

  it("is not guessed from anything else on the child: grade, account, name or role", () => {
    const child = { level: "GRADE_12", userId: "linked-account", firstName: "SP", lastName: "Student", user: { id: "u1", name: "x", email: "x@y.z", profileImageUrl: null } };
    expect(showsPrepStudentBadge(child as never)).toBe(false);
    expect(showsPrepStudentBadge({ ...child, isServantsPrepStudent: true } as never)).toBe(true);
  });

  it("is read out with the name", () => {
    expect(PREP_STUDENT_LABEL).toBe("SP Student");
    expect(withPrepStudentSpoken("Mina Mark", { isServantsPrepStudent: true })).toBe("Mina Mark, SP Student");
    expect(withPrepStudentSpoken("Mina Mark", { isServantsPrepStudent: false })).toBe("Mina Mark");
  });
});
