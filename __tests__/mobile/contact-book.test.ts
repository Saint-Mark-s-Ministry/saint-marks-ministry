import { describe, expect, it } from "vitest";
import { ApiError } from "../../apps/mobile/src/data/api-client";
import {
  CONTACT_BOOK_PAGE_SIZE,
  CONTACT_BOOK_PATH,
  canSeeContactBook,
  contactBookReducer,
  dialablePhone,
  filterContacts,
  initialContactBookState,
  isContactBookDeniedLocally,
  mailUrl,
  pageCount,
  pageSummary,
  paginateContacts,
  roleSummary,
  smsUrl,
  sortContacts,
  telUrl,
  type ContactBookEntry,
  type ContactBookResponse,
} from "../../apps/mobile/src/data/contact-book";
import {
  canChangeContactBookAccess,
  contactBookAccessChanged,
  contactBookAccessErrorMessage,
  showsContactBookAccess,
} from "../../apps/mobile/src/data/people";

const page = (overrides: Partial<ContactBookResponse> = {}): ContactBookResponse => ({
  contacts: [
    { id: "u1", name: "Ava Adel", email: "ava@example.com", phone: "(555) 010-2000" },
    { id: "u2", name: "Ben Botros", email: "ben@example.com", phone: null },
  ],
  total: 2,
  ...overrides,
});

describe("canSeeContactBook (menu visibility only)", () => {
  it("shows the entry for an explicitly approved non-admin, including a priest", () => {
    expect(canSeeContactBook({ role: "SERVANT", canAccessContactBook: true })).toBe(true);
    expect(canSeeContactBook({ role: "PRIEST", canAccessContactBook: true })).toBe(true);
  });

  it("never grants from role or ministry assignment alone (highest-risk path)", () => {
    expect(canSeeContactBook({ role: "PRIEST" })).toBe(false);
    expect(canSeeContactBook({ role: "PRIEST", canAccessContactBook: false })).toBe(false);
    expect(canSeeContactBook({ role: "MENTOR", canAccessContactBook: false })).toBe(false);
    expect(canSeeContactBook(null)).toBe(false);
  });

  it("hides the entry for a super admin even with a stored grant (highest-risk path)", () => {
    expect(canSeeContactBook({ role: "SUPER_ADMIN", canAccessContactBook: true })).toBe(false);
    expect(isContactBookDeniedLocally("SUPER_ADMIN")).toBe(true);
    expect(isContactBookDeniedLocally("PRIEST")).toBe(false);
  });
});

describe("directory search, order and paging (the server returns everyone at once)", () => {
  const person = (n: number, overrides: Partial<ContactBookEntry> = {}): ContactBookEntry => ({
    id: `u${String(n).padStart(3, "0")}`,
    name: `Person ${String(n).padStart(3, "0")}`,
    email: `person${n}@example.com`,
    phone: n % 3 === 0 ? null : `(555) 010-${String(n).padStart(4, "0")}`,
    ...overrides,
  });
  const everyone = Array.from({ length: 120 }, (_, i) => person(i + 1));

  it("asks for the whole directory with no search or page parameters", () => {
    expect(CONTACT_BOOK_PATH).toBe("/api/contact-book");
  });

  it("matches name, email, or phone, ignoring case and surrounding spaces (happy path)", () => {
    const list = [
      person(1, { name: "Ava Adel", email: "ava@example.com", phone: "(555) 010-2000" }),
      person(2, { name: "Ben Botros", email: "BEN@Church.org", phone: null }),
    ];
    expect(filterContacts(list, " ava ").map((c) => c.id)).toEqual(["u001"]);
    expect(filterContacts(list, "church.ORG").map((c) => c.id)).toEqual(["u002"]);
    expect(filterContacts(list, "010-2000").map((c) => c.id)).toEqual(["u001"]);
    expect(filterContacts(list, "zzzz")).toEqual([]);
    expect(filterContacts(list, "   ")).toHaveLength(2);
  });

  it("orders alphabetically by name, then id, regardless of server order", () => {
    const list = [person(3, { name: "zed" }), person(1, { name: "Amy" }), person(2, { name: "amy" })];
    expect(sortContacts(list).map((c) => c.id)).toEqual(["u001", "u002", "u003"]);
    expect(list.map((c) => c.id)).toEqual(["u003", "u001", "u002"]);
  });

  it("pages 50 at a time and clamps a stale page when the list shrinks (highest-risk path)", () => {
    const first = paginateContacts(everyone, 1);
    expect(CONTACT_BOOK_PAGE_SIZE).toBe(50);
    expect(first.items).toHaveLength(50);
    expect(first.pages).toBe(3);
    expect(paginateContacts(everyone, 3).items).toHaveLength(20);
    // Page 3 was showing; a search leaves one page of results.
    const narrowed = paginateContacts(everyone.slice(0, 10), 3);
    expect(narrowed.page).toBe(1);
    expect(narrowed.items).toHaveLength(10);
    expect(paginateContacts([], 5)).toMatchObject({ page: 1, pages: 1, total: 0, items: [] });
  });

  it("summarizes the visible range", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageSummary(321, 7, 50)).toBe("301–321 of 321");
    expect(pageSummary(321, 1, 50)).toBe("1–50 of 321");
    expect(pageSummary(0, 1, 50)).toBe("No contacts");
  });

  it("names ministry roles, skipping any it doesn't know", () => {
    expect(roleSummary(["MENTOR", "PRIEST"])).toBe("Mentor · Priest");
    expect(roleSummary(["SOMETHING_NEW", "PARENT"])).toBe("Parent");
    expect(roleSummary([])).toBeNull();
    expect(roleSummary(undefined)).toBeNull();
  });
});

describe("native contact actions", () => {
  it("builds tel/sms links from a formatted number and keeps a leading +", () => {
    expect(dialablePhone("(555) 010-2000")).toBe("5550102000");
    expect(telUrl("+1 (555) 010-2000")).toBe("tel:+15550102000");
    expect(smsUrl("555.010.2000")).toBe("sms:5550102000");
  });

  it("returns no call/text action for a missing or non-numeric phone (highest-risk path)", () => {
    for (const phone of [null, undefined, "", "   ", "n/a"]) {
      expect(telUrl(phone)).toBeNull();
      expect(smsUrl(phone)).toBeNull();
    }
  });

  it("builds a mailto link only for something that looks like an address", () => {
    expect(mailUrl(" ava@example.com ")).toBe("mailto:ava@example.com");
    expect(mailUrl("not-an-email")).toBeNull();
  });
});

describe("contact book state", () => {
  it("holds the whole directory, and a refresh replaces it (happy path)", () => {
    let state = initialContactBookState("me");
    state = contactBookReducer(state, { type: "loaded", identity: "me", response: page() });
    expect(state).toMatchObject({ status: "ready", total: 2, stale: false });
    state = contactBookReducer(state, {
      type: "loaded",
      identity: "me",
      response: page({ contacts: [{ id: "u3", name: "Cy", email: "cy@example.com", phone: null }], total: 1 }),
    });
    expect(state.contacts.map((c) => c.id)).toEqual(["u3"]);
  });

  it("clears displayed contacts the moment access is revoked (highest-risk path)", () => {
    let state = contactBookReducer(initialContactBookState("me"), { type: "loaded", identity: "me", response: page() });
    expect(state.contacts).toHaveLength(2);
    state = contactBookReducer(state, { type: "started", identity: "me" });
    state = contactBookReducer(state, { type: "failed", identity: "me", error: new ApiError("Forbidden", 403) });
    expect(state.status).toBe("denied");
    expect(state.contacts).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.stale).toBe(false);
  });

  it("also clears on an expired session (401)", () => {
    let state = contactBookReducer(initialContactBookState("me"), { type: "loaded", identity: "me", response: page() });
    state = contactBookReducer(state, { type: "failed", identity: "me", error: new ApiError("Unauthorized", 401) });
    expect(state.status).toBe("expired");
    expect(state.contacts).toEqual([]);
  });

  it("keeps the last page, marked stale, only for a connectivity or server failure", () => {
    let state = contactBookReducer(initialContactBookState("me"), { type: "loaded", identity: "me", response: page() });
    state = contactBookReducer(state, { type: "failed", identity: "me", error: new Error("Could not reach the server.") });
    expect(state).toMatchObject({ status: "ready", stale: true });
    expect(state.contacts).toHaveLength(2);
  });

  it("surfaces a recoverable error when there is nothing to keep", () => {
    const state = contactBookReducer(initialContactBookState("me"), {
      type: "failed",
      identity: "me",
      error: new ApiError("Boom", 500),
    });
    expect(state).toMatchObject({ status: "error", message: "Boom", contacts: [] });
  });

  it("never reuses another identity's contacts (highest-risk path)", () => {
    let state = contactBookReducer(initialContactBookState("alice"), { type: "loaded", identity: "alice", response: page() });
    // Switching users starts from nothing...
    state = contactBookReducer(state, { type: "started", identity: "bob" });
    expect(state.identity).toBe("bob");
    expect(state.contacts).toEqual([]);
    expect(state.status).toBe("loading");
    // ...and a late response for the previous user is ignored.
    state = contactBookReducer(state, { type: "loaded", identity: "alice", response: page() });
    expect(state.contacts).toEqual([]);
    state = contactBookReducer(state, { type: "failed", identity: "alice", error: new ApiError("Forbidden", 403) });
    expect(state.status).toBe("loading");
  });
});

describe("Users configuration: Allow contact book access", () => {
  it("shows for an existing non-super-admin target and hides once Super administrator is ticked (happy path)", () => {
    expect(showsContactBookAccess({ exists: true, draftTags: ["SUNDAY_SCHOOL_SERVANT"] })).toBe(true);
    expect(showsContactBookAccess({ exists: true, draftTags: ["SUPER_ADMIN"] })).toBe(false);
    expect(showsContactBookAccess({ exists: true, draftTags: ["SUNDAY_SCHOOL_SERVANT", "SUPER_ADMIN"] })).toBe(false);
  });

  it("is not offered before the account exists", () => {
    expect(showsContactBookAccess({ exists: false, draftTags: ["SUNDAY_SCHOOL_SERVANT"] })).toBe(false);
  });

  it("lets only a super admin change it, and never during View as (highest-risk path)", () => {
    expect(canChangeContactBookAccess({ actorRole: "SUPER_ADMIN" })).toBe(true);
    expect(canChangeContactBookAccess({ actorRole: "SUPER_ADMIN", viewAs: true })).toBe(false);
    expect(canChangeContactBookAccess({ actorRole: "PRIEST" })).toBe(false);
    expect(canChangeContactBookAccess({ actorRole: "SERVANT" })).toBe(false);
    expect(canChangeContactBookAccess({ actorRole: undefined })).toBe(false);
  });

  it("saves only when the value actually changed and the target isn't a super admin", () => {
    const tags = ["SUNDAY_SCHOOL_SERVANT" as const];
    expect(contactBookAccessChanged({ draftTags: tags, original: false, next: true })).toBe(true);
    expect(contactBookAccessChanged({ draftTags: tags, original: true, next: false })).toBe(true);
    expect(contactBookAccessChanged({ draftTags: tags, original: undefined, next: false })).toBe(false);
    expect(contactBookAccessChanged({ draftTags: tags, original: true, next: true })).toBe(false);
    expect(contactBookAccessChanged({ draftTags: ["SUPER_ADMIN"], original: false, next: true })).toBe(false);
  });

  it("explains a View as rejection instead of the raw code", () => {
    expect(contactBookAccessErrorMessage(new Error("ViewAsReadOnly"))).toBe("Exit View as to change contact book access.");
    expect(contactBookAccessErrorMessage(new Error("Only active Super Admins can change contact book access"))).toBe(
      "Only active Super Admins can change contact book access",
    );
    expect(contactBookAccessErrorMessage(undefined)).toBe("Please try again.");
  });
});
