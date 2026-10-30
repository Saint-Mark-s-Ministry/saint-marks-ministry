/**
 * The deployed passkey API (docs/passkeys.md), as the native app uses it.
 * Type-only: no WebAuthn library reaches the native bundle. Binary fields are
 * base64url strings, as the server's WebAuthn library emits and expects.
 */

/** `GET /api/public/passkeys`. `rpId` and `ios` are absent on servers that predate native support. */
export type PasskeyCapabilityResponse = {
  enabled: boolean;
  rpId?: string;
  /** True when this deployment's association file names an iOS App ID. */
  ios?: boolean;
};

/** One entry of `GET /api/passkeys`. No key material, credential ID or counter is ever sent. */
export type PasskeyRecord = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export type PasskeyListResponse = { passkeys: PasskeyRecord[] };

/** `POST /api/passkeys/registration/options` (the parts a platform passkey request needs). */
export type PasskeyRegistrationOptions = {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: { id: string }[];
};

/** `POST /api/public/passkeys/options`. */
export type PasskeyAuthenticationOptions = {
  challenge: string;
  rpId?: string;
};

export type PasskeyRegistrationResponseJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment?: "platform" | "cross-platform";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  clientExtensionResults: Record<string, never>;
};

export type PasskeyAuthenticationResponseJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment?: "platform" | "cross-platform";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string;
  };
  clientExtensionResults: Record<string, never>;
};

/** `POST /api/passkeys/registration/verify`. */
export type PasskeyRegistrationVerifyRequest = {
  name: string;
  response: PasskeyRegistrationResponseJSON;
};
