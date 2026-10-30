import type { PasskeyAuthenticationOptions, PasskeyAuthenticationResponseJSON } from "@stmark/contracts";

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
  // Display-only: decides whether the Contact Book menu entry is shown. The
  // API re-checks on every request; never authorize from this.
  canAccessContactBook?: boolean;
  // Display-only, like the flag above: the server sends it on every session refresh, and re-checks on every
  // View As request. It is never set from the app.
  canUseViewAs?: boolean;
};
export type ViewAsSession = {
  originalId: string;
  originalName: string | null;
  originalEmail: string | null;
  expiresAt: number;
  readOnly: true;
};
export type PortalSession = {
  user?: PortalUser;
  impersonating?: ViewAsSession | null;
  /** When this session was created by a real sign-in (server clock); a refresh never renews it. */
  authenticatedAt?: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * A 403 means the server has just told us this account no longer has
 * authority for the resource (a servant whose assignment was removed, a
 * class that left the Elementary band). Callers must stop showing anything
 * they cached from before that answer, unlike a dropped connection where
 * the last good data is still the best available.
 */
export function isAuthorizationRevoked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

// The two passkey challenge cookies are held in memory for the length of one sign-in or enrollment; only the
// session token is ever persisted (see PortalApi.persist).
const passkeyCookie = /^(?:__Host-)?passkey-(?:register|authenticate)$/;
const cookieName =
  /^(?:(?:__Secure-|__Host-)?next-auth\.(?:session-token(?:\.\d+)?|csrf-token)|(?:__Host-)?passkey-(?:register|authenticate))$/;

/** The only requests that carry a passkey challenge cookie, and that must name the API origin as their Origin. */
const underRoute = (path: string, route: string) => path === route || path.startsWith(`${route}/`);
export const isPasskeyManagementPath = (path: string) => underRoute(path, "/api/passkeys");
export const isPasskeyPath = (path: string) =>
  path === "/api/auth/callback/passkey" || isPasskeyManagementPath(path) || underRoute(path, "/api/public/passkeys");
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
  onSessionChanged?: (session: PortalSession, identityChanged: boolean) => void;
  private currentSession: PortalSession = {};
  private changingIdentity = false;
  private adoptSession(session: PortalSession) {
    const identity = (value: PortalSession) => `${value.user?.id ?? ""}:${value.impersonating?.originalId ?? ""}`;
    const changed = identity(session) !== identity(this.currentSession);
    if (changed) this.generation++;
    this.currentSession = session;
    this.onSessionChanged?.(session, changed);
    return session;
  }
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
    this.adoptSession({});
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
    const method = (init.method ?? "GET").toUpperCase();
    const safe = ["GET", "HEAD", "OPTIONS"].includes(method);
    const sessionControl = path === "/api/auth/session" || path === "/api/auth/signout";
    if (this.changingIdentity && !path.startsWith("/api/auth/"))
      throw new ApiError("The viewed account is changing. Please wait.", 409);
    if (this.currentSession.impersonating && !safe && !sessionControl)
      throw new ApiError("View as is read-only. Stop viewing as this user before making changes.", 403, "ViewAsReadOnly");
    // The server answers every passkey call made while viewing as another user with a 401, which this client
    // treats as an expired session. Refuse here, before the network, so looking never signs the actor out.
    if (this.currentSession.impersonating && isPasskeyManagementPath(path))
      throw new ApiError("Passkeys can't be managed while you are using View as. Stop viewing as this user first.", 403, "ViewAsReadOnly");
    const generation = this.generation;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const passkeyRequest = isPasskeyPath(path);
    headers.set(
      "Cookie",
      cookieHeader(
        passkeyRequest ? this.jar : Object.fromEntries(Object.entries(this.jar).filter(([name]) => !passkeyCookie.test(name))),
        this.origin.startsWith("https:"),
      ),
    );
    // A browser sends its page's origin, which the server compares with its configured one. The app is
    // served by that same origin, so it names it. Nothing else carries it.
    if (passkeyRequest) headers.set("Origin", this.origin);
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
      if (generation !== this.generation) throw new Error("Session changed. Please try again.");
      if (!response.ok) {
        if (path === "/api/auth/callback/credentials") {
          await this.clear();
          // Every credential rejection (wrong password, unknown email,
          // disabled account) deliberately shares one generic message —
          // never disclosing which of those it was. Rate limiting is the
          // one exception: it says nothing about whether the account
          // exists, only that this client has made too many attempts, so
          // it's safe — and more useful — to surface that specific wait
          // time instead of hiding it behind the same generic copy.
          const rawError = (() => {
            try {
              return new URL(body?.url, this.origin).searchParams.get("error");
            } catch {
              return null;
            }
          })();
          const rateLimited = rawError && /^Too many login attempts\./.test(rawError);
          throw new ApiError(
            rateLimited ? rawError! : "Sign-in failed. Check your email and password, or try again later.",
            response.status,
          );
        }
        if (path === "/api/auth/callback/passkey") {
          await this.clear();
          // Unknown, disabled, replayed and invalid all share one answer on purpose.
          throw new ApiError("Unable to sign in with this passkey. Try again or use your password.", response.status);
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
    if (this.changingIdentity) throw new Error("The viewed account is changing.");
    const session = await this.request<PortalSession>("/api/auth/session");
    if (!session.user) {
      await this.clear();
      return null;
    }
    this.adoptSession(session);
    return session.user;
  }
  async updateViewAs(targetId: string | null) {
    if (this.changingIdentity) throw new Error("The viewed account is already changing.");
    this.changingIdentity = true;
    this.generation++; // Old reads must not rotate the cookie back to the prior identity.
    try {
      const { csrfToken } = await this.request<{ csrfToken: string }>("/api/auth/csrf");
      const session = await this.request<PortalSession>("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, data: { impersonate: targetId } }),
      });
      this.adoptSession(session);
      if (!session.user || (targetId
        ? session.user.id !== targetId || !session.impersonating
        : !!session.impersonating)) {
        throw new Error(targetId
          ? "View as could not be started. Confirm you still have View as access and try again."
          : "View as could not be stopped. Try again or sign out.");
      }
      return session;
    } finally {
      this.changingIdentity = false;
    }
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
  /**
   * Signs in with a passkey: the same challenge, verification and NextAuth callback the web uses. The
   * challenge cookie only ever lives in this client's in-memory jar, and goes with the callback request.
   * `authenticate` shows the system sheet and returns the WebAuthn JSON; cancelling rejects out of here
   * with nothing signed in.
   */
  async signInWithPasskey(
    rpId: string,
    authenticate: (options: PasskeyAuthenticationOptions, rpId: string) => Promise<PasskeyAuthenticationResponseJSON>,
  ) {
    await this.clear();
    try {
      const options = await this.request<PasskeyAuthenticationOptions>("/api/public/passkeys/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const response = await authenticate(options, rpId);
      const { csrfToken } = await this.request<{ csrfToken: string }>("/api/auth/csrf");
      const result = await this.request<{ url?: string }>("/api/auth/callback/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          response: JSON.stringify(response),
          csrfToken,
          callbackUrl: this.origin,
          json: "true",
        }).toString(),
      });
      if (result.url && new URL(result.url, this.origin).searchParams.has("error")) {
        await this.clear();
        throw new Error("Unable to sign in with this passkey. Try again or use your password.");
      }
      const user = await this.session();
      if (!user) throw new Error("Unable to sign in with this passkey. Try again or use your password.");
      return user;
    } finally {
      for (const name of Object.keys(this.jar)) if (passkeyCookie.test(name)) delete this.jar[name];
    }
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
