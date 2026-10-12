import { describe, expect, it } from "vitest";
import {
  DELETION_SUMMARY,
  canDeleteOwnAccount,
  deletionErrorMessage,
  validateDeletionPassword,
} from "../../apps/mobile/src/data/account-deletion";

describe("account deletion", () => {
  it("is offered to everyone except super administrators (happy path)", () => {
    for (const role of ["PARENT", "STUDENT", "SERVANT", "MENTOR", "PRIEST", "SERVANT_PREP"]) {
      expect(canDeleteOwnAccount(role)).toBe(true);
    }
    expect(canDeleteOwnAccount("SUPER_ADMIN")).toBe(false);
    expect(canDeleteOwnAccount(null)).toBe(false);
    expect(canDeleteOwnAccount(undefined)).toBe(false);
  });

  it("requires the password before anything is sent", () => {
    expect(validateDeletionPassword("")).toMatch(/password/i);
    expect(validateDeletionPassword("hunter2")).toBeNull();
  });

  it("states what is deleted, what may be kept, and that it can't be undone", () => {
    const text = DELETION_SUMMARY.join(" ");
    expect(text).toMatch(/permanently deleted/);
    expect(text).toMatch(/must keep/);
    expect(text).toMatch(/can't be undone/);
  });

  it("explains a refusal and always says nothing was deleted when it wasn't (highest-risk path)", () => {
    expect(deletionErrorMessage(null)).toContain("Nothing was deleted");
    expect(deletionErrorMessage(500)).toContain("nothing was deleted");
    expect(deletionErrorMessage(403, "That password is incorrect")).toBe("That password is incorrect");
    expect(deletionErrorMessage(409, "Your account can't be deleted in the app because it holds records the church must keep (confidential priest notes). Contact an administrator and they can close the account for you.")).toContain("Contact an administrator");
    expect(deletionErrorMessage(403, "ViewAsReadOnly")).toContain("viewing as");
    expect(deletionErrorMessage(409)).toContain("Contact an administrator");
  });
});
