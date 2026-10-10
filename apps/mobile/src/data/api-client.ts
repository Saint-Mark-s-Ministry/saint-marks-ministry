// Native transport for the existing NextAuth REST API. Credentials never persist.
// Keep a private, origin-bound cookie jar instead of the shared Expo Go cookie store.
export type StoredCookie = { value: string; expires?: number; secure: boolean };
export type CookieJar = Record<string, StoredCookie>;
export type PortalUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  mustChangePassword: boolean;
  // The real session callback (lib/auth.ts) already always sends these —
  // only the type here was incomplete. Not new server behavior.
  isAsyncStudent: boolean;
  profileImageUrl: string | null;
  sundaySchool: { hasAccess: boolean; isCoordinator: boolean };
};
export type PortalSession = { user?: PortalUser; impersonating?: unknown };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

const cookieName =
  /^(?:__Secure-|__Host-)?next-auth\.(?:session-token(?:\.\d+)?|csrf-token)$/;
export function mergeCookies(
  jar: CookieJar,
  headers: string[],
  now = Date.now(),
): CookieJar {
  const next = { ...jar };
  // iOS may combine Set-Cookie headers. Only split at the next cookie's name,
  // never at the comma inside Expires=Wed, 21 Oct ... .
  for (const header of headers.flatMap((value) =>
    value.split(/,(?=\s*[^\s;,=]+\s*=)/),
  )) {
    const [pair, ...attributes] = header
      .split(";")
      .map((value) => value.trim());
    const equals = pair.indexOf("=");
    const name = pair.slice(0, equals);
    if (equals < 1 || !cookieName.test(name)) continue;
    const value = pair.slice(equals + 1);
    const attrs = new Map(
      attributes.map((attr) => {
        const i = attr.indexOf("=");
        return i === -1
          ? [attr.toLowerCase(), ""]
          : [attr.slice(0, i).toLowerCase(), attr.slice(i + 1)];
      }),
    );
    const maxAge = attrs.get("max-age");
    const expires =
      maxAge !== undefined
        ? now + Number(maxAge) * 1000
        : attrs.has("expires")
          ? Date.parse(attrs.get("expires")!)
          : undefined;
    if (!value || (expires !== undefined && expires <= now)) delete next[name];
    else
      next[name] = {
        value,
        secure: attrs.has("secure"),
        ...(Number.isFinite(expires) ? { expires } : {}),
      };
  }
  return next;
}

export function cookieHeader(
  jar: CookieJar,
  secure: boolean,
  now = Date.now(),
) {
  return Object.entries(jar)
    .filter(
      ([name, item]) =>
        cookieName.test(name) &&
        (!item.secure || secure) &&
        (!item.expires || item.expires > now),
    )
    .map(([name, item]) => `${name}=${item.value}`)
    .join("; ");
}

type Storage = {
  load: () => Promise<CookieJar>;
  save: (jar: CookieJar) => Promise<void>;
};
type Fetcher = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "ok" | "headers" | "json">>;
export class PortalApi {
  private jar: CookieJar = {};
  private generation = 0;
  private writes = Promise.resolve();
  onUnauthorized?: () => void;
  readonly origin: string;
  constructor(
    origin: string,
    private fetcher: Fetcher,
    private storage: Storage,
    development: boolean,
  ) {
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Use only the API server origin.");
    if (url.protocol !== "https:" && !(development && url.protocol === "http:"))
      throw new Error("The API server must use HTTPS.");
    this.origin = url.origin;
  }
  async restore() {
    this.jar = await this.storage.load();
  }
  private persist() {
    const snapshot = Object.fromEntries(
      Object.entries(this.jar).filter(([name]) =>
        name.includes("session-token"),
      ),
    );
    this.writes = this.writes
      .catch(() => {})
      .then(() => this.storage.save(snapshot));
    return this.writes;
  }
  async clear() {
    this.generation++;
    this.jar = {};
    await this.persist();
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (
      !path.startsWith("/api/") ||
      path.includes("\\") ||
      path.includes("#") ||
      new URL(path, this.origin).origin !== this.origin
    )
      throw new Error("Invalid API path");
    const generation = this.generation;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set(
      "Cookie",
      cookieHeader(this.jar, this.origin.startsWith("https:")),
    );
    const controller = new AbortController();
    const externalSignal = init.signal;
    const abortFromCaller = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromCaller, {
      once: true,
    });
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.fetcher(`${this.origin}${path}`, {
        ...init,
        headers,
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (generation !== this.generation)
        throw new Error("Session changed. Please try again.");
      const setCookies =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : [response.headers.get("set-cookie") ?? ""];
      this.jar = mergeCookies(this.jar, setCookies);
      if (setCookies.some((value) => value.includes("session-token")))
        await this.persist();
      const body = await response.json();
      if (!response.ok) {
        if (path === "/api/auth/callback/credentials") {
          await this.clear();
          throw new ApiError(
            "Sign-in failed. Check your email and password, or try again later.",
            response.status,
          );
        }
        if (response.status === 401 && !path.startsWith("/api/auth/")) {
          await this.clear();
          this.onUnauthorized?.();
        }
        throw new ApiError(
          body?.message ?? body?.error ?? "Request failed. Please try again.",
          response.status,
          body?.error,
        );
      }
      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new Error(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
  async session() {
    const session = await this.request<PortalSession>("/api/auth/session");
    if (!session.user || session.impersonating) {
      await this.clear();
      return null;
    }
    return session.user;
  }
  async signIn(email: string, password: string) {
    await this.clear();
    const { csrfToken } = await this.request<{ csrfToken: string }>(
      "/api/auth/csrf",
    );
    const result = await this.request<{ url?: string }>(
      "/api/auth/callback/credentials",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: email.trim(),
          password,
          csrfToken,
          callbackUrl: this.origin,
          json: "true",
        }).toString(),
      },
    );
    if (
      result.url &&
      new URL(result.url, this.origin).searchParams.has("error")
    ) {
      await this.clear();
      throw new Error(
        "Sign-in failed. Check your email and password, or try again later.",
      );
    }
    const user = await this.session();
    if (!user)
      throw new Error("Sign-in failed. Check your email and password.");
    return user;
  }
  async signOut() {
    try {
      const { csrfToken } = await this.request<{ csrfToken: string }>(
        "/api/auth/csrf",
      );
      await this.request("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          json: "true",
          callbackUrl: this.origin,
        }).toString(),
      });
    } finally {
      await this.clear();
    }
  }
}
