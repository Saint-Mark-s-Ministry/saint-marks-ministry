import { requireOptionalNativeModule } from "expo-modules-core";
import type { NativeAssertion, NativeAuthenticationRequest, NativeRegistration, NativeRegistrationRequest } from "../../../src/data/passkeys";

type Native = {
  isSupported(): boolean;
  /** The domain this build's `webcredentials:` entitlement names (written to Info.plist at prebuild), or null. */
  associatedDomain(): string | null;
  /** Shows the system sheet to create a passkey. Rejects with code ERR_PASSKEY_*. */
  createPasskey(request: NativeRegistrationRequest): Promise<NativeRegistration>;
  /** Shows the system sheet to choose a passkey and sign in. Rejects with code ERR_PASSKEY_*. */
  getPasskey(request: NativeAuthenticationRequest): Promise<NativeAssertion>;
};

// Optional: a binary built without the module (an older dev client) simply cannot offer passkeys.
export const native = requireOptionalNativeModule<Native>("StMarkPasskeys");
export const passkeysAvailable = () => !!native && native.isSupported();
