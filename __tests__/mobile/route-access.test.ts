import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTES, SIGNED_IN_ROUTES, launchDestination } from "../../apps/mobile/src/data/route-access";

const APP_DIR = join(__dirname, "../../apps/mobile/src/app");

/** Route names exactly as expo-router names them, from the files on disk. */
function routeNames(dir: string = APP_DIR): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      const nested = routeNames(path);
      // A route group's screens live in its own navigator; the group itself is the root-level route.
      return entry.startsWith("(") ? [entry] : nested;
    }
    if (!entry.endsWith(".tsx") || entry === "_layout.tsx") return [];
    const name = relative(APP_DIR, path).replace(/\.tsx$/, "");
    return name === "index" || name.endsWith("/index") ? [name.replace(/\/?index$/, "") || "index"] : [name];
  });
}

describe("signed-out route access", () => {
  const onDisk = routeNames().filter((name) => name !== "index").sort();
  const declared = [...PUBLIC_ROUTES, ...SIGNED_IN_ROUTES].sort();

  it("classifies every screen as public or signed-in, so none is forgotten (highest-risk path)", () => {
    const unclassified = onDisk.filter((name) => !declared.includes(name as never));
    expect(unclassified).toEqual([]);
  });

  it("lists no screen that no longer exists", () => {
    const stale = declared.filter((name) => !onDisk.includes(name));
    expect(stale).toEqual([]);
  });

  it("never lists a screen as both public and signed-in", () => {
    const overlap = PUBLIC_ROUTES.filter((name) => (SIGNED_IN_ROUTES as readonly string[]).includes(name));
    expect(overlap).toEqual([]);
  });

  it("keeps the account and authenticated areas behind sign-in", () => {
    for (const name of ["(tabs)", "(prep)", "account", "delete-account", "contact-book", "prep-serving"]) {
      expect(SIGNED_IN_ROUTES as readonly string[]).toContain(name);
    }
    for (const name of ["sign-in", "registration", "signup/parent", "roster-signup"]) {
      expect(PUBLIC_ROUTES as readonly string[]).toContain(name);
    }
  });
});

describe("launchDestination", () => {
  it("opens the app for a signed-in person and Sign in for everyone else (happy path)", () => {
    expect(launchDestination({ mustChangePassword: false })).toBe("/(tabs)/home");
    expect(launchDestination(null)).toBe("/sign-in");
    expect(launchDestination(undefined)).toBe("/sign-in");
  });

  it("keeps a forced password change on the sign-in screen (highest-risk path)", () => {
    expect(launchDestination({ mustChangePassword: true })).toBe("/sign-in");
  });
});
