import { describe, expect, it } from "vitest";
import { initialsFor } from "../../apps/mobile/src/data/initials";

describe("monogram initials", () => {
  it("is the first and last name's first letters (happy path)", () => {
    expect(initialsFor("Marina Servant")).toBe("MS");
    expect(initialsFor("John Michael Smith")).toBe("JS");
    expect(initialsFor("  mina   girgis ")).toBe("MG");
  });

  it("ignores parentheticals and suffixes instead of showing punctuation (highest-risk path)", () => {
    expect(initialsFor("Prep Reviewer (SMM-92)")).toBe("PR");
    expect(initialsFor("Async Tester (SMM-92)")).toBe("AT");
    expect(initialsFor("Martin Luther King Jr.")).toBe("MK");
    expect(initialsFor("Anna Lee III")).toBe("AL");
  });

  it("handles one name, no name, and non-Latin names", () => {
    expect(initialsFor("Madonna")).toBe("M");
    expect(initialsFor("")).toBe("?");
    expect(initialsFor(null)).toBe("?");
    expect(initialsFor("(SMM-92)")).toBe("?");
    expect(initialsFor("مينا جرجس")).toBe("مج");
  });
});
