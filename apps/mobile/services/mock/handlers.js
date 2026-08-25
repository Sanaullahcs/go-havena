import { ApiError } from "../api-error";
import { MOCK_DEMO_TOKEN } from "../../constants/api-config";
import { MOCK_ADMIN_USER_ID } from "../../constants/mock-config";
import { getCachedUser } from "../auth-session";
import {
  getMockMe,
  getMockState,
  resetMockState,
  setMockPersona,
} from "./store";
import { filterDevMockCommunities, filterDevMockRegions } from "../../constants/dev-data";
import { MOCK_COMMUNITY_ID } from "../../constants/mock-config";

function ok(data, extra = {}) {
  return { data, ...extra };
}

function paginate(items, searchParams, { defaultPerPage = 20 } = {}) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const perPage = Math.max(
    1,
    Number(searchParams.get("per_page") ?? searchParams.get("perPage") ?? defaultPerPage),
  );
  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  return {
    data: slice,
    meta: {
      current_page: page,
      per_page: perPage,
      total: items.length,
      last_page: Math.max(1, Math.ceil(items.length / perPage)),
      community_id: MOCK_COMMUNITY_ID,
    },
  };
}

function parseQuery(path) {
  const [pathname, query = ""] = path.split("?");
  return { pathname, searchParams: new URLSearchParams(query) };
}

function resolveMockUser() {
  const cached = getCachedUser();
  const state = getMockState();

  if (
    cached?.role === "community_admin" ||
    Number(cached?.id) === MOCK_ADMIN_USER_ID
  ) {
    setMockPersona("admin");
    return state.users.admin;
  }

  if (cached?.id) {
    setMockPersona("resident");
    return state.users.resident;
  }

  return getMockMe();
}

function findById(list, id) {
  return list.find((row) => String(row.id) === String(id)) ?? null;
}

function toggleLikePost(postId) {
  const state = getMockState();
  const post = findById(state.feedPosts, postId);
  if (!post) throw new ApiError("Post not found", { status: 404 });
  post.liked_by_me = !post.liked_by_me;
  post.likes_count += post.liked_by_me ? 1 : -1;
  return { liked: post.liked_by_me, likes_count: post.likes_count };
}

function handleAuth(method, pathname, body) {
  if (method === "POST" && pathname === "/auth/otp/request") {
    return { message: "Verification code sent." };
  }

  if (method === "POST" && pathname === "/auth/otp/verify") {
    const phone = String(body?.phone ?? "");
    const isAdmin = phone.includes("55550200") || phone.includes("6668888");
    setMockPersona(isAdmin ? "admin" : "resident");
    const user = getMockMe();
    return {
      token: MOCK_DEMO_TOKEN,
      user,
    };
  }

  if (method === "POST" && pathname === "/auth/login") {
    setMockPersona("admin");
    return { token: MOCK_DEMO_TOKEN, user: getMockMe() };
  }

  if (method === "POST" && pathname === "/auth/logout") return null;
  if (method === "POST" && pathname === "/auth/web-handoff") return { code: "MOCK-WEB-HANDOFF" };
  return null;
}

function handleMe(method, pathname, body) {
  if (pathname === "/me/membership-review") {
    return ok({ status: "approved", community: getMockState().communities[0] });
  }
  if (pathname === "/me/points/stats") return ok(getMockState().points.stats);
  if (pathname.startsWith("/me/points/history")) {
    return paginate(getMockState().points.history, parseQuery(pathname).searchParams);
  }
  if (pathname === "/me/points/rank") return ok(getMockState().points.rank);
  if (pathname === "/me/achievements") return ok(getMockState().achievements);

  if (pathname === "/me") {
    if (method === "PUT" || method === "PATCH") {
      const me = resolveMockUser();
      me.profile = { ...me.profile, ...body };
      if (body?.display_name) me.name = body.display_name;
      return ok(me);
    }
    return ok(resolveMockUser());
  }
  return null;
}

function handleFeed(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path === "/feed/topics") {
    return ok(["Recommendations", "Events", "Help", "Neighborhood", "Announcements"]);
  }

  const postMatch = path.match(/^\/feed\/(\d+)$/);
  if (postMatch) {
    const post = findById(state.feedPosts, postMatch[1]);
    if (!post) throw new ApiError("Post not found", { status: 404 });
    if (method === "PUT" || method === "PATCH") {
      Object.assign(post, { body: body?.body ?? post.body, category: body?.category ?? post.category });
      return ok(post, { message: "Post updated." });
    }
    if (method === "DELETE") return null;
    return ok(post);
  }

  const likeMatch = path.match(/^\/feed\/(\d+)\/like$/);
  if (likeMatch && method === "POST") return toggleLikePost(likeMatch[1]);

  const commentsMatch = path.match(/^\/feed\/(\d+)\/comments$/);
  if (commentsMatch) {
    const postId = commentsMatch[1];
    if (method === "POST") {
      const list = state.feedComments[postId] ?? (state.feedComments[postId] = []);
      const comment = {
        id: Date.now(),
        post_id: Number(postId),
        parent_id: body?.parent_id ?? null,
        depth: body?.parent_id ? 1 : 0,
        body: body?.body ?? "",
        author_name: getMockMe().profile?.display_name ?? "You",
        author_avatar: getMockMe().profile?.avatar_url ?? null,
        user_id: getMockMe().id,
        likes_count: 0,
        liked_by_me: false,
        is_mine: true,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
      list.push(comment);
      const post = findById(state.feedPosts, postId);
      if (post) post.comments_count += 1;
      return { data: comment, comments_count: post?.comments_count ?? list.length };
    }
    return ok(state.feedComments[postId] ?? []);
  }

  if (path.match(/^\/feed\/\d+\/report$/) && method === "POST") {
    return { message: "Report submitted. Community admins will review this post." };
  }

  if (path === "/feed" && method === "POST") {
    const post = {
      id: Date.now(),
      body: body?.body ?? "",
      category: body?.category ?? "general",
      author_name: getMockMe().profile?.display_name ?? "You",
      author_unit: getMockMe().profile?.unit_number ?? "",
      author_avatar: getMockMe().profile?.avatar_url ?? null,
      author_id: getMockMe().id,
      likes_count: 0,
      comments_count: 0,
      liked_by_me: false,
      is_mine: true,
      status: "approved",
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      image_url: body?.image_url ?? null,
    };
    state.feedPosts.unshift(post);
    return ok(post, { message: "Post published." });
  }

  if (path === "/feed") {
    let posts = [...state.feedPosts];
    const category = searchParams.get("category");
    const q = searchParams.get("q")?.toLowerCase();
    if (searchParams.get("mine") === "1") posts = posts.filter((p) => p.is_mine);
    if (category) posts = posts.filter((p) => p.category === category);
    if (q) posts = posts.filter((p) => String(p.body).toLowerCase().includes(q));
    return paginate(posts, searchParams, { defaultPerPage: Number(searchParams.get("per_page") ?? 10) });
  }
  return null;
}

function handleNotices(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path === "/admin/notices") {
    const review = searchParams.get("review_status");
    const items = review === "pending" ? [...state.admin.adminNotices] : [...state.notices];
    return paginate(items, searchParams, { defaultPerPage: 50 });
  }

  const rsvpMatch = path.match(/^\/notices\/(\d+)\/rsvp$/);
  if (rsvpMatch && method === "POST") {
    const notice = findById(state.notices, rsvpMatch[1]);
    if (!notice) throw new ApiError("Event not found", { status: 404 });
    if (body?.status === "not_going") {
      notice.is_joined = false;
      notice.rsvp_count = Math.max(0, (notice.rsvp_count ?? 0) - 1);
    } else {
      notice.is_joined = true;
      notice.rsvp_count = (notice.rsvp_count ?? 0) + 1;
    }
    return { data: notice, message: notice.is_joined ? "Joined event." : "Left event." };
  }

  const detailMatch = path.match(/^\/notices\/(\d+)$/);
  if (detailMatch) {
    const notice = findById(state.notices, detailMatch[1]);
    if (!notice) throw new ApiError("Notice not found", { status: 404 });
    return ok(notice);
  }

  if (path === "/notices") {
    let items = [...state.notices];
    const category = searchParams.get("category");
    const group = searchParams.get("category_group");
    const search = searchParams.get("search")?.toLowerCase();
    if (category) items = items.filter((n) => n.category === category);
    if (group === "notices") items = items.filter((n) => n.category !== "event" && n.category !== "emergency");
    if (group === "alerts") items = items.filter((n) => n.category === "emergency");
    if (search) items = items.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(search));
    return { data: items, meta: { total: items.length } };
  }

  if (method === "POST" && ["/admin/notices", "/admin/events", "/admin/alerts", "/events"].includes(path)) {
    const notice = {
      id: Date.now(),
      title: body?.title ?? "Untitled",
      body: body?.body ?? "",
      category:
        path.includes("events") || path === "/events"
          ? "event"
          : path.includes("alerts")
            ? "emergency"
            : body?.category ?? "general",
      status: path === "/events" ? "pending" : "published",
      review_status: path === "/events" ? "pending" : "approved",
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      author_name: getMockMe().profile?.display_name ?? "You",
      ...body,
    };
    if (path === "/events") state.admin.adminNotices.unshift(notice);
    else state.notices.unshift(notice);
    return { data: notice, message: "Saved." };
  }
  return null;
}

function handleMarketplace(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path === "/deals") {
    let deals = [...state.deals];
    const businessId = searchParams.get("business_id");
    if (businessId) deals = deals.filter((d) => String(d.business_id) === businessId);
    return { data: deals, meta: { total: deals.length } };
  }

  const dealMatch = path.match(/^\/deals\/(\d+)(?:\/save)?$/);
  if (dealMatch) {
    const deal = findById(state.deals, dealMatch[1]);
    if (!deal) throw new ApiError("Deal not found", { status: 404 });
    if (path.endsWith("/save") && method === "POST") {
      deal.is_liked = !deal.is_liked;
      return ok({ saved: deal.is_liked });
    }
    return ok(deal);
  }

  if (path === "/businesses") return paginate(state.businesses, searchParams);

  const businessMatch = path.match(/^\/businesses\/(\d+)$/);
  if (businessMatch) {
    const biz = findById(state.businesses, businessMatch[1]);
    if (!biz) throw new ApiError("Business not found", { status: 404 });
    return ok(biz);
  }

  if (path === "/listings") {
    let listings = [...state.listings];
    const status = searchParams.get("status");
    if (status && status !== "all") listings = listings.filter((l) => l.status === status);
    return paginate(listings, searchParams);
  }

  const listingMatch = path.match(/^\/listings\/(\d+)(?:\/mark-sold|\/save)?$/);
  if (listingMatch) {
    const listing = findById(state.listings, listingMatch[1]);
    if (!listing) throw new ApiError("Listing not found", { status: 404 });
    if (path.endsWith("/mark-sold") && method === "PATCH") {
      listing.status = "sold";
      return ok(listing);
    }
    if (path.endsWith("/save") && method === "POST") {
      listing.is_saved = !listing.is_saved;
      return ok({ saved: listing.is_saved });
    }
    return ok(listing);
  }

  if (method === "POST" && path === "/listings") {
    const listing = {
      id: Date.now(),
      ...body,
      status: "pending",
      seller_id: getMockMe().id,
      seller_name: getMockMe().profile?.display_name,
      seller_unit: getMockMe().profile?.unit_number,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    state.listings.unshift(listing);
    return ok(listing, { message: "Listing submitted." });
  }
  return null;
}

function handleAmenities(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path === "/amenities" && method === "GET") return ok(state.amenities);

  if (path.match(/^\/amenities\/\d+\/slots$/)) {
    return {
      data: ["09:00-10:00", "10:00-11:00", "14:00-15:00", "15:00-16:00"],
      closed: false,
      weekends_available: true,
      user_already_booked: false,
    };
  }

  if (path === "/bookings" && method === "GET") return ok(state.bookings);

  if (path.startsWith("/bookings/inbox")) {
    const status = searchParams.get("status");
    let items = [...state.bookingInbox];
    if (status && status !== "all") items = items.filter((b) => b.status === status);
    return ok(items);
  }

  if (path === "/bookings" && method === "POST") {
    const booking = { id: Date.now(), status: "pending", ...body, created_at: new Date().toISOString() };
    state.bookings.unshift(booking);
    return ok(booking);
  }

  if (path.match(/^\/bookings\/\d+/)) {
    if (path.endsWith("/approve")) return { message: "Booking approved." };
    if (path.endsWith("/reject")) return { message: "Booking rejected." };
    if (method === "DELETE") return null;
  }

  if (path.startsWith("/admin/amenities") && method === "GET") {
    return { data: [...state.amenities, ...state.admin.adminAmenities], pending_review: 1 };
  }
  return null;
}

function handleWellness(method, pathname) {
  const state = getMockState();
  const { pathname: path } = parseQuery(pathname);

  if (path === "/wellness/hub") return ok(state.wellness.hub);

  const categoryMatch = path.match(/^\/wellness\/categories\/([^/]+)\/courses$/);
  if (categoryMatch) {
    const key = decodeURIComponent(categoryMatch[1]);
    const category = state.wellness.hub.categories.find((c) => c.key === key);
    return ok({
      category: category
        ? {
            id: category.id,
            key: category.key,
            title: category.title,
            subtitle: category.subtitle,
            icon_key: category.icon_key,
            color: category.color,
          }
        : null,
      courses: state.wellness.courses[key] ?? [],
    });
  }

  const courseMatch = path.match(/^\/wellness\/courses\/(\d+)$/);
  if (courseMatch) return ok(state.wellness.courseDetails[courseMatch[1]] ?? null);

  const lessonMatch = path.match(/^\/wellness\/lessons\/(\d+)(?:\/complete)?$/);
  if (lessonMatch) {
    if (path.endsWith("/complete")) return null;
    return ok(state.wellness.lessons[lessonMatch[1]] ?? null);
  }
  return null;
}

function handleSocial(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path === "/conversations" && method === "GET") return ok(state.messages.conversations);

  if (path === "/conversations" && method === "POST") {
    return ok({
      id: Date.now(),
      peer: state.communityMembers.find((m) => m.id === body?.recipient_id) ?? null,
    });
  }

  const messagesMatch = path.match(/^\/conversations\/(\d+)\/messages$/);
  if (messagesMatch) {
    const convId = messagesMatch[1];
    if (method === "POST") {
      const msg = {
        id: Date.now(),
        body: body?.body ?? "",
        sender_id: getMockMe().id,
        is_mine: true,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
      const list = state.messages.messages[convId] ?? (state.messages.messages[convId] = []);
      list.push(msg);
      return ok(msg);
    }
    const peer = state.messages.conversations.find((c) => String(c.id) === convId)?.peer ?? null;
    return { data: state.messages.messages[convId] ?? [], meta: { peer, has_more: false } };
  }

  if (path.startsWith("/community-members")) {
    const q = searchParams.get("search")?.toLowerCase();
    let members = [...state.communityMembers];
    if (q) members = members.filter((m) => m.display_name.toLowerCase().includes(q));
    return ok(members);
  }

  if (path.startsWith("/notifications")) {
    if (path.includes("/read-all")) return null;
    const readMatch = path.match(/^\/notifications\/(\d+)\/read$/);
    if (readMatch && method === "POST") {
      const n = findById(state.notifications, readMatch[1]);
      if (n) n.read_at = new Date().toISOString();
      return null;
    }
    let items = [...state.notifications];
    if (searchParams.get("unread") === "1") items = items.filter((n) => !n.read_at);
    const page = paginate(items, searchParams);
    return {
      ...page,
      unread: state.notifications.filter((n) => !n.read_at).length,
    };
  }

  const neighborMatch = path.match(/^\/neighbors\/(\d+)$/);
  if (neighborMatch) {
    return ok(
      state.neighbors[neighborMatch[1]] ??
        state.communityMembers.find((m) => String(m.id) === neighborMatch[1]) ??
        null,
    );
  }

  if (path === "/leaderboard") return ok(state.points.leaderboard);
  return null;
}

function handleFamily(method, pathname) {
  const state = getMockState();
  const { pathname: path } = parseQuery(pathname);

  if (path === "/families/mine") {
    return ok({ state: state.family.state, family: state.family.family, members: state.family.members });
  }
  if (path === "/families/suggest-number") return ok({ family_number: "OV-7392" });
  if (path.startsWith("/families/check-number")) return ok({ available: true });
  if (path === "/families/join-requests/pending") {
    return { data: state.family.pending_requests, meta: { count: state.family.pending_requests.length } };
  }
  if (method === "POST" && ["/families/join", "/families", "/families/ensure"].includes(path)) {
    return ok(state.family.family, { message: "Request sent." });
  }
  if (method === "POST" && path === "/families/leave") return { message: "Left family." };
  return null;
}

function handleAdmin(method, pathname) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path.startsWith("/admin/dashboard/stats")) {
    return ok({
      scope: { label: "Oak Valley Residences" },
      stats: state.admin.stats,
      pending_actions: state.admin.pending_actions,
      generated_at: new Date().toISOString(),
    });
  }

  if (path.startsWith("/admin/members")) {
    const status = searchParams.get("status");
    let members = [...state.admin.members];
    if (status && status !== "all") members = members.filter((m) => m.status === status);
    return paginate(members, searchParams);
  }

  const memberAction = path.match(/^\/admin\/members\/(\d+)(?:\/approve|\/reject|\/suspend)?$/);
  if (memberAction) {
    const member = findById(state.admin.members, memberAction[1]);
    if (member && path.endsWith("/approve")) member.status = "approved";
    if (member && path.endsWith("/reject")) member.status = "rejected";
    return ok(member ?? {}, { message: "Updated." });
  }

  if (path.startsWith("/admin/guests")) {
    const detail = path.match(/^\/admin\/guests\/(\d+)(?:\/activity|\/revoke|\/extend)?$/);
    if (detail) {
      if (path.endsWith("/activity")) return ok([]);
      return ok(findById(state.guests, detail[1]));
    }
    return { data: state.guests, meta: { total: state.guests.length } };
  }

  if (path.startsWith("/admin/referrals/me")) return ok(state.referrals);

  if (path.startsWith("/admin/billing")) {
    return ok({ status: "active", plan_name: "Professional", trial_ends_at: null, has_payment_method: true });
  }

  const listingApprove = path.match(/^\/admin\/listings\/(\d+)\/(approve|reject)$/);
  if (listingApprove) {
    const listing = findById(state.listings, listingApprove[1]);
    if (listing) listing.status = listingApprove[2] === "approve" ? "active" : "rejected";
    return ok(listing);
  }
  return null;
}

function handleMisc(method, pathname, body) {
  const state = getMockState();
  const { pathname: path, searchParams } = parseQuery(pathname);

  if (path.startsWith("/regions")) return ok(filterDevMockRegions(searchParams.get("q")));
  if (path.startsWith("/communities/search")) {
    return ok(filterDevMockCommunities({ regionId: searchParams.get("region_id"), q: searchParams.get("q") }));
  }

  if (path.startsWith("/documents")) {
    const docMatch = path.match(/^\/documents\/(\d+)(?:\/download)?$/);
    if (docMatch) {
      if (path.endsWith("/download")) return ok({ download_url: "https://example.com/doc.pdf" });
      return ok(findById(state.documents, docMatch[1]));
    }
    return {
      data: state.documents,
      recent: state.documents.slice(0, 2),
      categories: [
        { key: "governance", label: "Governance", count: 2 },
        { key: "amenities", label: "Amenities", count: 1 },
      ],
      total: state.documents.length,
    };
  }

  if (path.startsWith("/community-rules")) {
    const ackMatch = path.match(/^\/community-rules\/(\d+)\/acknowledge$/);
    if (ackMatch && method === "POST") {
      const rule = findById(state.rules, ackMatch[1]);
      if (rule) rule.acknowledged = true;
      return ok(rule);
    }
    return ok(state.rules);
  }

  if (path.startsWith("/guest-invitations")) {
    if (path.endsWith("/pending-approval")) return ok(state.guests.filter((g) => g.status === "pending"));
    if (path.endsWith("/mine")) return ok(state.guests.filter((g) => g.host_name?.includes("Sarah")));
    if (method === "POST") return ok({ id: Date.now(), status: "pending", ...body });
  }

  if (path.startsWith("/reports") && method === "POST") return { message: "Report submitted." };
  if (path.startsWith("/devices")) return { message: "Device registered." };
  if (path.startsWith("/dashboard/stats")) {
    return ok({ posts: 12, events: 2, points: state.points.stats.total_points });
  }
  return null;
}

const HANDLERS = [
  handleAuth,
  handleMe,
  handleFeed,
  handleNotices,
  handleMarketplace,
  handleAmenities,
  handleWellness,
  handleSocial,
  handleFamily,
  handleAdmin,
  handleMisc,
];

export async function mockApiRequest(path, { method = "GET", body } = {}) {
  const normalizedMethod = String(method).toUpperCase();
  const fullPath = path.startsWith("/") ? path : `/${path}`;

  for (const handler of HANDLERS) {
    const result = handler(normalizedMethod, fullPath, body);
    if (result !== null && result !== undefined) return result;
  }

  if (__DEV__) console.warn("[mock-api] Unhandled request:", normalizedMethod, fullPath);
  if (normalizedMethod === "GET") return ok([]);
  return { message: "OK" };
}

export function bootstrapMockPersona(persona = "resident") {
  resetMockState(persona);
  setMockPersona(persona);
  return getMockMe();
}
