// Local Expo Go rejects this project's development certificate
// ("Code signature validation failed: Certificate not valid").
// Omit projectId only for local Metro / Expo start so the manifest is unsigned.
// EAS CLI and cloud builds must keep extra.eas.projectId.
//
// Android FCM: google-services.json is gitignored. Prefer EAS file env
// GOOGLE_SERVICES_JSON (path injected on the builder). Fall back to the local
// file path so `eas build` from a machine that has the file still works after
// removing it from .easignore.
module.exports = ({ config }) => {
  const script = `${process.env.npm_lifecycle_event || ""} ${process.env.npm_lifecycle_script || ""}`;
  const localStart =
    process.env.HAVENA_LOCAL_EXPO === "1" || /\bstart\b|expo start/.test(script);

  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_FILE ||
    config.android?.googleServicesFile ||
    "./google-services.json";

  const next = {
    ...config,
    android: {
      ...(config.android ?? {}),
      googleServicesFile,
    },
  };

  if (process.env.EAS_BUILD || process.env.EAS_NO_STRIP_PROJECT_ID || !localStart) {
    return next;
  }

  const extra = { ...(next.extra ?? {}) };
  if (extra.eas) {
    extra.eas = { ...extra.eas };
    delete extra.eas.projectId;
    if (Object.keys(extra.eas).length === 0) {
      delete extra.eas;
    }
  }

  // A local manifest must not point Expo Go at the published EAS update.
  // google-services.json is inlined into that manifest and is not needed in Expo Go.
  const withoutUpdates = { ...next };
  delete withoutUpdates.updates;
  const android = { ...(withoutUpdates.android || {}) };
  delete android.googleServicesFile;
  return { ...withoutUpdates, android, extra };
};
