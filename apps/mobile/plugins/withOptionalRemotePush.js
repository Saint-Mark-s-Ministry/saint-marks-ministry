const { withEntitlementsPlist } = require("@expo/config-plugins");

/** Keep local notification sounds without requiring an APNs-enabled signing profile. */
module.exports = function withOptionalRemotePush(config) {
  if (config.extra?.remotePushEnabled !== false) return config;
  // Register before expo-notifications: entitlement mods run in reverse order.
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    return config;
  });
};
