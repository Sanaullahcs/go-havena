import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
  isUpdatesBoardBlocked,
  isUpdatesBoardPath,
  updatesDenialUsesCommunityUpdates,
} = require(join(import.meta.dirname, "../utils/updates-access.cjs"));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const user = (features) => ({ resident_features: { features } });

assert(isUpdatesBoardPath("/notices"), "tab path is the updates board");
assert(isUpdatesBoardPath("/(tabs)/notices"), "group path is the updates board");
assert(!isUpdatesBoardPath("/screens/notice-detail"), "notice detail stays guarded");
assert(!isUpdatesBoardPath("/screens/event-detail"), "event detail stays guarded");

assert(!isUpdatesBoardBlocked(null), "missing user is not a denial");
assert(!isUpdatesBoardBlocked({}), "missing feature payload is not a denial");
assert(
  isUpdatesBoardBlocked(user({ notices: false, events: false, alerts: false })),
  "all update features off blocks the board",
);
assert(
  !isUpdatesBoardBlocked(user({ notices: false, events: true, alerts: false })),
  "events stays available when notices is off",
);
assert(
  !isUpdatesBoardBlocked(user({ notices: true, events: false, alerts: false })),
  "notices stays available when events is off",
);

assert(updatesDenialUsesCommunityUpdates({ id: "all" }), "All uses Community Updates");
assert(updatesDenialUsesCommunityUpdates(undefined), "board denial uses Community Updates");
assert(!updatesDenialUsesCommunityUpdates({ id: "events" }), "Events tab keeps Events");
assert(!updatesDenialUsesCommunityUpdates({ id: "yours" }), "Yours tab keeps Events");
assert(!updatesDenialUsesCommunityUpdates({ id: "alerts" }), "Alerts tab keeps Alerts");

console.log("updates-access: board stays put and Community Updates copy is separate from Events — ok");
