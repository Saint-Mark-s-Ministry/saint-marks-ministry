import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticatedRoutes, publicRoutes } from "../../apps/mobile/src/data/route-access";

function rootRoutes(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith("(")) return [name];
      return rootRoutes(join(directory, entry.name), `${name}/`);
    }
    return entry.name.endsWith(".tsx") && entry.name !== "_layout.tsx"
      ? [name.slice(0, -4)] : [];
  });
}

describe("mobile authentication route boundary", () => {
  it("classifies every route so unlisted private screens cannot mount signed out", () => {
    const actual = rootRoutes(join(process.cwd(), "apps/mobile/src/app")).sort();
    const classified = [...publicRoutes, ...authenticatedRoutes];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.sort()).toEqual(actual);
  });

  it("keeps ministry screens private and sign-in and registration public", () => {
    expect(authenticatedRoutes).toEqual(expect.arrayContaining([
      "(tabs)", "(prep)", "index", "account", "attendance/[classId]", "child/[id]",
    ]));
    expect(publicRoutes).toEqual([
      "sign-in", "registration", "registration/apply", "signup/parent", "signup/servant", "roster-signup",
    ]);
  });
});
