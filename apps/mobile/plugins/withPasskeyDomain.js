/**
 * Associates the app with the server's passkey domain (the RP ID) so iOS lets it create and use passkeys
 * for that domain: the `webcredentials:` associated domain. The server must serve
 * /.well-known/apple-app-site-association on that exact host with this app's App ID (docs/passkeys.md).
 *
 * The domain is the host of EXPO_PUBLIC_API_URL, or PASSKEY_ASSOCIATED_DOMAIN when the RP ID is a parent
 * domain. A build without one (a local dev client pointed at an IP address) gets no entitlement and no domain,
 * and the app then never offers passkeys. PASSKEY_ASSOCIATED_MODE=developer appends `?mode=developer`, which makes a
 * device fetch the association file directly instead of through Apple's CDN: for testing only, never for a
 * release build.
 */
const DOMAIN = /^(?=.*[a-z])[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function passkeyDomain(env = process.env) {
  const explicit = env.PASSKEY_ASSOCIATED_DOMAIN?.trim();
  let host = explicit;
  if (!host && env.EXPO_PUBLIC_API_URL) {
    try {
      host = new URL(env.EXPO_PUBLIC_API_URL).hostname;
    } catch {
      host = undefined;
    }
  }
  return host && DOMAIN.test(host) ? host.toLowerCase() : null;
}

// The app reads the domain back from Info.plist (modules/passkeys `associatedDomain`). It cannot come from
// `extra`: a plugin only runs at prebuild, and a dev client takes its config from Metro, which skips plugins.
const INFO_KEY = "StMarkPasskeyDomain";

function withPasskeyDomain(config) {
  const domain = passkeyDomain();
  if (!domain) return config;
  const mode = process.env.PASSKEY_ASSOCIATED_MODE === "developer" ? "?mode=developer" : "";
  const entry = `webcredentials:${domain}${mode}`;
  const existing = config.ios?.associatedDomains ?? [];
  config.ios = {
    ...config.ios,
    associatedDomains: [...existing.filter((value) => value !== entry), entry],
    infoPlist: { ...config.ios?.infoPlist, [INFO_KEY]: domain },
  };
  return config;
}

module.exports = withPasskeyDomain;
module.exports.passkeyDomain = passkeyDomain;
module.exports.INFO_KEY = INFO_KEY;
