// Local Expo Go rejects this project's development certificate
// ("Code signature validation failed: Certificate not valid").
// Omit projectId during `expo start` so the manifest is unsigned.
// EAS builds still read projectId from app.json.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD) {
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
