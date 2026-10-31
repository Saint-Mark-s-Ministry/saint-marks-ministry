import type { SundaySchoolDashboard } from "@stmark/contracts";
import { endpoint, useResource } from "./resources";

/**
 * Whether the server says this person administers Sunday School ministry records
 * (`standing.isAdmin` on the dashboard: Super Admins and priests). This is the API's
 * own answer for the current session, not a guess from the role, and it only decides
 * which controls to offer; every write is still authorized on the server. It confers
 * nothing outside ministry records: user accounts, access tags, the Contact Book,
 * MCP tokens and feedback moderation have their own, narrower rules.
 */
export function useMinistryAdmin() {
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  return { isAdmin: dashboard.data?.standing.isAdmin === true, loaded: dashboard.data !== undefined, dashboard };
}
