import { describe, expect, it } from "vitest";
import {
  activeDraft,
  shouldShowAccessory,
} from "../../apps/mobile/src/data/attendance-accessory";

const classes = [{ id: "class-1", name: "Elementary A" }];

describe("persistent attendance accessory", () => {
  it("is null when there are no drafts", () => {
    expect(activeDraft({}, classes)).toBeNull();
  });

  it("is null when a draft entry exists but has no marks yet", () => {
    expect(activeDraft({ "class-1:2026-09-27": {} }, classes)).toBeNull();
  });

  it("surfaces the class name and date for an in-progress draft", () => {
    const draft = activeDraft(
      { "class-1:2026-09-27": { "child-1": "PRESENT" } },
      classes,
    );
    expect(draft).toEqual({
      classId: "class-1",
      date: "2026-09-27",
      className: "Elementary A",
    });
  });

  it("falls back to a generic label for a class no longer in the portal's list", () => {
    const draft = activeDraft(
      { "class-9:2026-09-27": { "child-1": "PRESENT" } },
      classes,
    );
    expect(draft?.className).toBe("class");
  });

  it("hides on the attendance screen for the same class", () => {
    const draft = activeDraft(
      { "class-1:2026-09-27": { "child-1": "PRESENT" } },
      classes,
    );
    expect(shouldShowAccessory("/attendance/class-1", draft)).toBe(false);
  });

  it("shows anywhere else while a draft is in progress", () => {
    const draft = activeDraft(
      { "class-1:2026-09-27": { "child-1": "PRESENT" } },
      classes,
    );
    expect(shouldShowAccessory("/(tabs)/home", draft)).toBe(true);
    expect(shouldShowAccessory("/attendance/class-2", draft)).toBe(true);
  });

  it("never shows when there is no draft", () => {
    expect(shouldShowAccessory("/(tabs)/home", null)).toBe(false);
  });
});
