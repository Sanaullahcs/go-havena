/**
 * Validates mobile foreground notification content extraction.
 * Run: node apps/mobile/scripts/test-push-content.mjs
 */

import assert from "node:assert/strict";

function extractNotificationContent(content) {
  const data = content?.data ?? {};
  let title = content?.title || data.title || data.push_title || "";
  let body = content?.body || data.body || data.push_body || "";
  const kind = data.kind || "";
  const actor = data.actor_name || data.actorName || "";

  if (!title) {
    if (kind === "post_comment") title = "New comment";
    else if (kind === "message" || kind === "new_message") title = "New message";
    else if (kind === "post_like") title = "New like";
    else title = "NeighborLink";
  }

  if (!body) {
    if (kind === "post_comment" && actor) body = `${actor} commented on your post.`;
    else if ((kind === "message" || kind === "new_message") && actor) body = `${actor} sent you a message.`;
    else if (kind === "post_like" && actor) body = `${actor} liked your post.`;
  }

  return { title, body };
}

const fromNative = extractNotificationContent({
  title: "New comment",
  body: "Alice commented on your post: Hi",
  data: { kind: "post_comment", post_id: "3" },
});
assert.equal(fromNative.title, "New comment");
assert.equal(fromNative.body, "Alice commented on your post: Hi");

const fromDataOnly = extractNotificationContent({
  data: { kind: "post_comment", actor_name: "Alice" },
});
assert.equal(fromDataOnly.title, "New comment");
assert.equal(fromDataOnly.body, "Alice commented on your post.");

console.log("OK: mobile foreground content extraction passed.");
