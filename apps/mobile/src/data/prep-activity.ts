/**
 * Pure logic for the Servants Prep Activity log (SMM-41), pulled out of the
 * screen component so result filtering, action labeling, and metadata
 * redaction/formatting are unit-testable without rendering native UI.
 *
 * Scope-honesty note (confirmed by grepping every `recordAuditEvent`/
 * `auditEvent.create` call site in the web app): only five action types are
 * actually ever written today — AUTH_LOGIN, AUTH_PASSWORD_CHANGE,
 * user.delete, user.role_tags.update, sunday_school.priest_note.create. The
 * design source's sample rows ("Approved servant application", "Took
 * attendance", "Uploaded attendance slip", "Created lesson") are not backed
 * by any real audit write — those actions aren't audited anywhere in the
 * codebase. ACTION_LABELS covers the five real ones; anything else (future
 * action types) falls back to a readable transform of the raw string rather
 * than a fabricated label.
 */

export function canViewActivity(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}

export type AuditResult = "SUCCESS" | "DENIED" | "FAILED";
export type ResultFilter = "" | "DENIED" | "FAILED";

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  result: AuditResult;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
  target: { id: string; name: string | null; email: string } | null;
  metadata: Record<string, unknown> | null;
};

export function filterByResult<T extends { result: AuditResult }>(events: T[], filter: ResultFilter): T[] {
  if (!filter) return events;
  return events.filter((e) => e.result === filter);
}

const ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: "Sign-in",
  AUTH_PASSWORD_CHANGE: "Changed password",
  "user.delete": "Deleted user",
  "user.role_tags.update": "Updated access tags",
  "sunday_school.priest_note.create": "Added confidential note",
};

/** Falls back to a readable transform (not a guess) for any action not in the real, confirmed inventory above. */
export function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const REASON_LABELS: Record<string, string> = {
  ACCOUNT_DISABLED: "Account disabled",
  INVALID_CREDENTIALS: "Invalid credentials",
  CURRENT_PASSWORD_INCORRECT: "Current password incorrect",
};

/** Known short reason codes get a readable label; anything else (e.g. a free-text admin note) passes through as written. */
export function formatReason(reason: string | null): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

export type Tone = "success" | "warning" | "danger";

export function resultTone(result: AuditResult): Tone {
  if (result === "SUCCESS") return "success";
  if (result === "DENIED") return "warning";
  return "danger";
}

export function resultLabel(result: AuditResult): string {
  if (result === "SUCCESS") return "OK";
  if (result === "DENIED") return "Denied";
  return "Failed";
}

export function actorLabel(event: Pick<AuditEvent, "actor">): string {
  return event.actor?.name ?? event.actor?.email ?? "Unknown";
}

/** "Affected record" summary: a named User target when there is one, otherwise the raw entity type + a shortened id. */
export function targetLabel(event: Pick<AuditEvent, "entityType" | "entityId" | "target">): string {
  if (event.target) return `${event.entityType} · ${event.target.name ?? event.target.email}`;
  if (event.entityId) return `${event.entityType} · ${shortId(event.entityId)}`;
  return event.entityType;
}

/** Matches the design source's own truncation style for a record id (e.g. "clx9…f2a"). */
export function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-3)}`;
}

const SENSITIVE_KEY = /password|token|secret|authorization|cookie/i;

/**
 * Flattens the server's already-sanitized `metadata` JSON into readable
 * key/value rows for the expanded-row detail. Defensively re-checks for
 * sensitive key names client-side too, in case a future action's metadata
 * reaches the client before the server-side allowlist is updated to match.
 */
export function metadataEntries(metadata: Record<string, unknown> | null): { key: string; value: string }[] {
  if (!metadata) return [];
  return Object.entries(metadata)
    .filter(([key, value]) => !SENSITIVE_KEY.test(key) && value !== undefined)
    .map(([key, value]) => ({ key, value: formatMetadataValue(value) }));
}

function formatMetadataValue(value: unknown): string {
  if (value === null) return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
