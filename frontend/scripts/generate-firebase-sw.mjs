import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPaths = [
  path.join(root, ".env.local"),
  path.join(root, ".env"),
];
const outPath = path.join(root, "public", "firebase-messaging-sw.js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = envPaths.reduce((acc, envPath) => ({ ...acc, ...loadEnvFile(envPath) }), {});
const env = { ...process.env, ...fileEnv };

const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
  console.warn(
    "[firebase:sw] Skipped — set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local, then run npm run firebase:sw again.",
  );
  process.exit(0);
}

const contents = `/* Auto-generated — run: npm run firebase:sw */
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config, null, 2)});

const messaging = firebase.messaging();

function inferNoticeBoard(hints) {
  var category = (hints && hints.category ? String(hints.category) : "").toLowerCase().trim();
  if (category === "event") return "events";
  if (category === "emergency") return "alerts";
  var haystack = ((hints && hints.title) || "") + " " + ((hints && hints.body) || "");
  haystack = haystack.toLowerCase();
  if (/\bevent\b/.test(haystack)) return "events";
  if (/\balert\b|\bemergency\b/.test(haystack)) return "alerts";
  return "notices";
}

function noticeAdminHref(noticeId, hints) {
  var board = inferNoticeBoard(hints);
  var base = board === "events" ? "/admin/events" : board === "alerts" ? "/admin/alerts" : "/admin/notices";
  return base + "?notice=" + noticeId;
}

function rerouteAdminNoticeHref(raw, hints) {
  var match = raw.match(/^\\/admin\\/notices\\?notice=(\\d+)/);
  if (!match || !hints) return null;
  var board = inferNoticeBoard(hints);
  if (board === "notices") return null;
  var base = board === "events" ? "/admin/events" : "/admin/alerts";
  return base + "?notice=" + match[1];
}

function mapMobileScreenToAdminHref(pathname, query) {
  var path = String(pathname || "").toLowerCase();
  var params = new URLSearchParams(query || "");

  if (path.indexOf("/screens/admin-bookings") !== -1 || path.indexOf("/screens/admin-amenities") !== -1) {
    return "/admin/amenities";
  }
  if (path.indexOf("/screens/guest-approvals") !== -1) return "/admin/guests";
  if (path.indexOf("/screens/notices") !== -1) return "/admin/notices";
  if (path.indexOf("/screens/community-feed/comments") !== -1) {
    var postId = params.get("postId");
    return postId ? "/admin/feed?post=" + postId : "/admin/feed";
  }
  if (path.indexOf("/screens/community-feed") !== -1) return "/admin/feed";
  if (path.indexOf("/screens/listing-detail") !== -1) {
    var listingId = params.get("id") || params.get("listingId");
    return listingId ? "/admin/marketplace?listing=" + listingId : "/admin/marketplace";
  }
  if (path.indexOf("/screens/messages") !== -1) return "/admin/messages";
  if (path.indexOf("/screens/property-management/my-booking") !== -1) return "/admin/amenities";
  return null;
}

function resolvePushLink(raw, hints) {
  if (!raw || typeof raw !== "string") return "/admin/notifications";
  var action = raw.trim();
  if (action.startsWith("http://") || action.startsWith("https://")) {
    try {
      var parsed = new URL(action);
      action = parsed.pathname + parsed.search;
    } catch (err) {
      return "/admin/notifications";
    }
  }
  if (action.startsWith("/admin/")) {
    return rerouteAdminNoticeHref(action, hints) || action;
  }
  if (action.indexOf("/screens/messages/chat") !== -1) {
    var chatParams = new URLSearchParams(action.indexOf("?") !== -1 ? action.slice(action.indexOf("?") + 1) : "");
    var conversationId = chatParams.get("conversationId");
    return conversationId ? "/admin/messages?conversation=" + conversationId : "/admin/messages";
  }
  if (action.indexOf("/screens/community-feed/comments") !== -1) {
    var postParams = new URLSearchParams(action.indexOf("?") !== -1 ? action.slice(action.indexOf("?") + 1) : "");
    var postId = postParams.get("postId");
    return postId ? "/admin/feed?post=" + postId : "/admin/feed";
  }
  var noticeMatch = action.match(/\\/notices\\/(\\d+)/);
  if (noticeMatch) return noticeAdminHref(noticeMatch[1], hints);
  if (action.startsWith("/screens/")) {
    var qIdx = action.indexOf("?");
    var screenPath = qIdx === -1 ? action : action.slice(0, qIdx);
    var screenQuery = qIdx === -1 ? "" : action.slice(qIdx + 1);
    var mapped = mapMobileScreenToAdminHref(screenPath, screenQuery);
    if (mapped) return mapped;
    return "/admin/notifications";
  }
  if (action.startsWith("/")) return action;
  return "/admin/notifications";
}

function enrichPushContent(payload) {
  var data = payload.data || {};
  var title =
    (payload.notification && payload.notification.title) ||
    data.title ||
    data.push_title ||
    "";
  var body =
    (payload.notification && payload.notification.body) ||
    data.body ||
    data.push_body ||
    "";
  var kind = data.kind || "";
  var actor = data.actor_name || data.actorName || "";

  if (!title) {
    if (kind === "post_comment") title = "New comment";
    else if (kind === "message" || kind === "new_message") title = "New message";
    else if (kind === "post_like") title = "New like";
    else title = "Havena";
  }

  if (!body) {
    if (kind === "post_comment" && actor) body = actor + " commented on your post.";
    else if ((kind === "message" || kind === "new_message") && actor) body = actor + " sent you a message.";
    else if (kind === "post_like" && actor) body = actor + " liked your post.";
  }

  return { title: title, body: body };
}

function extractPushPayload(payload) {
  var data = payload.data || {};
  var content = enrichPushContent(payload);
  var rawLink =
    data.action_url ||
    data.actionUrl ||
    data.link ||
    (payload.fcmOptions && payload.fcmOptions.link) ||
    "/admin/notifications";
  var hints = {
    category: data.category || data.notice_category || "",
    title: content.title,
    body: content.body,
  };
  var kind = data.kind;
  var postId = data.post_id;
  var tag = kind && postId ? kind + "-" + postId : kind || "nbr-push";
  return { title: content.title, body: content.body, link: resolvePushLink(rawLink, hints), tag: tag, hints: hints };
}

function toAbsoluteLink(link, hints) {
  var mapped = resolvePushLink(link || "/admin/notifications", hints);
  if (mapped.startsWith("http://") || mapped.startsWith("https://")) return mapped;
  return self.location.origin + (mapped.startsWith("/") ? mapped : "/" + mapped);
}

function pushIconUrl(payload) {
  var data = payload.data || {};
  if (data.icon && (data.icon.startsWith("http://") || data.icon.startsWith("https://"))) {
    return data.icon;
  }
  return self.location.origin + "/app-icon.png";
}

/** Background: tab hidden — show exactly one notification from data payload. */
messaging.onBackgroundMessage(function (payload) {
  var message = extractPushPayload(payload);
  var icon = pushIconUrl(payload);
  self.registration.showNotification(message.title, {
    body: message.body,
    icon: icon,
    badge: icon,
    tag: message.tag,
    renotify: true,
    data: {
      link: toAbsoluteLink(message.link, message.hints),
      href: message.link,
      hints: message.hints,
    },
  });
});

function focusOrOpenDashboard(href, absoluteLink) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
    var origin = self.location.origin;
    var sameOrigin = windowClients.filter(function (client) {
      try {
        return new URL(client.url).origin === origin;
      } catch (err) {
        return false;
      }
    });

    function navigateClient(client) {
      client.postMessage({ type: "NBR_PUSH_NAVIGATE", href: href });
      if ("focus" in client) {
        return client.focus().then(function (focused) {
          if ("navigate" in focused) {
            return focused.navigate(absoluteLink).catch(function () {
              return focused;
            });
          }
          return focused;
        });
      }
      return Promise.resolve();
    }

    if (sameOrigin.length > 0) {
      var visibleClient = sameOrigin.find(function (client) {
        return client.visibilityState === "visible";
      });
      return navigateClient(visibleClient || sameOrigin[0]);
    }

    if (clients.openWindow) {
      return clients.openWindow(absoluteLink);
    }

    return undefined;
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var hints = data.hints || {};
  var href = resolvePushLink(data.href || data.link || "/admin/notifications", hints);
  var absoluteLink = toAbsoluteLink(href, hints);

  event.waitUntil(focusOrOpenDashboard(href, absoluteLink));
});
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, contents, "utf8");
console.log("Wrote", outPath);
