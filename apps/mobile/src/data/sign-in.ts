/**
 * Pure logic for the Sign in screen (SMM-59).
 *
 * Confirmed live: wrong password and an unknown email both come back as the
 * exact same `401` + `?error=Invalid%20credentials` (lib/auth.ts's
 * `authorize()` throws the identical "Invalid credentials" message for
 * both, and for a disabled account too) — and api-client.ts's own
 * `/api/auth/callback/credentials` branch collapses ANY non-2xx response
 * from that route into one further-generalized client message regardless
 * of status or body. That double collapsing IS this ticket's own "without
 * disclosing account existence" requirement, already enforced server-side —
 * this module never tries to re-distinguish locked/disabled/unverified/
 * rate-limited from each other, since the real API gives it no way to
 * safely do so. The one real distinction available to the client is
 * network failure vs. a reached-the-server rejection — see
 * `signInFailureKind` below.
 */

/** A syntactically plausible email — client-side hint only; the server is the real authority. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function canSubmitSignIn(email: string, password: string, connected: boolean): boolean {
  return connected && looksLikeEmail(email) && password.length > 0;
}

export type SignInFailureKind = "offline" | "rejected";

// The exact text api-client.ts's own request() throws when the request
// never reached the server at all (network/timeout/DNS) — every other
// sign-in failure (wrong password, disabled, rate-limited, unknown email)
// is deliberately the same generic message instead, by the real server's
// own design ("without disclosing account existence"). This is the one real
// signal the client has to tell the two kinds apart; there's no status code
// to check; both land as a plain Error with only their text to go on.
const OFFLINE_MESSAGE = "Could not reach the server. Check your connection and try again.";

export function signInFailureKind(error: unknown): SignInFailureKind {
  return error instanceof Error && error.message === OFFLINE_MESSAGE ? "offline" : "rejected";
}
