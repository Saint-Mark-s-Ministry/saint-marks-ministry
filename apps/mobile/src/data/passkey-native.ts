import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResponseJSON,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResponseJSON,
} from "@stmark/contracts";
import { native } from "../../modules/passkeys";
import { assertionToJSON, authenticationRequestFor, registrationRequestFor, registrationToJSON } from "./passkeys";

function requireNative() {
  if (!native) throw Object.assign(new Error("Passkeys aren't available in this build of the app."), { code: "ERR_PASSKEY_UNSUPPORTED" });
  return native;
}

/** Shows the system passkey sheet for a sign-in challenge and returns the WebAuthn JSON the server verifies. */
export async function authenticateWithPasskey(
  options: PasskeyAuthenticationOptions,
  rpId: string,
): Promise<PasskeyAuthenticationResponseJSON> {
  const request = authenticationRequestFor(options, rpId);
  return assertionToJSON(await requireNative().getPasskey(request));
}

/** Shows the system sheet for creating a passkey from a registration challenge. */
export async function createWithPasskey(
  options: PasskeyRegistrationOptions,
  rpId: string,
): Promise<PasskeyRegistrationResponseJSON> {
  const request = registrationRequestFor(options, rpId);
  return registrationToJSON(await requireNative().createPasskey(request));
}
