import { describe, expect, it } from "vitest";
import {
  availableMinistries,
  defaultMinistry,
  MINISTRY_NAMES,
} from "../../apps/mobile/src/data/navigation";

const roles = [
  "SUPER_ADMIN",
  "PRIEST",
  "SERVANT_PREP",
  "MENTOR",
  "STUDENT",
  "SERVANT",
  "PARENT",
] as const;

describe("mobile ministry switching", () => {
  it.each(roles.filter((role) => role !== "SERVANT" && role !== "PARENT"))(
    "gives %s both ministries once they have Sunday School access",
    (role) => {
      const options = availableMinistries({ role }, true);
      expect(options.map((o) => o.id)).toEqual(["prep", "sundaySchool"]);
      expect(defaultMinistry({ role }, true)).toBe("prep");
    },
  );

  it.each(roles.filter((role) => role !== "SERVANT" && role !== "PARENT"))(
    "gives %s only Prep without Sunday School access",
    (role) => {
      const options = availableMinistries({ role }, false);
      expect(options.map((o) => o.id)).toEqual(["prep"]);
      expect(defaultMinistry({ role }, false)).toBe("prep");
    },
  );

  it("never gives a SERVANT the Prep ministry", () => {
    expect(availableMinistries({ role: "SERVANT" }, true)).toEqual([
      { id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool },
    ]);
    expect(defaultMinistry({ role: "SERVANT" }, true)).toBe("sundaySchool");
  });

  it("gives a SERVANT nothing without Sunday School access (fails closed, not into Prep)", () => {
    expect(availableMinistries({ role: "SERVANT" }, false)).toEqual([]);
  });

  it("never gives a PARENT the Prep ministry", () => {
    expect(availableMinistries({ role: "PARENT" }, true)).toEqual([
      { id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool },
    ]);
  });

  it("collapses to a single option for a SUPER_ADMIN with no Sunday School access", () => {
    const options = availableMinistries({ role: "SUPER_ADMIN" }, false);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe("prep");
  });
});
