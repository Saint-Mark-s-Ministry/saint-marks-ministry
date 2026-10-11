import { describe, expect, it } from "vitest";
import { filterClassesByPins, togglePin } from "../../apps/mobile/src/data/sunday-school-pinned-classes";

function cls(id: string) {
  return { id, name: id } as never;
}

describe("filterClassesByPins", () => {
  it("keeps only the pinned classes, in the original order (happy path)", () => {
    const all = [cls("a"), cls("b"), cls("c")];
    expect(filterClassesByPins(all, ["c", "a"]).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("returns every class when nothing is pinned — never an empty screen by surprise (highest-risk path)", () => {
    const all = [cls("a"), cls("b")];
    expect(filterClassesByPins(all, [])).toBe(all);
  });

  it("silently drops a pinned id that no longer matches any class", () => {
    const all = [cls("a")];
    expect(filterClassesByPins(all, ["a", "long-gone"])).toEqual([cls("a")]);
  });
});

describe("togglePin", () => {
  it("adds an unpinned class and removes an already-pinned one (happy path)", () => {
    expect(togglePin(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePin(["a", "b"], "a")).toEqual(["b"]);
  });

  it("clearing the last pin returns an empty array, not undefined (highest-risk path)", () => {
    expect(togglePin(["a"], "a")).toEqual([]);
  });
});
