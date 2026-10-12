import { describe, expect, it, vi } from "vitest";
import {
  PortalApi,
  ApiError,
  cookieHeader,
  mergeCookies,
  type CookieJar,
} from "../../apps/mobile/src/data/api-client";

describe("native NextAuth session transport", () => {
  it("handles combined cookies, Expires commas, token chunks, and expiry", () => {
    const now = Date.parse("2026-09-22T12:00:00Z");
    const jar = mergeCookies(
      {},
      [
        "next-auth.session-token.0=first; Expires=Wed, 23 Sep 2026 12:00:00 GMT; HttpOnly, next-auth.session-token.1=second; Max-Age=60, other=ignored",
      ],
      now,
    );
    expect(cookieHeader(jar, false, now)).toBe(
      "next-auth.session-token.0=first; next-auth.session-token.1=second",
    );
    expect(cookieHeader(jar, false, now + 61000)).toBe(
      "next-auth.session-token.0=first",
    );
    expect(
      mergeCookies(jar, ["next-auth.session-token.0=; Max-Age=0"], now)[
        "next-auth.session-token.0"
      ],
    ).toBeUndefined();
  });
  it("never transmits Secure cookies over HTTP", () => {
    const jar = mergeCookies({}, [
      "__Secure-next-auth.session-token=secret; Secure",
    ]);
    expect(cookieHeader(jar, false)).toBe("");
    expect(cookieHeader(jar, true)).toContain("secret");
  });
  it("requires HTTPS outside development and rejects alternate request origins", async () => {
    const fetcher = vi.fn();
    const storage = { load: async () => ({}), save: async () => {} };
    expect(
      () => new PortalApi("http://example.com", fetcher, storage, false),
    ).toThrow("HTTPS");
    const client = new PortalApi(
      "https://example.com",
      fetcher,
      storage,
      false,
    );
    await expect(client.request("//evil.test/api/classes")).rejects.toThrow(
      "Invalid API path",
    );
    await expect(client.request("/api/\\evil.test")).rejects.toThrow(
      "Invalid API path",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses explicit cookies without the shared native cookie store or redirects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ ok: true }),
      });
    const client = new PortalApi(
      "https://example.com",
      fetcher,
      {
        load: async () => ({
          "next-auth.session-token": { value: "session", secure: false },
        }),
        save: async () => {},
      },
      false,
    );
    await client.restore();
    await client.request("/api/classes");
    const init = fetcher.mock.calls[0][1];
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.headers.get("Cookie")).toBe("next-auth.session-token=session");
  });
  it("clears a rejected session, but retains it for network failures", async () => {
    const save = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        headers: new Headers(),
        json: async () => ({ error: "Unauthorized" }),
      });
    const client = new PortalApi(
      "https://example.com",
      fetcher,
      { load: async () => ({}), save },
      false,
    );
    const unauthorized = vi.fn();
    client.onUnauthorized = unauthorized;
    await expect(client.request("/api/classes")).rejects.toThrow(
      "Could not reach",
    );
    expect(save).not.toHaveBeenCalled();
    await expect(client.request("/api/classes")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(save).toHaveBeenCalledWith({});
    expect(unauthorized).toHaveBeenCalledOnce();
  });
  it("collapses every credential rejection into one generic message, except rate limiting (SMM-59)", async () => {
    const genericFetcher = vi.fn().mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: new Headers(),
      json: async () => ({ url: "https://example.com/api/auth/error?error=Invalid%20credentials" }),
    });
    const client = new PortalApi(
      "https://example.com",
      genericFetcher,
      { load: async () => ({}), save: async () => {} },
      false,
    );
    await expect(
      client.request("/api/auth/callback/credentials"),
    ).rejects.toThrow("Sign-in failed. Check your email and password, or try again later.");

    const rateLimitFetcher = vi.fn().mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: new Headers(),
      json: async () => ({
        url: "https://example.com/api/auth/error?error=Too%20many%20login%20attempts.%20Please%20try%20again%20in%20900%20seconds.",
      }),
    });
    const client2 = new PortalApi(
      "https://example.com",
      rateLimitFetcher,
      { load: async () => ({}), save: async () => {} },
      false,
    );
    await expect(
      client2.request("/api/auth/callback/credentials"),
    ).rejects.toThrow("Too many login attempts. Please try again in 900 seconds.");
  });
  it("does not resurrect session cookies from a response arriving after logout", async () => {
    let resolve!: (value: Response) => void;
    const response = new Promise<Response>((r) => {
      resolve = r;
    });
    let stored: CookieJar = {};
    const client = new PortalApi(
      "https://example.com",
      () => response,
      {
        load: async () => ({}),
        save: async (jar) => {
          stored = jar;
        },
      },
      false,
    );
    const pending = client.request("/api/classes");
    await client.clear();
    resolve({
      status: 200,
      ok: true,
      headers: new Headers({ "set-cookie": "next-auth.session-token=old" }),
      json: async () => ({}),
    } as Response);
    await expect(pending).rejects.toThrow();
    expect(stored).toEqual({});
  });
  it("forwards caller cancellation to the native request", async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );
    const client = new PortalApi(
      "https://example.com",
      fetcher,
      { load: async () => ({}), save: async () => {} },
      false,
    );
    const controller = new AbortController();
    const pending = client.request("/api/sunday-school/search?q=child", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("Could not reach");
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });
});
