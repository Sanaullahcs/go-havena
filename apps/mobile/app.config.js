const PROJECT_ID = "23aaa527-0ab0-49ab-9f93-1aaa427e1b99";
const EAS_UPDATE_URL = `https://u.expo.dev/${PROJECT_ID}`;

// Local Expo Go rejects this project's development certificate
// ("Code signature validation failed: Certificate not valid").
// Omit projectId during `expo start` so the manifest is unsigned.
//
// Expo Go writes every QR/open into its updates SQLite table
// UNIQUE(scope_key, commit_time). Stock CLI mints a new id/createdAt per
// request, which collides on rescan. Local slug + disabled OTA keep Expo Go
// off the production EAS channel; scripts/expo-go-manifest-identity.cjs
// keeps one id/commit_time per Metro process so existing installs reopen
// without reinstalling.
// EAS binaries keep the production slug, projectId, and updates URL.
module.exports = ({ config }) => {
  const runtimeVersion = config.runtimeVersion ?? { policy: "sdkVersion" };

  if (process.env.EAS_BUILD) {
    return {
      ...config,
      runtimeVersion,
      updates: {
        ...(config.updates ?? {}),
        enabled: true,
        checkAutomatically: "ON_LOAD",
        fallbackToCacheTimeout: 0,
        url: EAS_UPDATE_URL,
      },
    };
  }

  const extra = { ...(config.extra ?? {}) };
  if (extra.eas) {
    extra.eas = { ...extra.eas };
    delete extra.eas.projectId;
    if (Object.keys(extra.eas).length === 0) {
      delete extra.eas;
    }
  }

  const updates = { ...(config.updates ?? {}) };
  delete updates.url;
  delete updates.requestHeaders;
  delete updates.codeSigningCertificate;
  delete updates.codeSigningMetadata;

  return {
    ...config,
    name: "Havena",
    // Unique slug per Metro start so Expo Go's scope_key cannot collide
    // with a cached Havena / havena-dev / havena-local updates row.
    slug: process.env.HAVENA_GO_SLUG || `havena-go-${Date.now().toString(36)}`,
    owner: undefined,
    runtimeVersion,
    extra,
    updates: {
      ...updates,
      enabled: false,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    },
  };
};
