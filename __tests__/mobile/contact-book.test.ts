import { describe, expect, it } from "vitest";
import { ApiError } from "../../apps/mobile/src/data/api-client";
import {
  canSeeContactBook,
  contactBookPath,
  contactBookReducer,
  dialablePhone,
  initialContactBookState,
  isContactBookDeniedLocally,
  mailUrl,
  pageCount,
  pageSummary,
  smsUrl,
  telUrl,
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
  page: 1,
  pageSize: 50,
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

describe("request building and paging", () => {
  it("asks for page 1 with no search by default, and trims the search term", () => {
    expect(contactBookPath("", 1)).toBe("/api/contact-book?page=1");
    expect(contactBookPath("  ava ", 3)).toBe("/api/contact-book?search=ava&page=3");
  });

  it("encodes the term and never sends a page below 1", () => {
    expect(contactBookPath("a&b=c", 0)).toBe("/api/contact-book?search=a%26b%3Dc&page=1");
  });

  it("derives page counts and summaries from the 50-per-page response", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageSummary(321, 7, 50)).toBe("301–321 of 321");
    expect(pageSummary(321, 1, 50)).toBe("1–50 of 321");
    expect(pageSummary(0, 1, 50)).toBe("No contacts");
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
  it("shows the first page, then replaces it with the next (happy path)", () => {
    let state = initialContactBookState("me");
    state = contactBookReducer(state, { type: "loaded", identity: "me", response: page() });
    expect(state).toMatchObject({ status: "ready", total: 2, page: 1, stale: false });
    state = contactBookReducer(state, {
      type: "loaded",
      identity: "me",
      response: page({ page: 2, contacts: [{ id: "u3", name: "Cy", email: "cy@example.com", phone: null }], total: 51 }),
    });
    expect(state.contacts.map((c) => c.id)).toEqual(["u3"]);
    expect(state.page).toBe(2);
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
