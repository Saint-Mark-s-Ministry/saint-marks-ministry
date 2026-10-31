import { describe, expect, it } from "vitest";
import { absenceContact } from "../../apps/mobile/src/data/sunday-school-roster";

const child = { firstName: "Mina", cellPhone: null, guardianName: null, guardianPhone: null };
const family = { motherName: "Maria", motherPhone: "(555) 010-0001", fatherName: "George", fatherPhone: "555-010-0002", homeAddress: null };

describe("who to contact when a child is absent", () => {
  it("uses the child's own number first (happy path)", () => {
    expect(absenceContact({ ...child, cellPhone: "555-999-0000" }, family)).toEqual({
      phone: "555-999-0000",
      who: "Mina",
      relation: "child",
    });
  });

  it("falls back to the mother, then the father, then the guardian", () => {
    expect(absenceContact(child, family)).toMatchObject({ who: "Maria", relation: "parent", phone: "(555) 010-0001" });
    expect(absenceContact(child, { ...family, motherPhone: null })).toMatchObject({ who: "George", relation: "parent" });
    expect(
      absenceContact({ ...child, guardianName: "Aunt Sara", guardianPhone: "555-010-0003" }, { ...family, motherPhone: null, fatherPhone: null }),
    ).toMatchObject({ who: "Aunt Sara", phone: "555-010-0003" });
  });

  it("names the parent by role when no name is on file", () => {
    expect(absenceContact(child, { ...family, motherName: null })).toMatchObject({ who: "Mother" });
    expect(absenceContact({ ...child, guardianPhone: "555-010-0003" }, null)).toMatchObject({ who: "Guardian" });
  });

  it("skips numbers that cannot be dialled instead of stopping at them (highest-risk path)", () => {
    expect(absenceContact({ ...child, cellPhone: "  " }, family)).toMatchObject({ who: "Maria" });
    expect(absenceContact({ ...child, cellPhone: "-" }, { ...family, motherPhone: "n/a" })).toMatchObject({ who: "George" });
  });

  it("is null when there is no number anywhere", () => {
    expect(absenceContact(child, null)).toBeNull();
    expect(absenceContact(child, { ...family, motherPhone: "", fatherPhone: null })).toBeNull();
  });
});
