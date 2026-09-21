/**
 * Validates notification icon mapping for foreground banners.
 * Run: node apps/mobile/scripts/test-notification-visual.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveNotificationVisual } = require("../utils/notification-visual.js");

const message = resolveNotificationVisual({ kind: "message", title: "New message" });
assert.equal(message.ionicon, "chatbubble-ellipses-outline");

const comment = resolveNotificationVisual({ kind: "post_comment", title: "New comment" });
assert.equal(comment.ionicon, "chatbubbles-outline");

const notice = resolveNotificationVisual({
  title: "Pool maintenance",
  body: "Scheduled notice for tomorrow",
  actionUrl: "/notices/12",
});
assert.equal(notice.ionicon, "megaphone-outline");

const like = resolveNotificationVisual({ kind: "post_like" });
assert.equal(like.ionicon, "heart");

const created = resolveNotificationVisual({ kind: "post_created", title: "New community post" });
assert.equal(created.ionicon, "newspaper-outline");

const createdByText = resolveNotificationVisual({
  title: "New community post",
  body: "Alex shared a new post in your community.",
});
assert.equal(createdByText.ionicon, "newspaper-outline");

console.log("OK: notification visual mapping passed.");
