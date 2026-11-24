/** Community Updates list access. Detail and admin notice routes stay on their own guards. */

const UPDATE_FEATURE_KEYS = ["notices", "events", "alerts"];

function isExplicitlyOff(value) {
  return value === false || value === 0 || value === "0" || value === "false";
}

function featureFlags(user) {
  const features = user?.resident_features?.features;
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  return features;
}

function featureEnabled(user, key) {
  const features = featureFlags(user);
  if (!features) return false;
  if (!Object.prototype.hasOwnProperty.call(features, key)) return true;
  return !isExplicitlyOff(features[key]);
}

function isUpdatesBoardPath(pathname) {
  const path = String(pathname ?? "").split("?")[0].replace(/\/$/, "");
  return path === "/notices" || path === "/(tabs)/notices";
}

/**
 * True only after the feature payload is known and notices, events, and alerts
 * are all off. A missing payload is not a denial.
 */
function isUpdatesBoardBlocked(user) {
  if (!featureFlags(user)) return false;
  return !UPDATE_FEATURE_KEYS.some((key) => featureEnabled(user, key));
}

/**
 * The Updates entry and the All / Saved tabs describe Community Updates.
 * Events copy is only for the Events and Yours tabs.
 */
function updatesDenialUsesCommunityUpdates(tab) {
  const id = tab?.id;
  return id !== "events" && id !== "yours" && id !== "alerts";
}

module.exports = {
  isUpdatesBoardPath,
  isUpdatesBoardBlocked,
  updatesDenialUsesCommunityUpdates,
};
