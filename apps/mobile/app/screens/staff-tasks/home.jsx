import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl, StyleSheet, Platform, Linking, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import StaffTabBar from "../../../components/layout/staff-tab-bar";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { staffStatusTone } from "../../../components/complaints/complaint-meta";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { fetchStaffInvitations, fetchStaffTasks } from "../../../services/complaints-api";
import { fetchNotificationUnreadCount } from "../../../services/notifications-api";
import { getCachedUser } from "../../../services/auth-session";
import { STAFF_HOME } from "../../../constants/onboarding-routes";
import { parseApiDate } from "../../../utils/parse-api-date";

const STATS = [
  { key: "assigned", label: "Assigned", icon: "clipboard", tint: "#E8F1FA", color: NAVY, accent: "#1B4F8A" },
  { key: "in_progress", label: "In Progress", icon: "clock", tint: "#E8F1FA", color: "#1B4F8A", accent: "#1B4F8A" },
  { key: "completed", label: "Completed", icon: "check", tint: "#E7F8EF", color: "#059669", accent: "#34D399" },
];

function firstName(user) {
  const name = user?.profile?.display_name || user?.name || "there";
  return String(name).trim().split(/\s+/)[0] || "there";
}

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dialablePhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return raw.startsWith("+") ? `+${digits}` : digits;
}

function formatAssigned(value) {
  const date = parseApiDate(value);
  if (!date) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function priorityTone(priority) {
  if (priority === "urgent") return { bg: "#FDECEC", color: "#E11D48" };
  if (priority === "high") return { bg: "#FEF6E7", color: "#D97706" };
  if (priority === "low") return { bg: "#F1F5F9", color: "#64748B" };
  return { bg: "#E8F0F7", color: NAVY };
}


function categoryIcon(category) {
  const key = String(category || "").toLowerCase();
  if (key.includes("electric")) return "zap";
  if (key.includes("plumb")) return "droplet";
  if (key.includes("clean")) return "wind";
  if (key.includes("lift")) return "arrow-up";
  if (key.includes("park")) return "square";
  return "tool";
}

export default function StaffHomeScreen() {
  const router = useRouter();
  const user = getCachedUser();
  useSafeModeBack(STAFF_HOME);
  const [summary, setSummary] = useState({});
  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [callPhone, setCallPhone] = useState("");

  const communities = user?.staff_access?.communities ?? [];
  const communityLine = communities.length
    ? `Staff · ${communities.map((item) => item.name).join(", ")}`
    : "Staff";

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try {
      const result = await fetchStaffTasks({});
      setSummary(result.meta?.summary ?? {});
      setRows((result.data ?? []).slice(0, 4));
      if (quiet) setError("");
      try {
        const notes = await fetchNotificationUnreadCount();
        setUnread(Number(notes?.unread || 0));
      } catch {
        setUnread(0);
      }
      try {
        const invitations = await fetchStaffInvitations();
        setInviteCount((invitations ?? []).filter((item) => item.status === "pending").length);
      } catch {
        setInviteCount(0);
      }
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load your tasks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load(false);
    const timer = setInterval(() => { void load(true); }, 8000);
    return () => clearInterval(timer);
  }, [load]));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader
        title={`Hello, ${firstName(user)}`}
        subtitle={communityLine}
        right={(
          <>
            <Pressable onPress={() => router.push("/screens/staff-tasks/notifications")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications" style={styles.iconHit}>
              <Feather name="bell" size={sf(18)} color="#FFFFFF" />
              {unread > 0 ? <View style={styles.bellDot} /> : null}
            </Pressable>
            <Pressable onPress={() => router.push("/screens/staff-tasks/invitations")} hitSlop={8} accessibilityRole="button" accessibilityLabel={inviteCount > 0 ? `${inviteCount} pending invitations` : "Invitations"} style={styles.iconHit}>
              <Feather name="mail" size={sf(18)} color="#FFFFFF" />
              {inviteCount > 0 ? (
                <View style={styles.mailBadge}>
                  <Text style={styles.mailBadgeText}>{inviteCount > 9 ? "9+" : String(inviteCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          </>
        )}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={NAVY} />}
      >
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            {STATS.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 ? <View style={styles.summaryRule} /> : null}
                <Pressable
                  onPress={() => router.push({ pathname: "/screens/staff-tasks", params: { status: item.key } })}
                  style={styles.summaryItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${summary[item.key] ?? 0}`}
                >
                  <View style={[styles.summaryIcon, { backgroundColor: item.tint }]}>
                    <Feather name={item.icon} size={sf(14)} color={item.color} />
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryValue}>{summary[item.key] ?? 0}</Text>
                    <Text style={styles.summaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.label}</Text>
                  </View>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
          <View style={styles.summaryAccents}>
            {STATS.map((item) => <View key={item.key} style={[styles.summaryAccent, { backgroundColor: item.accent }]} />)}
          </View>
        </View>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>My Tasks</Text>
          <Pressable onPress={() => router.push("/screens/staff-tasks")} hitSlop={8} style={styles.linkBtn} accessibilityRole="button" accessibilityLabel="View all tasks">
            <Text style={styles.link}>View All</Text>
            <Feather name="chevron-right" size={sf(14)} color={NAVY} />
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={NAVY} style={styles.loader} /> : null}
        {!loading && error ? <EmptyState icon="alert-circle" title="Could not load tasks" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} /> : null}
        {!loading && !error && rows.length === 0 ? <EmptyState icon="clipboard" title="No assigned tasks" body="Service requests assigned to you will appear here." /> : null}
        {!loading && !error ? rows.map((row) => {
          const priority = priorityTone(row.priority);
          const status = staffStatusTone(row.status, row.workflow_status);
          const place = [row.community_name, row.unit_number ? `Unit ${row.unit_number}` : ""].filter(Boolean).join(" · ");
          const assigned = formatAssigned(row.assigned_at);
          const phone = dialablePhone(row.reporter_phone);
          return (
            <View key={row.id} style={styles.task}>
              <Pressable onPress={() => router.push({ pathname: "/screens/staff-tasks/detail", params: { id: String(row.id) } })} style={styles.taskMain}>
                <View style={styles.taskTop}>
                  <View style={styles.refRow}>
                    <Feather name="file-text" size={sf(13)} color={NAVY} />
                    <Text style={styles.ref} numberOfLines={1}>{row.reference || "Task"}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>{row.status_label || pretty(row.status)}</Text>
                  </View>
                </View>
                <View style={styles.titleRow}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{row.title}</Text>
                  <Feather name="chevron-right" size={sf(15)} color="#CBD5E1" />
                </View>
                <View style={styles.metaRow}>
                  {place ? (
                    <View style={styles.metaItem}>
                      <Feather name="home" size={sf(11)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>{place}</Text>
                    </View>
                  ) : null}
                  {row.category_label ? (
                    <View style={styles.metaItem}>
                      <Feather name={categoryIcon(row.category || row.category_label)} size={sf(11)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>{row.category_label}</Text>
                    </View>
                  ) : null}
                  {row.priority ? (
                    <View style={[styles.priority, { backgroundColor: priority.bg }]}>
                      <Text style={[styles.priorityText, { color: priority.color }]} numberOfLines={1}>{pretty(row.priority)}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
              {assigned || phone ? (
                <View style={styles.footerRow}>
                  {assigned ? (
                    <View style={styles.metaItem}>
                      <Feather name="calendar" size={sf(11)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>Assigned {assigned}</Text>
                    </View>
                  ) : <View style={styles.metaItem} />}
                  {phone ? (
                    <Pressable
                      onPress={() => setCallPhone(phone)}
                      style={styles.callBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Call resident"
                    >
                      <Feather name="phone" size={sf(12)} color={NAVY} />
                      <Text style={styles.callText}>Call</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }) : null}
      </ScrollView>
      <StaffTabBar active="home" />
      <Modal visible={Boolean(callPhone)} transparent animationType="fade" onRequestClose={() => setCallPhone("")}>
        <Pressable style={styles.callBackdrop} onPress={() => setCallPhone("")}>
          <Pressable style={styles.callSheet} onPress={() => {}}>
            <Pressable onPress={() => setCallPhone("")} style={styles.callClose} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={sf(16)} color="#334155" />
            </Pressable>
            <View style={styles.callIcon}>
              <Feather name="phone" size={sf(18)} color={NAVY} />
            </View>
            <Text style={styles.callTitle}>Resident phone</Text>
            <Text style={styles.callNumber}>{callPhone}</Text>
            <Pressable
              onPress={() => { void Linking.openURL(`tel:${callPhone}`); }}
              style={styles.callAction}
              accessibilityRole="button"
              accessibilityLabel={`Call ${callPhone}`}
            >
              <Feather name="phone" size={sf(15)} color="#FFFFFF" />
              <Text style={styles.callActionText}>Call</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const lift = rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 6 }, opacity: 0.06, radius: 14 });

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  iconHit: { width: sw(28), height: sw(28), alignItems: "center", justifyContent: "center" },
  bellDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: sw(7),
    height: sw(7),
    borderRadius: sw(4),
    backgroundColor: "#EF4444",
  },
  mailBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: sw(14),
    height: sw(14),
    borderRadius: sw(7),
    paddingHorizontal: 2,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  mailBadgeText: { fontFamily: Fonts.bold, fontSize: sf(8), color: "#FFFFFF" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(14), paddingBottom: sw(16), gap: sw(8) },
  summary: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    overflow: "hidden",
    ...lift,
  },
  summaryRow: { flexDirection: "row", alignItems: "stretch" },
  summaryRule: { width: StyleSheet.hairlineWidth, backgroundColor: "#E6EDF5", marginVertical: sw(8) },
  summaryItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(6), paddingHorizontal: sw(8), paddingVertical: sw(8) },
  summaryIcon: { width: sw(24), height: sw(24), borderRadius: sw(8), alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryValue: { fontFamily: Fonts.bold, fontSize: sf(16), lineHeight: sf(20), color: "#0F172A", ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  summaryLabel: { fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(14), color: "#64748B" },
  summaryAccents: { flexDirection: "row" },
  summaryAccent: { flex: 1, height: sw(3) },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sw(2) },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: sw(2) },
  link: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },
  loader: { marginTop: sw(8) },
  task: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    gap: sw(6),
    ...lift,
  },
  taskMain: { gap: sw(3) },
  taskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  refRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(5) },
  ref: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  statusPill: { flexDirection: "row", alignItems: "center", gap: sw(4), borderRadius: 999, paddingHorizontal: sw(7), paddingVertical: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  titleRow: { flexDirection: "row", alignItems: "center", gap: sw(6) },
  taskTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(15), lineHeight: sf(19), color: "#0F172A", ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sw(8) },
  metaItem: { flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(4) },
  meta: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  priority: { borderRadius: 999, paddingHorizontal: sw(6), paddingVertical: 1 },
  priorityText: { fontFamily: Fonts.semiBold, fontSize: sf(10) },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    paddingTop: sw(6),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7EEF6",
  },
  callBtn: { flexDirection: "row", alignItems: "center", gap: sw(4), height: sw(26), paddingHorizontal: sw(10), borderRadius: 999, backgroundColor: "#E8F1FA" },
  callText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  callBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", alignItems: "center", justifyContent: "center", paddingHorizontal: sw(24) },
  callSheet: { width: "100%", maxWidth: 360, backgroundColor: "#FFFFFF", borderRadius: 28, paddingHorizontal: sw(18), paddingTop: sw(22), paddingBottom: sw(16), alignItems: "center" },
  callClose: { position: "absolute", top: sw(12), right: sw(12), zIndex: 2, width: sw(32), height: sw(32), borderRadius: sw(16), backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  callIcon: { width: sw(48), height: sw(48), borderRadius: sw(24), backgroundColor: "#E8F1FA", alignItems: "center", justifyContent: "center", marginBottom: sw(10) },
  callTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#64748B" },
  callNumber: { marginTop: sw(6), fontFamily: Fonts.bold, fontSize: sf(22), color: NAVY },
  callAction: { marginTop: sw(16), alignSelf: "stretch", minHeight: sw(48), borderRadius: sw(14), backgroundColor: NAVY, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(6) },
  callActionText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
});
