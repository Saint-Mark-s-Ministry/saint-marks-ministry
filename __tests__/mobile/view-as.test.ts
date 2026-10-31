import { describe, expect, it, vi } from "vitest";
import { PortalApi, type PortalSession } from "../../apps/mobile/src/data/api-client";

const actor = { id: "admin", role: "SUPER_ADMIN" };
const viewed = { user: { id: "student", role: "STUDENT" }, impersonating: { originalId: "admin", readOnly: true, expiresAt: Date.now() + 60000 } };
const response = (body: unknown, cookie?: string) => ({ status: 200, ok: true, headers: new Headers(cookie ? { "set-cookie": cookie } : {}), json: async () => body });
const storage = () => ({ load: async () => ({}), save: vi.fn(async () => {}) });

describe("mobile View as", () => {
  it("restores a viewed session and blocks every unsafe data method before sending", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(viewed));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    await client.session();
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      await expect(client.request("/api/attendance", { method })).rejects.toMatchObject({ status: 403, code: "ViewAsReadOnly" });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    await client.request("/api/classes");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses CSRF and the existing session update, persists rotated cookies, and exits without sign-out", async () => {
    const saved = storage();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ csrfToken: "csrf" }))
      .mockResolvedValueOnce(response(viewed, "next-auth.session-token=viewed"))
      .mockResolvedValueOnce(response({ csrfToken: "csrf" }))
      .mockResolvedValueOnce(response({ user: actor }, "next-auth.session-token=actor"));
    const client = new PortalApi("https://example.com", fetcher, saved, false);
    const changed = vi.fn(); client.onSessionChanged = changed;
    await client.updateViewAs("student");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ csrfToken: "csrf", data: { impersonate: "student" } });
    expect(changed).toHaveBeenLastCalledWith(viewed, true);
    await client.updateViewAs(null);
    expect(JSON.parse(fetcher.mock.calls[3][1].body).data).toEqual({ impersonate: null });
    expect(changed).toHaveBeenLastCalledWith({ user: actor }, true);
    expect(saved.save).toHaveBeenLastCalledWith({ "next-auth.session-token": { value: "actor", secure: false } });
  });
  it("reports denied switching and adopts the actual server identity", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: "csrf" })).mockResolvedValueOnce(response({ user: actor }));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    const changed = vi.fn(); client.onSessionChanged = changed;
    await expect(client.updateViewAs("student")).rejects.toThrow("could not be started");
    expect(changed).toHaveBeenCalledWith({ user: actor }, true);
  });
  it("invalidates reads already decoding when the identity changes", async () => {
    let finish!: (value: unknown) => void;
    const decoding = new Promise(resolve => { finish = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce({ ...response({}), json: () => decoding })
      .mockResolvedValueOnce(response({ csrfToken: "csrf" })).mockResolvedValueOnce(response(viewed));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    const pending = client.request("/api/classes");
    await Promise.resolve();
    await client.updateViewAs("student");
    finish({ oldAdminData: true });
    await expect(pending).rejects.toThrow();
  });
  it("rejects data loads during switching and restores the actor on session expiry", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    const waiting = new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; });
    const fetcher = vi.fn().mockImplementationOnce(() => waiting).mockResolvedValueOnce(response(viewed)).mockResolvedValueOnce(response({ user: actor })).mockResolvedValueOnce(response({ ok: true }));
    const client = new PortalApi("https://example.com", fetcher, storage(), false);
    const pending = client.updateViewAs("student");
    await expect(client.request("/api/classes")).rejects.toMatchObject({ status: 409 });
    finish(response({ csrfToken: "csrf" })); await pending;
    const changed = vi.fn<(session: PortalSession, changed: boolean) => void>(); client.onSessionChanged = changed;
    await client.session();
    expect(changed).toHaveBeenLastCalledWith({ user: actor }, true);
    await client.request("/api/attendance", { method: "POST" });
  });
});
