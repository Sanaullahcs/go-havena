// Local Expo Go rejects this project's development certificate
// ("Code signature validation failed: Certificate not valid").
// Omit projectId only for local Metro / Expo start so the manifest is unsigned.
// EAS CLI and cloud builds must keep extra.eas.projectId.
module.exports = ({ config }) => {
  const script = `${process.env.npm_lifecycle_event || ""} ${process.env.npm_lifecycle_script || ""}`;
  const localStart = /\bstart\b|expo start/.test(script);

  if (process.env.EAS_BUILD || process.env.EAS_NO_STRIP_PROJECT_ID || !localStart) {
    return config;
  }

  const extra = { ...(config.extra ?? {}) };
  if (extra.eas) {
    extra.eas = { ...extra.eas };
    delete extra.eas.projectId;
    if (Object.keys(extra.eas).length === 0) {
      delete extra.eas;
    }
  }

  return { ...config, extra };
};
