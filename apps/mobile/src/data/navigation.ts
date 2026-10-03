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
  if (user.role === "SERVANT" || user.role === "PARENT") {
    return hasSundaySchoolAccess
      ? [{ id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool }]
      : [];
  }
  const prep: MinistryOption = { id: "prep", name: MINISTRY_NAMES.prep };
  if (!hasSundaySchoolAccess) return [prep];
  return [prep, { id: "sundaySchool", name: MINISTRY_NAMES.sundaySchool }];
}

/** Default ministry to land in when more than one is available. */
export function defaultMinistry(
  user: Pick<PortalUser, "role">,
  hasSundaySchoolAccess: boolean,
): Ministry {
  const options = availableMinistries(user, hasSundaySchoolAccess);
  if (!options.length) return "prep";
  // SERVANT/PARENT only ever get sundaySchool in options; everyone else
  // defaults to Prep, matching the web's prepHome()-first behavior.
  return options.some((option) => option.id === "prep")
    ? "prep"
    : options[0].id;
}
