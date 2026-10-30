import { useEffect, useState } from "react";
import Constants from "expo-constants";
import type {
  PasskeyCapabilityResponse,
  PasskeyRegistrationOptions,
  PasskeyRegistrationVerifyRequest,
} from "@stmark/contracts";
import { passkeysAvailable } from "../../modules/passkeys";
import { createWithPasskey } from "./passkey-native";
import { passkeysOffered } from "./passkeys";
import { publicRequest } from "./public-api";
import { request } from "./resources";

/** The domain this build is associated with (modules/passkeys; plugins/withPasskeyDomain.js). */
export function passkeyBuildDomain(): string | null {
  const domain = Constants.expoConfig?.extra?.passkeyDomain;
  return typeof domain === "string" && domain ? domain : null;
}

const CAPABILITY_TTL_MS = 5 * 60_000;
let known: { value: PasskeyCapabilityResponse | null; at: number } | null = null;
let pending: Promise<PasskeyCapabilityResponse | null> | null = null;

async function loadCapability(force = false): Promise<PasskeyCapabilityResponse | null> {
  if (!force && known && Date.now() - known.at < CAPABILITY_TTL_MS) return known.value;
  pending ??= publicRequest<PasskeyCapabilityResponse>("/api/public/passkeys")
    .catch(() => null) // Unreachable or unexpected: passkeys stay hidden, and the password path is untouched.
    .then((value) => {
      known = { value, at: Date.now() };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** For tests and sign-out: forget what the server last said. */
export function resetPasskeyCapability() {
  known = null;
  pending = null;
}

/**
 * Whether to offer passkeys, from the server's public capability endpoint (never assumed). Starts false and
 * stays false when the server is off, unreachable, or has not enabled this app.
 */
export function usePasskeyCapability(): { offered: boolean; rpId: string | null; loading: boolean } {
  const [capability, setCapability] = useState<PasskeyCapabilityResponse | null>(known?.value ?? null);
  const [loading, setLoading] = useState(!known);
  useEffect(() => {
    let active = true;
    void loadCapability().then((value) => {
      if (!active) return;
      setCapability(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const offered = passkeysOffered(capability, passkeyBuildDomain(), passkeysAvailable());
  return { offered, rpId: offered ? (capability?.rpId ?? null) : null, loading };
}

/**
 * Add a passkey: the server's registration challenge (which also enforces the recent sign-in and the limit of
 * ten), the system sheet, then the server's verification. Cancelling rejects with ERR_PASSKEY_CANCELLED and
 * nothing is added.
 */
export async function enrollPasskey(name: string, rpId: string): Promise<void> {
  const options = await request<PasskeyRegistrationOptions>("/api/passkeys/registration/options", "POST", {});
  const response = await createWithPasskey(options, rpId);
  const body: PasskeyRegistrationVerifyRequest = { name, response };
  await request("/api/passkeys/registration/verify", "POST", body);
}

/** Remove one of this account's passkeys. The server scopes the delete to the signed-in owner. */
export async function removePasskey(id: string): Promise<void> {
  await request("/api/passkeys", "DELETE", { id });
}
