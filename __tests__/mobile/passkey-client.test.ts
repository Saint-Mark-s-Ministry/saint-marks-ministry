import { describe, expect, it, vi } from "vitest";
import { PortalApi, isPasskeyPath, mergeCookies, cookieHeader } from "../../apps/mobile/src/data/api-client";

const ORIGIN = "https://app.example.test";
const user = { id: "u1", name: "Person", email: "p@example.test", role: "SERVANT", mustChangePassword: false, isAsyncStudent: false, profileImageUrl: null, sundaySchool: { hasAccess: false, isCoordinator: false } };
const storage = () => ({ load: async () => ({}), save: vi.fn(async (_jar: unknown) => {}) });

type Call = { path: string; method: string; headers: Headers; body?: string };
function reply(status: number, body: unknown, cookies: string[] = []) {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return { status, ok: status >= 200 && status < 300, headers, json: async () => body };
}

/** A stand-in for the server: records every request, and answers the passkey sign-in sequence like the real routes. */
function server(options: { callback?: () => ReturnType<typeof reply>; impersonating?: boolean } = {}) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.slice(ORIGIN.length);
    const call: Call = { path, method: (init.method ?? "GET").toUpperCase(), headers: new Headers(init.headers), body: init.body as string | undefined };
    calls.push(call);
    if (path === "/api/public/passkeys/options")
      return reply(200, { challenge: "Y2hhbGxlbmdl", rpId: "app.example.test" }, ["__Host-passkey-authenticate=" + "t".repeat(43) + "; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Strict"]);
    if (path === "/api/auth/csrf") return reply(200, { csrfToken: "csrf" }, ["__Host-next-auth.csrf-token=csrf%7Chash; Path=/; HttpOnly; Secure; SameSite=Lax"]);
    if (path === "/api/auth/callback/passkey")
      return options.callback?.() ?? reply(200, { url: ORIGIN }, ["__Secure-next-auth.session-token=jwt; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000"]);
    if (path === "/api/auth/session")
      return reply(200, options.impersonating
        ? { user, impersonating: { originalId: "admin", originalName: "A", originalEmail: "a@example.test", expiresAt: Date.now() + 60_000, readOnly: true }, authenticatedAt: Date.now() }
        : { user, authenticatedAt: 1_000 });
    return reply(200, { ok: true });
  });
  return { calls, fetcher };
}

const assertion = { id: "Y3JlZA", rawId: "Y3JlZA", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "Y2Q", authenticatorData: "YWQ", signature: "c2ln", userHandle: "dWg" } } as never;

describe("passkey sign-in transport", () => {
  it("runs the web's sequence: options, system sheet, CSRF, NextAuth callback, session", async () => {
    const { calls, fetcher } = server();
    const saved = storage();
    const client = new PortalApi(ORIGIN, fetcher as never, saved, false);
    const authenticate = vi.fn(async () => assertion);
    await expect(client.signInWithPasskey("app.example.test", authenticate)).resolves.toMatchObject({ id: "u1" });

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/public/passkeys/options", "GET /api/auth/csrf", "POST /api/auth/callback/passkey", "GET /api/auth/session",
    ]);
    expect(authenticate).toHaveBeenCalledWith({ challenge: "Y2hhbGxlbmdl", rpId: "app.example.test" }, "app.example.test");
    // The response travels as the form field NextAuth's passkey provider reads, as JSON text.
    const form = new URLSearchParams(calls[2].body);
    expect(JSON.parse(form.get("response")!)).toEqual(assertion);
    expect(form.get("csrfToken")).toBe("csrf");
    expect(form.get("json")).toBe("true");
  });

  it("names the API origin as Origin on passkey requests and nowhere else", async () => {
    const { calls, fetcher } = server();
    const client = new PortalApi(ORIGIN, fetcher as never, storage(), false);
    await client.signInWithPasskey("app.example.test", async () => assertion);
    const byPath = Object.fromEntries(calls.map((call) => [call.path, call.headers.get("origin")]));
    expect(byPath["/api/public/passkeys/options"]).toBe(ORIGIN);
    expect(byPath["/api/auth/callback/passkey"]).toBe(ORIGIN);
    expect(byPath["/api/auth/csrf"]).toBeNull();
    expect(byPath["/api/auth/session"]).toBeNull();
  });

  it("returns the challenge cookie to the callback, and to no other request", async () => {
    const { calls, fetcher } = server();
    const client = new PortalApi(ORIGIN, fetcher as never, storage(), false);
    await client.signInWithPasskey("app.example.test", async () => assertion);
    const cookieOf = (path: string) => calls.find((call) => call.path === path)!.headers.get("cookie") ?? "";
    expect(cookieOf("/api/auth/callback/passkey")).toContain("__Host-passkey-authenticate=" + "t".repeat(43));
    expect(cookieOf("/api/auth/callback/passkey")).toContain("next-auth.csrf-token");
    expect(cookieOf("/api/auth/csrf")).not.toContain("passkey");
    expect(cookieOf("/api/auth/session")).not.toContain("passkey");
    // Once signed in, it is gone from memory too.
    await client.request("/api/anything");
    expect(calls.at(-1)!.headers.get("cookie")).not.toContain("passkey");
  });

  it("persists the session token and nothing from the passkey exchange", async () => {
    const { fetcher } = server();
    const saved = storage();
    const client = new PortalApi(ORIGIN, fetcher as never, saved, false);
    await client.signInWithPasskey("app.example.test", async () => assertion);
    const lastSaved = saved.save.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(Object.keys(lastSaved)).toEqual(["__Secure-next-auth.session-token"]);
    expect(JSON.stringify(saved.save.mock.calls)).not.toMatch(/passkey|csrf|clientDataJSON|signature/);
  });

  it("stops at cancellation: nothing is posted, nothing is signed in, the challenge cookie is dropped", async () => {
    const { calls, fetcher } = server();
    const client = new PortalApi(ORIGIN, fetcher as never, storage(), false);
    const cancelled = Object.assign(new Error("The passkey request was cancelled."), { code: "ERR_PASSKEY_CANCELLED" });
    await expect(client.signInWithPasskey("app.example.test", async () => { throw cancelled; })).rejects.toBe(cancelled);
    expect(calls.map((call) => call.path)).toEqual(["/api/public/passkeys/options"]);
    await client.request("/api/anything");
    expect(calls.at(-1)!.headers.get("cookie") ?? "").not.toContain("passkey");
  });

  it.each([
    ["a 401 from NextAuth (unknown, disabled, replayed or expired)", () => reply(401, { url: `${ORIGIN}/api/auth/error?error=CredentialsSignin&provider=passkey` })],
    ["a 200 that carries an error", () => reply(200, { url: `${ORIGIN}/api/auth/error?error=CredentialsSignin` })],
  ])("answers %s with one generic message and no session", async (_name, callback) => {
    const { fetcher } = server({ callback });
    const saved = storage();
    const client = new PortalApi(ORIGIN, fetcher as never, saved, false);
    await expect(client.signInWithPasskey("app.example.test", async () => assertion)).rejects.toThrow("Unable to sign in with this passkey. Try again or use your password.");
    expect(saved.save).toHaveBeenLastCalledWith({});
  });

  it("surfaces an unreachable server as such, so the screen can say so", async () => {
    const client = new PortalApi(ORIGIN, (async () => { throw new TypeError("network"); }) as never, storage(), false);
    await expect(client.signInWithPasskey("app.example.test", async () => assertion)).rejects.toThrow("Could not reach the server");
  });
});

describe("passkey management in View As", () => {
  it("refuses every passkey call before the network, reads included, because the server's 401 would sign the actor out", async () => {
    const { calls, fetcher } = server({ impersonating: true });
    const client = new PortalApi(ORIGIN, fetcher as never, storage(), false);
    await client.session();
    const before = calls.length;
    for (const [path, method] of [["/api/passkeys", "GET"], ["/api/passkeys", "DELETE"], ["/api/passkeys/registration/options", "POST"], ["/api/passkeys/registration/verify", "POST"]] as const)
      await expect(client.request(path, { method })).rejects.toMatchObject({ status: 403, code: "ViewAsReadOnly" });
    expect(calls.length).toBe(before);
  });

  it("does not sign the person out when a passkey call is refused", async () => {
    const { fetcher } = server({ impersonating: true });
    const client = new PortalApi(ORIGIN, fetcher as never, storage(), false);
    const unauthorized = vi.fn(); client.onUnauthorized = unauthorized;
    await client.session();
    await client.request("/api/passkeys").catch(() => undefined);
    expect(unauthorized).not.toHaveBeenCalled();
  });
});

describe("cookies", () => {
  it("recognises the secure and plain challenge cookies and nothing like them", () => {
    const jar = mergeCookies({}, [
      "__Host-passkey-register=a; Path=/; Secure", "passkey-authenticate=b; Path=/", "passkey-other=c", "evil-passkey-register=d", "__Host-passkey-register-x=e",
    ]);
    expect(Object.keys(jar).sort()).toEqual(["__Host-passkey-register", "passkey-authenticate"]);
    expect(cookieHeader(jar, true)).toContain("__Host-passkey-register=a");
  });
  it("clears the register cookie when the server expires it", () => {
    const jar = mergeCookies({ "__Host-passkey-register": { value: "a", secure: true } }, ["__Host-passkey-register=; Path=/; Max-Age=0; Secure"]);
    expect(jar).toEqual({});
  });
  it("limits the passkey paths to the passkey routes", () => {
    for (const path of ["/api/passkeys", "/api/passkeys/registration/options", "/api/public/passkeys", "/api/public/passkeys/options", "/api/auth/callback/passkey"])
      expect(isPasskeyPath(path)).toBe(true);
    for (const path of ["/api/auth/callback/credentials", "/api/auth/session", "/api/public/other", "/api/passkeysfoo", "/api/academic-years"])
      expect(isPasskeyPath(path)).toBe(false);
  });
});
