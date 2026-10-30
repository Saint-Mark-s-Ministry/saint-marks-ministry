/**
 * Pure logic for passkey sign-in and the Passkeys screen. No network, no native calls.
 *
 * The server verifies a browser-shaped WebAuthn response against an exact origin, RP ID and a cookie-bound
 * challenge (docs/passkeys.md). iOS hands back something different: raw `Data` fields under other names, and
 * no transports. The conversion below is the only place that difference is bridged, so it is the part the
 * tests verify end to end against the real verifier.
 */

import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResponseJSON,
  PasskeyCapabilityResponse,
  PasskeyRecord,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResponseJSON,
} from "@stmark/contracts";

export const PASSKEY_LIMIT = 10;
export const PASSKEY_NAME_MAX_LENGTH = 80;
/** Adding or removing a passkey needs a real sign-in within this window (server: PASSKEY_RECENT_LOGIN_MS). */
export const PASSKEY_RECENT_SIGN_IN_MS = 10 * 60 * 1000;

export const PASSKEY_LIMIT_MESSAGE = `You have ${PASSKEY_LIMIT} passkeys, the most an account can have. Remove one to add another.`;
export const RECENT_SIGN_IN_MESSAGE =
  "To add or remove a passkey, sign in again first. Sign out, then sign back in with your password or a passkey.";
export const PASSWORD_CHANGE_MESSAGE = "Change your password before managing passkeys.";
export const VIEW_AS_MESSAGE = "Passkeys can't be managed while you are using View as. Stop viewing as this user first.";
export const CANCELLED_SIGN_IN_MESSAGE =
  "Passkey request cancelled or timed out. You can try again or use your password.";
export const REJECTED_SIGN_IN_MESSAGE =
  "Unable to sign in with this passkey. Try again or use your password.";

// ---------------------------------------------------------------------------
// What the native module returns. Every binary field is already base64url.

export type NativeRegistration = {
  credentialId: string;
  clientDataJSON: string;
  attestationObject: string;
};
export type NativeAssertion = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string;
};

const BASE64URL = /^[A-Za-z0-9_-]+$/;
export const isBase64Url = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 16_384 && BASE64URL.test(value);

/** Apple platform passkeys are iCloud Keychain credentials: on this device, and usable from a nearby one. */
const PLATFORM_TRANSPORTS = ["internal", "hybrid"];

export function registrationToJSON(native: NativeRegistration): PasskeyRegistrationResponseJSON {
  for (const value of [native.credentialId, native.clientDataJSON, native.attestationObject])
    if (!isBase64Url(value)) throw new Error("The passkey response was not valid. Please try again.");
  return {
    id: native.credentialId,
    rawId: native.credentialId,
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: native.clientDataJSON,
      attestationObject: native.attestationObject,
      transports: PLATFORM_TRANSPORTS,
    },
    clientExtensionResults: {},
  };
}

export function assertionToJSON(native: NativeAssertion): PasskeyAuthenticationResponseJSON {
  for (const value of [native.credentialId, native.clientDataJSON, native.authenticatorData, native.signature, native.userHandle])
    if (!isBase64Url(value)) throw new Error("The passkey response was not valid. Please try again.");
  return {
    id: native.credentialId,
    rawId: native.credentialId,
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: native.clientDataJSON,
      authenticatorData: native.authenticatorData,
      signature: native.signature,
      userHandle: native.userHandle,
    },
    clientExtensionResults: {},
  };
}

// ---------------------------------------------------------------------------
// Challenges: what the native request is built from.

export type NativeRegistrationRequest = {
  rpId: string;
  challenge: string;
  userId: string;
  userName: string;
  displayName: string;
  excludeCredentialIds: string[];
};
export type NativeAuthenticationRequest = { rpId: string; challenge: string };

const MALFORMED = "The server sent an unexpected passkey request. Please try again.";
const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The RP ID the server's challenge names must be the one this deployment advertised. */
export function registrationRequestFor(options: PasskeyRegistrationOptions, rpId: string): NativeRegistrationRequest {
  const issuer = options?.rp?.id;
  if (!issuer || !sameHost(issuer, rpId) || !isBase64Url(options.challenge) || !isBase64Url(options.user?.id))
    throw new Error(MALFORMED);
  return {
    rpId: issuer,
    challenge: options.challenge,
    userId: options.user.id,
    userName: String(options.user.name ?? ""),
    displayName: String(options.user.displayName ?? options.user.name ?? ""),
    excludeCredentialIds: (options.excludeCredentials ?? []).map((entry) => entry.id).filter(isBase64Url),
  };
}

export function authenticationRequestFor(options: PasskeyAuthenticationOptions, rpId: string): NativeAuthenticationRequest {
  if (!options?.rpId || !sameHost(options.rpId, rpId) || !isBase64Url(options.challenge)) throw new Error(MALFORMED);
  return { rpId: options.rpId, challenge: options.challenge };
}

// ---------------------------------------------------------------------------
// When to offer passkeys at all.

/**
 * Offer passkeys only when the server says they are on, says an iOS App ID is enabled for them, and this
 * build is associated with the same domain the server uses as its RP ID. A server that predates native
 * support sends neither `ios` nor `rpId`, so it never offers them: it cannot serve the association file.
 */
export function passkeysOffered(
  capability: PasskeyCapabilityResponse | null | undefined,
  buildDomain: string | null | undefined,
  nativeAvailable: boolean,
): boolean {
  return (
    nativeAvailable &&
    capability?.enabled === true &&
    capability.ios === true &&
    !!capability.rpId &&
    !!buildDomain &&
    sameHost(capability.rpId, buildDomain)
  );
}

// ---------------------------------------------------------------------------
// The list.

export type PasskeyNameCheck = { name: string; error?: string };
export function validatePasskeyName(raw: string): PasskeyNameCheck {
  const name = raw.trim();
  if (!name) return { name, error: "Enter a name for this passkey, such as “My iPhone”." };
  if (name.length > PASSKEY_NAME_MAX_LENGTH)
    return { name, error: `Use ${PASSKEY_NAME_MAX_LENGTH} characters or fewer.` };
  return { name };
}

export const passkeyLimitReached = (count: number) => count >= PASSKEY_LIMIT;

export function formatPasskeyDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(date);
}

/** "Added Oct 14, 2026 · Last used Oct 20, 2026", or "· Not used yet". */
export function passkeyFootnote(record: Pick<PasskeyRecord, "createdAt" | "lastUsedAt">, timeZone?: string): string {
  const added = formatPasskeyDate(record.createdAt, timeZone);
  const used = record.lastUsedAt ? formatPasskeyDate(record.lastUsedAt, timeZone) : "";
  return [added ? `Added ${added}` : "", used ? `Last used ${used}` : "Not used yet"].filter(Boolean).join(" · ");
}

export const removePasskeyTitle = (name: string) => `Remove “${name}”?`;
export const REMOVE_PASSKEY_MESSAGE =
  "You won't be able to sign in with this passkey any more. Your password and your other passkeys keep working.";

// ---------------------------------------------------------------------------
// The ten-minute window.

export type SignInFreshness = "fresh" | "stale" | "unknown";

/**
 * Advisory only: the server decides. `authenticatedAt` is the server's clock, so a phone that runs behind
 * sees a time in the future, which counts as fresh rather than blocking someone the server would accept.
 */
export function signInFreshness(authenticatedAt: number | undefined, now = Date.now()): SignInFreshness {
  if (typeof authenticatedAt !== "number" || !Number.isFinite(authenticatedAt)) return "unknown";
  return now - authenticatedAt > PASSKEY_RECENT_SIGN_IN_MS ? "stale" : "fresh";
}

// ---------------------------------------------------------------------------
// Errors.

export type PasskeyErrorKind = "cancelled" | "recent-sign-in" | "password-change" | "view-as" | "not-associated" | "duplicate" | "unavailable" | "other";

type Errorish = { message?: unknown; code?: unknown; status?: unknown };

/** Native codes (modules/passkeys) and server answers, folded into the few cases the screens treat differently. */
export function classifyPasskeyError(error: unknown): { kind: PasskeyErrorKind; message: string } {
  const { message, code, status } = (error && typeof error === "object" ? error : {}) as Errorish;
  const text = typeof message === "string" ? message : "";
  if (code === "ViewAsReadOnly") return { kind: "view-as", message: VIEW_AS_MESSAGE };
  if (code === "ERR_PASSKEY_CANCELLED")
    return { kind: "cancelled", message: "Passkey request cancelled or timed out. You can try again or use another sign-in method." };
  if (code === "ERR_PASSKEY_DUPLICATE")
    return { kind: "duplicate", message: "This device already has a passkey for your account." };
  if (code === "ERR_PASSKEY_NOT_ASSOCIATED" || code === "ERR_PASSKEY_UNSUPPORTED")
    return { kind: "not-associated", message: "This version of the app isn't set up for passkeys with the server yet. Use your password for now." };
  if (status === 403 && /sign in again/i.test(text)) return { kind: "recent-sign-in", message: RECENT_SIGN_IN_MESSAGE };
  if (status === 403 && /change your password/i.test(text)) return { kind: "password-change", message: PASSWORD_CHANGE_MESSAGE };
  if (status === 503) return { kind: "unavailable", message: "Passkeys aren't available right now." };
  return { kind: "other", message: text || "Unable to use this passkey. Please try again." };
}
