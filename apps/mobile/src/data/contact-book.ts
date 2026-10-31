/**
 * Pure logic for the native Contact Book: who may see the entry point, how
 * requests are built, how rows turn into native contact actions, and the
 * state machine that keeps displayed contacts tied to one signed-in identity.
 *
 * The server is the only authority. `canSeeContactBook` reads session
 * metadata and exists solely to decide whether to *show a menu entry*; the
 * screen itself always asks the API and renders its answer.
 */

import type { ContactBookEntry, ContactBookResponse } from "@stmark/contracts";
import { ApiError } from "./api-client";

export type { ContactBookEntry, ContactBookResponse };

/** Navigation visibility only. Super admins use the Users page instead, even with a stored grant. */
export function canSeeContactBook(
  user: { role: string; canAccessContactBook?: boolean } | null | undefined,
): boolean {
  return !!user && user.role !== "SUPER_ADMIN" && user.canAccessContactBook === true;
}

/** Super admins are denied by the server regardless of any stored grant, so no request is made for them. */
export function isContactBookDeniedLocally(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

/** The server returns the whole directory; search, order and paging happen on the device. */
export const CONTACT_BOOK_PATH = "/api/contact-book";
export const CONTACT_BOOK_PAGE_SIZE = 50;

/** Case-insensitive match on name, email, or phone, like the web directory. An empty term keeps everyone. */
export function filterContacts(contacts: ContactBookEntry[], term: string): ContactBookEntry[] {
  const query = term.trim().toLocaleLowerCase();
  if (!query) return contacts;
  return contacts.filter((contact) =>
    [contact.name, contact.email, contact.phone ?? ""].some((value) => value.toLocaleLowerCase().includes(query)),
  );
}

/** Alphabetical by name, then id, so the order never depends on how the server happened to return it. */
export function sortContacts(contacts: ContactBookEntry[]): ContactBookEntry[] {
  return [...contacts].sort(
    (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id),
  );
}

export interface ContactPage {
  items: ContactBookEntry[];
  /** The page actually shown, clamped into range when the list shrinks (search, refresh, revocation). */
  page: number;
  pages: number;
  total: number;
}

export function paginateContacts(
  contacts: ContactBookEntry[],
  page: number,
  pageSize: number = CONTACT_BOOK_PAGE_SIZE,
): ContactPage {
  const pages = Math.max(1, Math.ceil(contacts.length / pageSize));
  const shown = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  return {
    items: contacts.slice((shown - 1) * pageSize, shown * pageSize),
    page: shown,
    pages,
    total: contacts.length,
  };
}

const ROLE_LABELS: Record<string, string> = {
  SUNDAY_SCHOOL_COORDINATOR: "Sunday School Coordinator",
  SUNDAY_SCHOOL_SERVANT: "Sunday School Servant",
  SERVANTS_PREP_SERVANT: "Servants Prep Servant",
  MENTOR: "Mentor",
  PRIEST: "Priest",
  PARENT: "Parent",
  SERVANTS_PREP_STUDENT: "Servants Prep Student",
  SUNDAY_SCHOOL_STUDENT: "Sunday School Student",
};

/** "Mentor · Priest", or null when the server sent no roles. Unknown roles are skipped, not guessed. */
export function roleSummary(roles: string[] | undefined): string | null {
  const labels = (roles ?? []).flatMap((role) => (ROLE_LABELS[role] ? [ROLE_LABELS[role]] : []));
  return labels.length ? labels.join(" · ") : null;
}

export function pageCount(total: number, pageSize: number): number {
  if (!pageSize || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "1–50 of 321", or "No contacts". */
export function pageSummary(total: number, page: number, pageSize: number): string {
  if (total <= 0) return "No contacts";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `${first}–${last} of ${total}`;
}

/** Keeps digits and a leading "+", so formatted numbers still dial. Null when nothing dialable remains. */
export function dialablePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const cleaned = (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
  return /\d/.test(cleaned) ? cleaned : null;
}

export function telUrl(phone: string | null | undefined): string | null {
  const dial = dialablePhone(phone);
  return dial ? `tel:${dial}` : null;
}

export function smsUrl(phone: string | null | undefined): string | null {
  const dial = dialablePhone(phone);
  return dial ? `sms:${dial}` : null;
}

export function mailUrl(email: string | null | undefined): string | null {
  const address = email?.trim();
  return address && address.includes("@") ? `mailto:${address}` : null;
}

export type ContactBookStatus = "loading" | "ready" | "denied" | "expired" | "error";

export interface ContactBookState {
  /** The effective signed-in user these contacts belong to. */
  identity: string;
  status: ContactBookStatus;
  contacts: ContactBookEntry[];
  total: number;
  message: string | null;
  /** Contacts are still shown, but the last refresh failed (offline, server error). */
  stale: boolean;
}

export function initialContactBookState(identity: string): ContactBookState {
  return { identity, status: "loading", contacts: [], total: 0, message: null, stale: false };
}

export type ContactBookEvent =
  | { type: "started"; identity: string }
  | { type: "loaded"; identity: string; response: ContactBookResponse }
  | { type: "failed"; identity: string; error: unknown };

/**
 * Contacts never outlive the identity or permission that fetched them:
 * - a response or failure from another identity is ignored;
 * - starting under a different identity discards everything first;
 * - a 403 clears displayed contacts at once (revoked, disabled, super admin);
 * - a 401 clears them too (the session is gone).
 * Only a plain connectivity or server failure keeps the last good page, marked stale.
 */
export function contactBookReducer(state: ContactBookState, event: ContactBookEvent): ContactBookState {
  if (event.type === "started") {
    if (event.identity !== state.identity) return initialContactBookState(event.identity);
    return state.contacts.length ? { ...state, stale: false } : { ...state, status: "loading", message: null, stale: false };
  }
  if (event.identity !== state.identity) return state;

  if (event.type === "loaded") {
    const { contacts, total } = event.response;
    return { identity: state.identity, status: "ready", contacts, total, message: null, stale: false };
  }

  const error = event.error;
  const base = { ...state, contacts: [] as ContactBookEntry[], total: 0, stale: false };
  if (error instanceof ApiError && error.status === 403) {
    return { ...base, status: "denied", message: "Contact Book access isn't enabled for your account." };
  }
  if (error instanceof ApiError && error.status === 401) {
    return { ...base, status: "expired", message: "Your session expired. Sign in again." };
  }
  const message = error instanceof Error ? error.message : "Unable to load the Contact Book.";
  if (state.contacts.length) return { ...state, status: "ready", stale: true, message };
  return { ...base, status: "error", message };
}
