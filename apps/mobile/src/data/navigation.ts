import type { PortalUser } from "./api-client";

/**
 * Ministry switching, ported from the web app's lib/navigation.ts. The web
 * model reads `user.sundaySchool.hasAccess` directly off the session;
 * mobile's `PortalUser` carries no such field, so we use the same signal the
 * rest of the app already relies on — whether `/api/sunday-school/classes`
 * returned anything for this account (PortalProvider's `classes`). This
 * holds for SUPER_ADMIN/PRIEST too, since that endpoint already returns
 * every class for them rather than only assigned ones.
 */
export type Ministry = "prep" | "sundaySchool";

export interface MinistryOption {
  id: Ministry;
  name: string;
}

export const MINISTRY_NAMES: Record<Ministry, string> = {
  prep: "Servants Prep",
  sundaySchool: "Sunday School",
};

/**
 * The ministries this person can open, in switcher order. With one, the
 * switcher collapses to a plain label (mirrors the web's MinistrySwitcher).
 */
export function availableMinistries(
  user: Pick<PortalUser, "role">,
  hasSundaySchoolAccess: boolean,
): MinistryOption[] {
  // A parent's whole app is Sunday School (their children, registrations);
  // they serve no class, so "has classes" must not be what grants it, or they
  // land in a Servants Prep dashboard with nothing for them.
  if (user.role === "PARENT") {
    return [{ id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool }];
  }
  if (user.role === "SERVANT") {
    return hasSundaySchoolAccess
      ? [{ id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool }]
      : [];
  }
  const prep: MinistryOption = { id: "prep", name: MINISTRY_NAMES.prep };
  // Sunday School is a servant's ministry. A student can be *assigned* to a
  // class (an async student does their rotation in one) without being a
  // servant, and "has a class" must not open the servant tools to them; the
  // web offers Sunday School only to administrators and mentors with access.
  const SERVES_SUNDAY_SCHOOL = ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP", "MENTOR"];
  if (!hasSundaySchoolAccess || !SERVES_SUNDAY_SCHOOL.includes(user.role)) return [prep];
  return [prep, { id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool }];
}

/**
 * Default ministry to land in on a cold start, before any manual switch.
 * Sunday School is this app's pre-existing default (everything that works
 * today lives there) — only fall back to Prep when Sunday School genuinely
 * isn't one of this account's options, e.g. a Mentor/Student with no
 * Sunday School assignment.
 */
export function defaultMinistry(
  user: Pick<PortalUser, "role">,
  hasSundaySchoolAccess: boolean,
): Ministry {
  const options = availableMinistries(user, hasSundaySchoolAccess);
  if (!options.length) return "prep";
  return options.some((option) => option.id === "sundaySchool")
    ? "sundaySchool"
    : "prep";
}

/**
 * Screens that belong to neither ministry (account, notifications, readings…):
 * they keep whichever ministry's tint you arrived from.
 */
const SHARED_ROUTES = new Set([
  "account",
  "notifications",
  "profile",
  "switch-ministry",
  "change-password",
  "passkeys",
  "delete-account",
  "view-as",
  "readings",
  "calendar-day",
  "academic-years",
  "contact-book",
  // The feedback board is one screen for both ministries: it keeps the accent of the one you opened it from.
  "feedback",
  "index",
  "sign-in",
  "+not-found",
]);

/**
 * Which ministry's accent a route should be drawn in, from its first path
 * segment (`(prep)`, `(tabs)`, `prep-files`, `roster`, …). Decided once at the
 * root so a pushed screen's header, toolbar and bars agree with its body, rather
 * than each screen tinting only part of itself.
 */
export function ministryForSegments(segments: readonly string[], previous: Ministry): Ministry {
  const first = segments[0];
  if (!first) return previous;
  if (first === "(prep)" || first.startsWith("prep-")) return "prep";
  if (first === "(tabs)") return "sundaySchool";
  if (SHARED_ROUTES.has(first)) return previous;
  return "sundaySchool";
}
