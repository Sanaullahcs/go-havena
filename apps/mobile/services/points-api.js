import { apiRequest } from "./api-client";
import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

const ACTION_ICONS = {
  lesson_completed: { icon: "book-open", iconColor: "#0A2A43", iconBg: "#D1FAF5" },
  community_post: { icon: "edit-3", iconColor: "#059669", iconBg: "#ECFDF5" },
  streak_bonus: { icon: "zap", iconColor: "#D97706", iconBg: "#FFFBEB" },
  daily_activity: { icon: "activity", iconColor: "#0EA5E9", iconBg: "#D1FAF5" },
  daily_login: { icon: "log-in", iconColor: "#0EA5E9", iconBg: "#D1FAF5" },
  profile_completed: { icon: "user-check", iconColor: "#059669", iconBg: "#ECFDF5" },
  booking: { icon: "calendar", iconColor: "#7C3AED", iconBg: "#F3E8FF" },
};

const DEFAULT_ICON = { icon: "star", iconColor: "#0A2A43", iconBg: "#D1FAF5" };

function formatHistoryTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const locale = getLocaleForLang(i18n.language);
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

  if (isToday) return `${i18n.t("time.today")} · ${time}`;
  if (isYesterday) return `${i18n.t("time.yesterday")} · ${time}`;
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })} · ${time}`;
}

export async function fetchPointsStats() {
  const res = await apiRequest("/me/points/stats");
  return res.data ?? {};
}

export async function fetchPointsHistory({ page = 1, perPage = 20 } = {}) {
  const res = await apiRequest(`/me/points/history?page=${page}&per_page=${perPage}`);

  const items = (res.data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle ?? "",
    points: item.points >= 0 ? `+${item.points}` : String(item.points),
    time: formatHistoryTime(item.created_at),
    ...(ACTION_ICONS[item.action] ?? DEFAULT_ICON),
  }));

  return {
    items,
    meta: res.meta ?? {},
  };
}

export async function fetchLeaderboard() {
  const res = await apiRequest("/leaderboard");
  return res.data ?? { entries: [], my_rank: null };
}

export async function fetchRankDetails() {
  const res = await apiRequest("/me/points/rank");
  return res.data ?? {};
}

export function formatPoints(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

export function formatRank(rank) {
  if (rank == null || rank <= 0) return "—";
  return `#${rank}`;
}
