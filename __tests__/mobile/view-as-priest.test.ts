import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PortalApi } from "../../apps/mobile/src/data/api-client";
import {
  canStartViewAs,
  viewAsAccessChanged,
  viewAsAccessControl,
  viewAsAccessPath,
  viewAsEndedMessage,
  viewAsRemainingLabel,
  viewAsStartErrorMessage,
} from "../../apps/mobile/src/data/view-as";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const response = (body: unknown, cookie?: string) => ({ status: 200, ok: true, headers: new Headers(cookie ? { "set-cookie": cookie } : {}), json: async () => body });
const storage = () => ({ load: async () => ({}), save: vi.fn(async () => {}) });

describe("who is offered View As", () => {
  it("offers it to a Super Admin and to an account the server marked, never from a role alone", () => {
    expect(canStartViewAs({ user: { role: "SUPER_ADMIN" }, viewingAs: null })).toBe(true);
    expect(canStartViewAs({ user: { role: "SERVANT", canUseViewAs: true }, viewingAs: null })).toBe(true);
    // A Priest has no role value of its own and no flag from the server: nothing to show.
    expect(canStartViewAs({ user: { role: "SERVANT", canUseViewAs: false }, viewingAs: null })).toBe(false);
    expect(canStartViewAs({ user: { role: "SERVANT" }, viewingAs: null })).toBe(false);
    expect(canStartViewAs({ user: { role: "PRIEST" }, viewingAs: null })).toBe(false);
    expect(canStartViewAs({ user: null, viewingAs: null })).toBe(false);
  });

  it("stays available inside a preview, whoever is being viewed", () => {
    expect(canStartViewAs({ user: { role: "STUDENT" }, viewingAs: { originalId: "p" } })).toBe(true);
  });

  it("is withheld while a password change is forced", () => {
    expect(canStartViewAs({ user: { role: "SUPER_ADMIN", mustChangePassword: true }, viewingAs: null })).toBe(false);
    expect(canStartViewAs({ user: { role: "SERVANT", canUseViewAs: true, mustChangePassword: true }, viewingAs: null })).toBe(false);
  });
});

describe("the preview countdown", () => {
  const now = 1_000_000;
  it("counts down in minutes and never goes negative", () => {
    expect(viewAsRemainingLabel(now + 30 * 60000, now)).toBe("30 min left");
    expect(viewAsRemainingLabel(now + 61000, now)).toBe("1 min left");
    expect(viewAsRemainingLabel(now + 30 * 60000 + 20000, now)).toBe("30 min left");
    expect(viewAsRemainingLabel(now + 20000, now)).toBe("Under a minute left");
    expect(viewAsRemainingLabel(now - 5, now)).toBe("Ending");
  });
  it("tells a person why the preview closed", () => {
    expect(viewAsEndedMessage("expired").message).toMatch(/30-minute/);
    expect(viewAsEndedMessage("unavailable").message).toMatch(/no longer available/);
  });
});

describe("the Allow View as switch on a person's access screen", () => {
  const base = {
    exists: true,
    actorRole: "SUPER_ADMIN",
    viewingAs: false,
    targetRole: "SERVANT",
    targetDisabled: false,
    draftTags: ["PRIEST"] as const,
    granted: false,
  };
  it("is offered for an active priest and lets a Super Admin grant it", () => {
    const control = viewAsAccessControl(base);
    expect(control).toMatchObject({ visible: true, editable: true, canGrant: true });
    expect(viewAsAccessChanged({ control, original: false, next: true })).toBe(true);
    expect(viewAsAccessChanged({ control, original: false, next: false })).toBe(false);
  });
  it("is not offered for anyone who is not a priest and has no grant", () => {
    expect(viewAsAccessControl({ ...base, draftTags: ["SUNDAY_SCHOOL_SERVANT"] })).toEqual({ visible: false });
    expect(viewAsAccessControl({ ...base, draftTags: [] })).toEqual({ visible: false });
  });
  it("has no switch for a new account or a Super Admin, who already has access", () => {
    expect(viewAsAccessControl({ ...base, exists: false })).toEqual({ visible: false });
    expect(viewAsAccessControl({ ...base, targetRole: "SUPER_ADMIN" })).toEqual({ visible: false });
    expect(viewAsAccessControl({ ...base, draftTags: ["PRIEST", "SUPER_ADMIN"] })).toEqual({ visible: false });
  });
  it("cannot be changed by priests, other roles, or inside a preview", () => {
    for (const actorRole of ["PRIEST", "SERVANT", "MENTOR", "STUDENT", undefined]) {
      expect(viewAsAccessControl({ ...base, actorRole })).toMatchObject({ visible: true, editable: false });
    }
    expect(viewAsAccessControl({ ...base, viewingAs: true })).toMatchObject({ editable: false });
    const locked = viewAsAccessControl({ ...base, actorRole: "SERVANT" });
    expect(viewAsAccessChanged({ control: locked, original: false, next: true })).toBe(false);
  });
  it("cannot be granted to a disabled account", () => {
    const control = viewAsAccessControl({ ...base, targetDisabled: true });
    expect(control).toMatchObject({ visible: true, editable: false, canGrant: false });
    expect(viewAsAccessChanged({ control, original: false, next: true })).toBe(false);
  });
  it("can still be revoked after the Priest tag is removed or the account disabled", () => {
    const untagged = viewAsAccessControl({ ...base, draftTags: ["SUNDAY_SCHOOL_SERVANT"], granted: true });
    expect(untagged).toMatchObject({ visible: true, editable: true, canGrant: false });
    expect(viewAsAccessChanged({ control: untagged, original: true, next: false })).toBe(true);
    // ...but not switched back on once it is off.
    expect(viewAsAccessChanged({ control: untagged, original: false, next: true })).toBe(false);
    const disabled = viewAsAccessControl({ ...base, targetDisabled: true, granted: true });
    expect(viewAsAccessChanged({ control: disabled, original: true, next: false })).toBe(true);
  });
  it("uses the dedicated endpoint", () => {
    expect(viewAsAccessPath("a b")).toBe("/api/admin/users/a%20b/view-as-access");
    expect(viewAsStartErrorMessage(new Error("Forbidden"))).toBe("You no longer have View as access.");
  });
});

describe("a priest's preview in the API client", () => {
  const priest = { id: "priest", role: "SERVANT", canUseViewAs: true };
  const target = { id: "student", role: "STUDENT" };
  const viewed = { user: target, impersonating: { originalId: "priest", readOnly: true, expiresAt: Date.now() + 1800000 } };

  it("adopts the capability the server sent and starts a preview through the session update only", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ user: priest }))
      .mockResolvedValueOnce(response({ csrfToken: "csrf" }))
      .mockResolvedValueOnce(response(viewed, "next-auth.session-token=viewed"));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    const changed = vi.fn(); client.onSessionChanged = changed;
    await client.session();
    expect(changed).toHaveBeenLastCalledWith({ user: priest }, true);
    await client.updateViewAs("student");
    // The body carries a target and nothing about permission.
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ csrfToken: "csrf", data: { impersonate: "student" } });
  });

  it("returns to the priest's own account, flagged as an identity change, when the server ends the preview", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(viewed)).mockResolvedValueOnce(response({ user: priest }));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    const changed = vi.fn(); client.onSessionChanged = changed;
    await client.session();
    await client.session();
    // changed=true is what clears every cached read of the viewed account.
    expect(changed).toHaveBeenLastCalledWith({ user: priest }, true);
  });

  it("signs out and clears credentials when the server closes the session after a revocation", async () => {
    const saved = storage();
    const fetcher = vi.fn().mockResolvedValueOnce(response(viewed, "next-auth.session-token=viewed")).mockResolvedValueOnce(response({}));
    const client = new PortalApi("https://example.com", fetcher, saved, false);
    const changed = vi.fn(); client.onSessionChanged = changed;
    await client.session();
    expect(await client.session()).toBeNull();
    expect(changed).toHaveBeenLastCalledWith({}, true);
    expect(saved.save).toHaveBeenLastCalledWith({});
  });

  it("keeps every write blocked for the whole preview", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(viewed));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    await client.session();
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      await expect(client.request("/api/admin/users/x/view-as-access", { method })).rejects.toMatchObject({ code: "ViewAsReadOnly" });
    }
  });
});

describe("how the app wires View As", () => {
  const person = read("apps/mobile/src/app/person/[id].tsx");
  it("changes the grant only through the dedicated endpoint", () => {
    expect(person).toContain("viewAsAccessPath(person.id)");
    expect(person).toMatch(/"PUT", \{ canUseViewAs: viewAsAllowed \}/);
    // Neither the profile update nor the role update carries it.
    expect(person).not.toMatch(/"PATCH", \{[^}]*canUseViewAs/);
    expect(person).not.toMatch(/roleTags: tags[^}]*canUseViewAs/);
  });
  it("never writes the capability into a session update", () => {
    const client = read("apps/mobile/src/data/api-client.ts");
    expect(client).not.toMatch(/data:\s*\{[^}]*canUseViewAs/);
    expect(client).toContain("data: { impersonate: targetId }");
  });
  it("shows the entry from the shared helper everywhere", () => {
    expect(read("apps/mobile/src/components/account-screen.tsx")).toContain("canStartViewAs({ user, viewingAs })");
    expect(read("apps/mobile/src/app/view-as.tsx")).toContain("canStartViewAs({ user, viewingAs })");
  });
  it("leaves a stale screen when a preview ends by itself", () => {
    const auth = read("apps/mobile/src/data/auth-provider.tsx");
    expect(auth).toContain("stopRequested");
    expect(auth).toContain("router.dismissAll()");
    expect(auth).toContain("viewAsRemainingMs(viewAsExpiresAt)");
  });
});
