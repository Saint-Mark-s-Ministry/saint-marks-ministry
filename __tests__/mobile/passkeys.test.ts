// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// The real verifier and the real passkey library run here; only storage is replaced.
const mocks = vi.hoisted(() => ({
  prisma: {
    passkeyChallenge: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    passkey: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { authenticatePasskey, authenticationOptions, registerPasskey, registrationOptions } from "@/lib/passkeys";
import {
  PASSKEY_LIMIT,
  RECENT_SIGN_IN_MESSAGE,
  assertionToJSON,
  authenticationRequestFor,
  classifyPasskeyError,
  formatPasskeyDate,
  isBase64Url,
  passkeyFootnote,
  passkeyLimitReached,
  passkeysOffered,
  registrationRequestFor,
  registrationToJSON,
  signInFreshness,
  validatePasskeyName,
  type NativeAssertion,
  type NativeRegistration,
} from "../../apps/mobile/src/data/passkeys";

const root = join(__dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest();
const uint32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

/**
 * Behaves like Apple's platform authenticator as the AuthenticationServices API reports it: a discoverable
 * ES256 credential, "none" attestation, user presence and verification, a clientDataJSON whose origin is
 * `https://<rpId>` (not the web origin), the user handle returned as the bytes given at registration.
 */
class IosPlatformAuthenticator {
  private keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  private credentialId = randomBytes(32);
  counter = 0;
  constructor(private rpId: string) {}

  private clientData(type: string, challenge: string) {
    // The platform re-encodes the raw challenge bytes it was handed.
    const raw = Buffer.from(challenge, "base64url");
    return Buffer.from(JSON.stringify({ type, challenge: b64(raw), origin: `https://${this.rpId}` }));
  }

  create(request: { rpId: string; challenge: string }): NativeRegistration {
    const jwk = this.keys.publicKey.export({ format: "jwk" });
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
      [1, 2], [3, -7], [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")],
    ]));
    const credLength = Buffer.alloc(2); credLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpId), Buffer.from([0x5d]), uint32(this.counter), Buffer.alloc(16), credLength, this.credentialId, cose,
    ]);
    const attestation = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]) as never);
    return {
      credentialId: b64(this.credentialId),
      clientDataJSON: b64(this.clientData("webauthn.create", request.challenge)),
      attestationObject: b64(attestation),
    };
  }

  get(request: { rpId: string; challenge: string }, userHandle: string): NativeAssertion {
    this.counter += 1;
    const clientData = this.clientData("webauthn.get", request.challenge);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([0x1d]), uint32(this.counter)]);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.keys.privateKey);
    return {
      credentialId: b64(this.credentialId),
      clientDataJSON: b64(clientData),
      authenticatorData: b64(authData),
      signature: b64(signature),
      userHandle,
    };
  }
}

const user = { id: "user-1", authVersion: 3, email: "person@example.test", name: "Person", isDisabled: false, mustChangePassword: false };
const token = "a".repeat(43);

type Stored = { id: string; userId: string; rpID: string; credentialId: string; publicKey: string; counter: bigint; transports: string[]; user: typeof user };
let stored: Stored | null;
let challenge: string;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PASSKEY_RP_ID", "example.test");
  vi.stubEnv("PASSKEY_ORIGIN", "https://app.example.test");
  vi.stubEnv("PASSKEY_IOS_APP_IDS", "ABCDE12345.org.example.app");
  stored = null;
  mocks.prisma.passkeyChallenge.create.mockImplementation(async ({ data }: { data: { challenge: string } }) => { challenge = data.challenge; });
  mocks.prisma.passkeyChallenge.deleteMany.mockResolvedValue({ count: 1 });
  mocks.prisma.passkeyChallenge.findFirst.mockImplementation(async () => ({ challenge, userId: user.id, authVersion: user.authVersion }));
  mocks.prisma.passkey.findMany.mockResolvedValue([]);
  mocks.prisma.passkey.count.mockResolvedValue(0);
  mocks.prisma.passkey.create.mockImplementation(async ({ data }: { data: Omit<Stored, "id" | "user"> }) => { stored = { ...data, id: "key-1", user }; });
  mocks.prisma.passkey.findUnique.mockImplementation(async () => stored);
  mocks.prisma.passkey.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.user.findUnique.mockResolvedValue(user);
  mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
});

async function enroll(device: IosPlatformAuthenticator, name = "My iPhone", rpId = "example.test") {
  const { options } = await registrationOptions(user);
  const request = registrationRequestFor(options as never, rpId);
  const response = registrationToJSON(device.create(request));
  await registerPasskey(user, token, response as never, name);
  return { options, request, response };
}

async function signIn(device: IosPlatformAuthenticator, userHandle: string, rpId = "example.test") {
  const { options } = await authenticationOptions();
  const request = authenticationRequestFor(options as never, rpId);
  const response = assertionToJSON(device.get(request, userHandle));
  return authenticatePasskey(token, JSON.stringify(response));
}

describe("an iOS credential against the real verifier", () => {
  it("enrolls, then signs in, with the origin iOS embeds when an iOS App ID is enabled", async () => {
    const device = new IosPlatformAuthenticator("example.test");
    const { options } = await enroll(device);
    expect(stored).toMatchObject({ userId: user.id, rpID: "example.test", counter: BigInt(0), transports: ["internal", "hybrid"] });
    expect(stored!.credentialId).toBe(b64(Buffer.from(stored!.credentialId, "base64url")));
    // The user handle iOS returns is the id we handed it at registration.
    const handle = (options as { user: { id: string } }).user.id;
    expect(Buffer.from(handle, "base64url").toString()).toBe(user.id);
    await expect(signIn(device, handle)).resolves.toEqual(user);
    expect(mocks.prisma.passkey.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ counter: BigInt(1) }) }));
  });

  it("is rejected when the RP ID is a parent domain and no iOS App ID is enabled: the origin does not match", async () => {
    vi.stubEnv("PASSKEY_IOS_APP_IDS", "");
    await expect(enroll(new IosPlatformAuthenticator("example.test"))).rejects.toThrow("Could not verify this passkey");
  });

  it("needs no extra allowance when the RP ID is the web origin's own host", async () => {
    vi.stubEnv("PASSKEY_IOS_APP_IDS", "");
    vi.stubEnv("PASSKEY_RP_ID", "app.example.test");
    const device = new IosPlatformAuthenticator("app.example.test");
    const { options } = await enroll(device, "My iPhone", "app.example.test");
    await expect(signIn(device, (options as { user: { id: string } }).user.id, "app.example.test")).resolves.toEqual(user);
  });

  it("rejects an assertion made for another RP ID", async () => {
    const device = new IosPlatformAuthenticator("example.test");
    const { options } = await enroll(device);
    const impostor = new IosPlatformAuthenticator("evil.test");
    Object.assign(impostor, { keys: (device as unknown as { keys: unknown }).keys, credentialId: (device as unknown as { credentialId: Buffer }).credentialId });
    await expect(signIn(impostor, (options as { user: { id: string } }).user.id)).rejects.toThrow("Unable to sign in");
  });

  it("rejects a replayed challenge", async () => {
    const device = new IosPlatformAuthenticator("example.test");
    const { options } = await enroll(device);
    const handle = (options as { user: { id: string } }).user.id;
    const { options: authOptions } = await authenticationOptions();
    const response = assertionToJSON(device.get(authenticationRequestFor(authOptions as never, "example.test"), handle));
    await expect(authenticatePasskey(token, JSON.stringify(response))).resolves.toEqual(user);
    mocks.prisma.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 });
    await expect(authenticatePasskey(token, JSON.stringify(response))).rejects.toThrow("expired");
  });

  it("rejects a tampered signature and a wrong user handle", async () => {
    const device = new IosPlatformAuthenticator("example.test");
    const { options } = await enroll(device);
    const handle = (options as { user: { id: string } }).user.id;
    const { options: authOptions } = await authenticationOptions();
    const native = device.get(authenticationRequestFor(authOptions as never, "example.test"), handle);
    const flipped = Buffer.from(native.signature, "base64url"); flipped[flipped.length - 1] ^= 1;
    await expect(authenticatePasskey(token, JSON.stringify(assertionToJSON({ ...native, signature: b64(flipped) })))).rejects.toThrow("Unable to sign in");
    const { options: again } = await authenticationOptions();
    const other = device.get(authenticationRequestFor(again as never, "example.test"), b64(Buffer.from("someone-else")));
    await expect(authenticatePasskey(token, JSON.stringify(assertionToJSON(other)))).rejects.toThrow("Unable to sign in");
  });

  it("is posted as browser-shaped WebAuthn JSON, not Apple's field names", () => {
    const json = assertionToJSON({ credentialId: "Y3JlZA", clientDataJSON: "Y2Q", authenticatorData: "YWQ", signature: "c2ln", userHandle: "dWg" });
    expect(json).toEqual({
      id: "Y3JlZA", rawId: "Y3JlZA", type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
      response: { clientDataJSON: "Y2Q", authenticatorData: "YWQ", signature: "c2ln", userHandle: "dWg" },
    });
    expect(JSON.stringify(json)).not.toMatch(/rawClientDataJSON|rawAuthenticatorData|rawAttestationObject|credentialID/);
  });

  it.each(["", "has space", "pad==", "a+b/c", "x".repeat(16_385)])("refuses a native field that is not base64url: %j", bad => {
    expect(isBase64Url(bad)).toBe(false);
    expect(() => registrationToJSON({ credentialId: "ab", clientDataJSON: bad, attestationObject: "cd" })).toThrow();
    expect(() => assertionToJSON({ credentialId: "ab", clientDataJSON: "cd", authenticatorData: "ef", signature: "gh", userHandle: bad })).toThrow();
  });
});

describe("challenge handling", () => {
  const options = { challenge: "Y2hhbGxlbmdl", rp: { id: "example.test", name: "St. Mark Ministry" }, user: { id: "dXNlci0x", name: "p@example.test", displayName: "Person" }, excludeCredentials: [{ id: "a2V5LTE" }, { id: "not base64!" }] };
  it("builds a native request only from what the server and the capability agree on", () => {
    expect(registrationRequestFor(options, "example.test")).toEqual({
      rpId: "example.test", challenge: "Y2hhbGxlbmdl", userId: "dXNlci0x", userName: "p@example.test", displayName: "Person", excludeCredentialIds: ["a2V5LTE"],
    });
    expect(authenticationRequestFor({ challenge: "Y2hhbGxlbmdl", rpId: "EXAMPLE.test" }, "example.test")).toEqual({ rpId: "EXAMPLE.test", challenge: "Y2hhbGxlbmdl" });
  });
  it.each([
    ["another RP ID", { ...options, rp: { id: "evil.test", name: "x" } }],
    ["no RP ID", { ...options, rp: { name: "x" } }],
    ["a bad challenge", { ...options, challenge: "" }],
    ["a bad user id", { ...options, user: { ...options.user, id: "***" } }],
  ])("refuses options with %s", (_name, bad) => {
    expect(() => registrationRequestFor(bad as never, "example.test")).toThrow("unexpected passkey request");
  });
  it("refuses sign-in options for another RP ID or without one", () => {
    expect(() => authenticationRequestFor({ challenge: "Y2g", rpId: "evil.test" }, "example.test")).toThrow();
    expect(() => authenticationRequestFor({ challenge: "Y2g" } as never, "example.test")).toThrow();
  });
});

describe("when passkeys are offered", () => {
  const on = { enabled: true, rpId: "www.example.test", ios: true };
  it("needs the server on, an iOS App ID enabled, and this build associated with the server's RP ID", () => {
    expect(passkeysOffered(on, "www.example.test", true)).toBe(true);
    expect(passkeysOffered(on, "WWW.example.test", true)).toBe(true);
  });
  it.each([
    ["the feature disabled", { enabled: false }, "www.example.test", true],
    ["a server that predates native support", { enabled: true }, "www.example.test", true],
    ["iOS not enabled", { enabled: true, rpId: "www.example.test", ios: false }, "www.example.test", true],
    ["a build associated with another domain", on, "other.example.test", true],
    ["a build with no associated domain", on, null, true],
    ["no native module", on, "www.example.test", false],
    ["no answer yet", null, "www.example.test", true],
  ])("is hidden for %s", (_name, capability, domain, native) => {
    expect(passkeysOffered(capability, domain, native)).toBe(false);
  });
});

describe("the list", () => {
  it("validates the friendly name like the server (trimmed, 1–80)", () => {
    expect(validatePasskeyName("  My iPhone  ")).toEqual({ name: "My iPhone" });
    expect(validatePasskeyName("   ").error).toMatch(/Enter a name/);
    expect(validatePasskeyName("x".repeat(80)).error).toBeUndefined();
    expect(validatePasskeyName("x".repeat(81)).error).toMatch(/80 characters/);
  });
  it("stops at ten", () => {
    expect(passkeyLimitReached(PASSKEY_LIMIT - 1)).toBe(false);
    expect(passkeyLimitReached(PASSKEY_LIMIT)).toBe(true);
  });
  it("shows creation and last-used dates, or that it has not been used", () => {
    expect(passkeyFootnote({ createdAt: "2026-10-14T12:00:00.000Z", lastUsedAt: "2026-10-20T12:00:00.000Z" }, "UTC")).toBe("Added Oct 14, 2026 · Last used Oct 20, 2026");
    expect(passkeyFootnote({ createdAt: "2026-10-14T12:00:00.000Z", lastUsedAt: null }, "UTC")).toBe("Added Oct 14, 2026 · Not used yet");
    expect(formatPasskeyDate("garbage")).toBe("");
  });
});

describe("the ten-minute sign-in window", () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);
  it("is advisory: fresh inside ten minutes, stale after, unknown without a time", () => {
    expect(signInFreshness(now - 9 * 60_000, now)).toBe("fresh");
    expect(signInFreshness(now - 10 * 60_000 - 1, now)).toBe("stale");
    expect(signInFreshness(undefined, now)).toBe("unknown");
  });
  it("treats a time in the future (a slow phone clock) as fresh and lets the server decide", () => {
    expect(signInFreshness(now + 90_000, now)).toBe("fresh");
  });
});

describe("error classification", () => {
  it.each([
    [{ code: "ERR_PASSKEY_CANCELLED", message: "x" }, "cancelled"],
    [{ code: "ERR_PASSKEY_DUPLICATE", message: "x" }, "duplicate"],
    [{ code: "ERR_PASSKEY_NOT_ASSOCIATED", message: "x" }, "not-associated"],
    [{ code: "ViewAsReadOnly", status: 403, message: "x" }, "view-as"],
    [{ status: 403, message: "For your security, sign out and sign in again before managing passkeys." }, "recent-sign-in"],
    [{ status: 403, message: "Change your password before managing passkeys." }, "password-change"],
    [{ status: 503, message: "Passkeys are not enabled." }, "unavailable"],
    [{ status: 429, message: "Too many attempts. Please try again later." }, "other"],
    [new Error("Passkey request expired. Please try again."), "other"],
    [null, "other"],
  ])("%j is %s", (error, kind) => {
    expect(classifyPasskeyError(error).kind).toBe(kind);
  });
  it("keeps the server's own wording for expired, replayed and rate-limited requests", () => {
    expect(classifyPasskeyError({ status: 400, message: "Passkey request expired. Please try again." }).message).toBe("Passkey request expired. Please try again.");
    expect(classifyPasskeyError({ status: 403, message: "For your security, sign out and sign in again before managing passkeys." }).message).toBe(RECENT_SIGN_IN_MESSAGE);
  });
});

describe("wiring", () => {
  const client = read("apps/mobile/src/data/api-client.ts");
  it("keeps the challenge cookie in memory only, never in the stored session", () => {
    expect(client).toMatch(/passkey-\(\?:register\|authenticate\)/);
    expect(client).toMatch(/name\.includes\("session-token"\)/);
  });
  it("sends the API origin as Origin on passkey requests only", () => {
    expect(client).toContain('headers.set("Origin", this.origin)');
  });
  it("refuses every passkey call in View As before it reaches the network, since the server answers 401", () => {
    expect(client).toMatch(/impersonating && isPasskeyManagementPath\(path\)/);
  });
  it("never logs", () => {
    for (const file of ["apps/mobile/src/data/passkeys.ts", "apps/mobile/src/data/passkey-flow.ts", "apps/mobile/src/components/passkeys-screen.tsx", "apps/mobile/modules/passkeys/ios/PasskeysModule.swift", "apps/mobile/modules/passkeys/src/PasskeysModule.ts"])
      expect(read(file), file).not.toMatch(/console\.(log|info|warn|error|debug)|\bprint\(|NSLog|os_log|Logger\(/);
  });
});

describe("the associated-domain plugin", () => {
  type Config = { ios?: { associatedDomains?: string[] }; extra?: Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require("../../apps/mobile/plugins/withPasskeyDomain.js") as ((config: Config) => Config) & { passkeyDomain: (env: Record<string, string | undefined>) => string | null };
  it("takes the API host as the domain, or an explicit override for a parent RP ID", () => {
    expect(plugin.passkeyDomain({ EXPO_PUBLIC_API_URL: "https://www.example.test" })).toBe("www.example.test");
    expect(plugin.passkeyDomain({ EXPO_PUBLIC_API_URL: "https://www.example.test", PASSKEY_ASSOCIATED_DOMAIN: "Example.test" })).toBe("example.test");
  });
  it.each(["http://127.0.0.1:3000", "http://localhost:3000", "http://10.0.2.2:3000", "not a url", ""])("has no domain for %j (nothing to associate)", url => {
    expect(plugin.passkeyDomain({ EXPO_PUBLIC_API_URL: url })).toBeNull();
  });
  it("adds the webcredentials entitlement and tells the app which domain it has", () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://www.example.test");
    vi.stubEnv("PASSKEY_ASSOCIATED_DOMAIN", "");
    vi.stubEnv("PASSKEY_ASSOCIATED_MODE", "");
    const config = plugin({ ios: { associatedDomains: ["applinks:x.test"] }, extra: { keep: true } });
    expect(config.ios!.associatedDomains).toEqual(["applinks:x.test", "webcredentials:www.example.test"]);
    expect(config.extra).toEqual({ keep: true, passkeyDomain: "www.example.test" });
  });
  it("uses developer mode only when asked", () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://www.example.test");
    vi.stubEnv("PASSKEY_ASSOCIATED_MODE", "developer");
    expect(plugin({}).ios!.associatedDomains).toEqual(["webcredentials:www.example.test?mode=developer"]);
    vi.stubEnv("PASSKEY_ASSOCIATED_MODE", "");
    expect(plugin({}).ios!.associatedDomains).toEqual(["webcredentials:www.example.test"]);
  });
  it("adds no entitlement and no domain for a build that points at an IP address", () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "http://127.0.0.1:3000");
    vi.stubEnv("PASSKEY_ASSOCIATED_DOMAIN", "");
    const config = plugin({});
    expect(config.ios).toBeUndefined();
    expect(config.extra!.passkeyDomain).toBeNull();
  });
  it("is registered, and the route is listed", () => {
    expect(read("apps/mobile/app.json")).toContain("./plugins/withPasskeyDomain.js");
    expect(read("apps/mobile/src/data/route-access.ts")).toContain('"passkeys"');
  });
});

describe("the screens", () => {
  const signIn = read("apps/mobile/src/components/sign-in.tsx");
  const account = read("apps/mobile/src/components/account-screen.tsx");
  const screen = read("apps/mobile/src/components/passkeys-screen.tsx");
  it("offers passkey sign-in only when the capability check says so, beside the unchanged password and recovery paths", () => {
    expect(signIn).toMatch(/passkeys\.offered && \(\s*<Button[^>]*Sign in with a passkey/);
    expect(signIn).toContain("Forgot password?");
    expect(signIn).toContain('label={busy ? "Signing in…" : "Sign in"}');
  });
  it("takes a cancelled sign-in as a quiet message, not a failure", () => {
    expect(signIn).toContain('kind === "cancelled" ? CANCELLED_SIGN_IN_MESSAGE');
  });
  it("hides the Account row unless offered, and in View As", () => {
    expect(account).toContain("passkeys.offered && !viewingAs");
  });
  it("never asks for the list in View As, and scopes it to the signed-in person", () => {
    expect(screen).toContain("capability.offered && !readOnly && user");
    expect(screen).toContain("`passkeys:${user.id}`");
  });
  it("confirms before removing, and locks every control while a request runs", () => {
    expect(screen).toContain("removePasskeyTitle(key.name)");
    expect(screen).toMatch(/text: "Remove",\s*style: "destructive"/);
    expect(screen).toContain("disabled={action.busy || serverSaysStale}");
  });
  it("keeps the typed name when an attempt is cancelled or fails", () => {
    const failure = screen.slice(screen.indexOf("catch (error) {"), screen.indexOf("finally {"));
    expect(failure).not.toContain("setName(");
  });
  it("sends the account's own passkey id only; the owner comes from the session on the server", () => {
    const flow = read("apps/mobile/src/data/passkey-flow.ts");
    expect(flow).toContain('request("/api/passkeys", "DELETE", { id })');
    expect(flow).not.toMatch(/userId/);
  });
});

