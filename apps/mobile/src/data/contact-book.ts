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

export function contactBookPath(search: string, page: number): string {
  const params = new URLSearchParams();
  const term = search.trim();
  if (term) params.set("search", term);
  params.set("page", String(Math.max(1, Math.trunc(page) || 1)));
  return `/api/contact-book?${params.toString()}`;
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
  page: number;
  pageSize: number;
  message: string | null;
  /** Contacts are still shown, but the last refresh failed (offline, server error). */
  stale: boolean;
}

export function initialContactBookState(identity: string): ContactBookState {
  return { identity, status: "loading", contacts: [], total: 0, page: 1, pageSize: 50, message: null, stale: false };
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
    const { contacts, total, page, pageSize } = event.response;
    return { identity: state.identity, status: "ready", contacts, total, page, pageSize, message: null, stale: false };
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
