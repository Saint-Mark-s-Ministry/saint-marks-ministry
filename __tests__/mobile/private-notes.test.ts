import { describe, expect, it } from "vitest";
import {
  PRIVATE_NOTES_PREFIX,
  parsePrivateNotes,
  privateNoteFieldHint,
  privateNotesAccess,
  privateNotesCaption,
  privateNotesPath,
  privateNotesProblem,
  privateNotesScope,
} from "../../apps/mobile/src/data/private-notes";

// What the visitations route sends in `standing` for each kind of session (app/api/sunday-school/visitations/route.ts):
// canReadPrivateNotes = enabled && !impersonating && !SUPER_ADMIN tag; isPriest = canReadPrivateNotes && PRIEST tag.
const standing = {
  priest: { canReadPrivateNotes: true, isPriest: true },
  ordinaryAuthor: { canReadPrivateNotes: true, isPriest: false },
  unrelatedServant: { canReadPrivateNotes: true, isPriest: false },
  superAdmin: { canReadPrivateNotes: false, isPriest: false },
  superAdminAlsoPriest: { canReadPrivateNotes: false, isPriest: false },
  viewAsPriestPreview: { canReadPrivateNotes: false, isPriest: false },
  viewAsAnyone: { canReadPrivateNotes: false, isPriest: false },
};

describe("confidential note access from the server's signals", () => {
  it("lets an active priest read every note, and an ordinary author only their own", () => {
    expect(privateNotesAccess(standing.priest)).toBe("all");
    expect(privateNotesAccess(standing.ordinaryAuthor)).toBe("own");
    expect(privateNotesAccess(standing.unrelatedServant)).toBe("own");
  });

  it("reads nothing for a Super Admin, one who is also a priest, or any View as session (highest-risk path)", () => {
    expect(privateNotesAccess(standing.superAdmin)).toBe("none");
    expect(privateNotesAccess(standing.superAdminAlsoPriest)).toBe("none");
    expect(privateNotesAccess(standing.viewAsPriestPreview)).toBe("none");
    expect(privateNotesAccess(standing.viewAsAnyone)).toBe("none");
  });

  it("treats a missing or unknown answer as no access, and never lets isPriest alone grant it", () => {
    expect(privateNotesAccess(undefined)).toBe("none");
    expect(privateNotesAccess(null)).toBe("none");
    expect(privateNotesAccess({})).toBe("none");
    expect(privateNotesAccess({ isPriest: true })).toBe("none");
    expect(privateNotesAccess({ canReadPrivateNotes: "true" as unknown as boolean })).toBe("none");
  });

  it("asks only the private-note route, with the child's id encoded and nothing else", () => {
    expect(privateNotesPath("kid-1")).toBe("/api/sunday-school/priest-notes?childId=kid-1");
    expect(privateNotesPath("a b/c")).toBe("/api/sunday-school/priest-notes?childId=a%20b%2Fc");
  });

  it("keeps one viewer's cached answer from another viewer, another child, or a View as session", () => {
    const a = privateNotesScope({ id: "u1" }, "k1");
    expect(a.startsWith(PRIVATE_NOTES_PREFIX)).toBe(true);
    expect(a).not.toBe(privateNotesScope({ id: "u2" }, "k1"));
    expect(a).not.toBe(privateNotesScope({ id: "u1" }, "k2"));
    expect(a).not.toBe(privateNotesScope({ id: "u1", originalId: "admin" }, "k1"));
  });

  it("words what each reader sees, and tells a Super Admin they cannot read even their own", () => {
    expect(privateNotesCaption("all")).toMatch(/every confidential note/);
    expect(privateNotesCaption("own")).toMatch(/only your own/i);
    expect(privateNoteFieldHint("own")).toMatch(/you, as its author/i);
    expect(privateNoteFieldHint("all")).toMatch(/never appears in the shared history/);
    expect(privateNoteFieldHint("none")).toMatch(/Super Admin accounts can't read confidential notes, including their own/);
  });

  it("separates a refusal, a missing child and a plain failure", () => {
    expect(privateNotesProblem(403)).toBe("denied");
    expect(privateNotesProblem(404)).toBe("gone");
    expect(privateNotesProblem(500)).toBe("retry");
    expect(privateNotesProblem(undefined)).toBe("retry");
  });

  it("uses only well-formed notes", () => {
    const note = { id: "n1", visitationId: "v1", content: "Private", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", visitation: {}, author: { id: "a", name: "Fr. Priest" } };
    expect(parsePrivateNotes({ notes: [note, { id: 5 }, null, { ...note, author: null }] })).toEqual([note]);
    expect(parsePrivateNotes({})).toEqual([]);
    expect(parsePrivateNotes(null)).toEqual([]);
  });
});
