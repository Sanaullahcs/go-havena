import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
  Modal,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import StaffTabBar from "../../../components/layout/staff-tab-bar";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { staffStatusTone } from "../../../components/complaints/complaint-meta";
import { Colors } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { fetchStaffInvitations, fetchStaffTasks } from "../../../services/complaints-api";
import { getCachedUser } from "../../../services/auth-session";
import { canAccessDashboard } from "../../../services/community-access";
import { isResidentWithStaff, STAFF_HOME } from "../../../constants/onboarding-routes";
import { useSessionUser } from "../../../hooks/use-session-user";
import { parseApiDate } from "../../../utils/parse-api-date";
import { safeGoBack } from "../../../utils/app-navigation";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting_on_resident", label: "Waiting" },
  { id: "completed", label: "Completed" },
];

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAssigned(value) {
  const date = parseApiDate(value);
  if (!date) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
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

function statusBadge(status, workflow) {
  const tone = staffStatusTone(status, workflow);
  return { bg: tone.bg, color: tone.color, border: tone.bg };
}

function dialablePhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return raw.startsWith("+") ? `+${digits}` : digits;
}

function priorityTone(priority) {
  if (priority === "urgent") return { bg: "#FDECEC", color: "#E11D48" };
  if (priority === "high") return { bg: "#FEF6E7", color: "#D97706" };
  if (priority === "low") return { bg: "#F1F5F9", color: "#64748B" };
  return { bg: "#E8F0F7", color: NAVY };
}

const STATS = [
  { key: "assigned", label: "Assigned", icon: "clipboard", tint: "#E8F1FA", color: NAVY, accent: "#1B4F8A" },
  { key: "in_progress", label: "In Progress", icon: "clock", tint: "#E8F1FA", color: "#1B4F8A", accent: "#1B4F8A" },
  { key: "completed", label: "Completed", icon: "check", tint: "#E7F8EF", color: "#059669", accent: "#34D399" },
];

const RESIDENT_STATS = [
  { id: "all", label: "All", summaryKey: "all", bg: "#1B4F8A", color: "#FFFFFF" },
  { id: "assigned", label: "Open", summaryKey: "assigned", bg: "#E8F1FA", color: "#1B4F8A" },
  { id: "in_progress", label: "In Progress", summaryKey: "in_progress", bg: "#FEF6E7", color: "#D97706" },
  { id: "completed", label: "Completed", summaryKey: "completed", bg: "#E7F8EF", color: "#059669" },
];

export function StaffTasksScreen({ asTab = false }) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const cached = getCachedUser();
  const sessionUser = useSessionUser() || cached;
  const staffOnly = Boolean(cached?.staff_access?.active) && !canAccessDashboard(cached);
  const residentStaff = isResidentWithStaff(sessionUser);
  useSafeModeBack(asTab ? "/(tabs)/home" : STAFF_HOME);
  const [status, setStatus] = useState(typeof params.status === "string" ? params.status : "all");
  useEffect(() => {
    if (typeof params.status === "string" && params.status) setStatus(params.status);
  }, [params.status]);
  const [search, setSearch] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [communities, setCommunities] = useState([]);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const communityRef = useRef(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [callPhone, setCallPhone] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await fetchStaffTasks({
        status,
        search: search.trim(),
        community_id: communityId || undefined,
      });
      setRows(result.data ?? []);
      setSummary(result.meta?.summary ?? {});
      setCounts(result.meta?.counts ?? {});
      setCommunities(result.meta?.communities ?? []);
      if (quiet) setError("");
      try {
        const invitations = await fetchStaffInvitations();
        setInviteCount((invitations ?? []).filter((item) => item.status === "pending").length);
      } catch {
        setInviteCount(0);
      }
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load assigned tasks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, search, status]);

  useFocusEffect(useCallback(() => {
    void load(false);
    const timer = setInterval(() => { void load(true); }, 8000);
    return () => clearInterval(timer);
  }, [load]));

  const communityLabel = communities.find((item) => String(item.id) === String(communityId))?.name || "All communities";
  const taskPath = asTab ? "/(tabs)/assigned-tasks/detail" : "/screens/staff-tasks/detail";

  const toggleCommunity = () => {
    if (communityOpen) {
      setCommunityOpen(false);
      return;
    }
    communityRef.current?.measureInWindow((x, y, width, height) => {
      setMenuBox({ x, y: y + height + 6, width });
      setCommunityOpen(true);
    });
  };

  const chooseCommunity = (id) => {
    setCommunityId(id);
    setCommunityOpen(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader
        title="My Assigned Tasks"
        subtitle={asTab ? (communityId && communityLabel !== "All communities" ? `Staff · ${communityLabel}` : "Staff") : undefined}
        showBack={asTab || (!staffOnly && !residentStaff)}
        onBack={() => safeGoBack(router, navigation, { fallbackPath: asTab ? "/(tabs)/home" : undefined })}
        right={(
          <>
            <Pressable onPress={() => router.push("/screens/staff-tasks/notifications")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications">
              <Feather name="bell" size={sf(18)} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => router.push("/screens/staff-tasks/invitations")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Invitations" style={styles.iconHit}>
              <Feather name="mail" size={sf(18)} color="#FFFFFF" />
              {inviteCount > 0 ? <View style={styles.inviteDot} /> : null}
            </Pressable>
          </>
        )}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={NAVY} />}
        keyboardShouldPersistTaps="handled"
      >
        {asTab ? (
          <View style={styles.residentSummary}>
            {RESIDENT_STATS.map((item) => {
              const active = status === item.id;
              const value = item.summaryKey === "all" ? (counts.all ?? 0) : (summary[item.summaryKey] ?? 0);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setStatus(item.id)}
                  style={[
                    styles.residentCard,
                    { backgroundColor: active ? item.bg : "#F8FAFC" },
                    active && styles.residentCardOn,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.label}, ${value}`}
                >
                  <Text style={[styles.residentCount, { color: active ? item.color : "#334155" }]}>{value}</Text>
                  <Text
                    style={[styles.residentLabel, { color: active ? item.color : "#64748B" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            {STATS.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 ? <View style={styles.summaryRule} /> : null}
                <Pressable
                  onPress={() => setStatus(item.key)}
                  style={styles.summaryItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${summary[item.key] ?? 0}`}
                >
                  <View style={[styles.summaryIcon, { backgroundColor: item.tint }]}>
                    <Feather name={item.icon} size={sf(14)} color={item.color} />
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryValue}>{summary[item.key] ?? 0}</Text>
                    <Text style={styles.summaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                      {item.label}
                    </Text>
                  </View>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
          <View style={styles.summaryAccents}>
            {STATS.map((item) => <View key={item.key} style={[styles.summaryAccent, { backgroundColor: item.accent }]} />)}
          </View>
        </View>
        )}
        <View style={styles.findRow}>
          <Text style={styles.findLabel}>FIND A TASK</Text>
          <Text style={styles.findCount}>{rows.length} total</Text>
        </View>
        <View ref={communityRef} collapsable={false}>
          <Pressable onPress={toggleCommunity} style={styles.community} accessibilityLabel="Community filter">
            <Feather name="grid" size={sf(15)} color={NAVY} />
            <Text style={styles.communityText} numberOfLines={1}>{communityLabel}</Text>
            <Feather name={communityOpen ? "chevron-up" : "chevron-down"} size={sf(16)} color="#64748B" />
          </Pressable>
        </View>
        <Modal visible={communityOpen} transparent animationType="fade" onRequestClose={() => setCommunityOpen(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setCommunityOpen(false)}>
            {menuBox ? (
              <View style={[styles.communityMenu, { top: menuBox.y, left: menuBox.x, width: menuBox.width }]}>
                <Pressable onPress={() => chooseCommunity("")} style={styles.communityOption}>
                  <Text style={[styles.communityText, !communityId && styles.communitySelected]}>All communities</Text>
                  {!communityId ? <Feather name="check" size={sf(14)} color={NAVY} /> : null}
                </Pressable>
                {communities.map((item) => {
                  const selected = String(item.id) === String(communityId);
                  return (
                    <Pressable key={item.id} onPress={() => chooseCommunity(String(item.id))} style={styles.communityOption}>
                      <Text style={[styles.communityText, selected && styles.communitySelected]} numberOfLines={1}>{item.name}</Text>
                      {selected ? <Feather name="check" size={sf(14)} color={NAVY} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Pressable>
        </Modal>
        <View style={styles.search}>
          <Feather name="search" size={sf(16)} color="#94A3B8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by ID, title, community, or unit"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((item) => {
            const active = status === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setStatus(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.filter, active && styles.filterOn]}
              >
                <Text style={[styles.filterText, active && styles.filterTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>Assigned to you</Text>
        </View>
        {loading ? <ActivityIndicator color={NAVY} style={{ marginTop: sw(24) }} /> : null}
        {!loading && error ? <EmptyState icon="alert-circle" title="Could not load tasks" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? <EmptyState icon="clipboard" title="No assigned tasks" body="Complaints assigned to you will appear here." /> : null}
        {!loading && !error ? rows.map((row) => {
          const badge = statusBadge(row.status, row.workflow_status);
          const priority = priorityTone(row.priority);
          const assigned = formatAssigned(row.assigned_at);
          const phone = dialablePhone(row.reporter_phone);
          const place = [row.community_name, row.unit_number ? `Unit ${row.unit_number}` : ""].filter(Boolean).join(" · ");
          if (asTab) {
            return (
              <View key={row.id} style={styles.homeTask}>
                <Pressable onPress={() => router.push({ pathname: taskPath, params: { id: String(row.id) } })} style={styles.homeTaskMain}>
                  <View style={styles.taskTop}>
                    <View style={styles.refRow}>
                      <Feather name="file-text" size={sf(13)} color={NAVY} />
                      <Text style={styles.homeRef} numberOfLines={1}>{row.reference || "Task"}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: badge.color }]} />
                      <Text style={[styles.statusText, { color: badge.color }]} numberOfLines={1}>{row.status_label || pretty(row.status)}</Text>
                    </View>
                  </View>
                  <View style={styles.titleRow}>
                    <Text style={styles.homeTitle} numberOfLines={1}>{row.title}</Text>
                    <Feather name="chevron-right" size={sf(15)} color="#CBD5E1" />
                  </View>
                  <View style={styles.homeMetaRow}>
                    {place ? (
                      <View style={styles.metaItem}>
                        <Feather name="home" size={sf(11)} color="#64748B" />
                        <Text style={styles.homeMeta} numberOfLines={1}>{place}</Text>
                      </View>
                    ) : null}
                    {row.category_label ? (
                      <View style={styles.metaItem}>
                        <Feather name={categoryIcon(row.category || row.category_label)} size={sf(11)} color="#64748B" />
                        <Text style={styles.homeMeta} numberOfLines={1}>{row.category_label}</Text>
                      </View>
                    ) : null}
                    {row.priority ? (
                      <View style={[styles.homePriority, { backgroundColor: priority.bg }]}>
                        <Text style={[styles.homePriorityText, { color: priority.color }]} numberOfLines={1}>{pretty(row.priority)}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                {assigned || phone ? (
                  <View style={styles.footerRow}>
                    {assigned ? (
                      <View style={styles.metaItem}>
                        <Feather name="calendar" size={sf(11)} color="#64748B" />
                        <Text style={styles.homeMeta} numberOfLines={1}>Assigned {assigned}</Text>
                      </View>
                    ) : <View style={styles.metaItem} />}
                    {phone ? (
                      <Pressable
                        onPress={() => setCallPhone(phone)}
                        style={styles.homeCallBtn}
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
          }
          return (
            <View key={row.id} style={styles.task}>
              <Pressable onPress={() => router.push({ pathname: taskPath, params: { id: String(row.id) } })} style={styles.taskMain}>
                <View style={styles.taskTop}>
                  <View style={styles.refRow}>
                    <Feather name="file-text" size={sf(14)} color={NAVY} />
                    <Text style={styles.ref} numberOfLines={1}>{row.reference}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{row.status_label || pretty(row.status)}</Text>
                  </View>
                </View>
                <Text style={styles.title} numberOfLines={2}>{row.title}</Text>
                <View style={styles.metaRow}>
                  {row.community_name ? (
                    <View style={styles.metaItem}>
                      <Feather name="grid" size={sf(12)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>{row.community_name}</Text>
                    </View>
                  ) : null}
                  {row.unit_number ? (
                    <View style={styles.metaItem}>
                      <Feather name="home" size={sf(12)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>Unit {row.unit_number}</Text>
                    </View>
                  ) : null}
                  {row.category_label ? (
                    <View style={styles.metaItem}>
                      <Feather name={categoryIcon(row.category || row.category_label)} size={sf(12)} color="#64748B" />
                      <Text style={styles.meta} numberOfLines={1}>{row.category_label}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.assignedRow}>
                  {assigned ? (
                    <View style={styles.metaItem}>
                      <Feather name="calendar" size={sf(12)} color="#64748B" />
                      <Text style={styles.meta}>Assigned {assigned}</Text>
                    </View>
                  ) : <View style={styles.metaItem} />}
                  {row.priority ? (
                    <View style={[styles.priority, { backgroundColor: priority.bg }]}>
                      <Text style={[styles.priorityText, { color: priority.color }]} numberOfLines={1}>{pretty(row.priority)} priority</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
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
          );
        }) : null}
        {!loading && !error ? (
          <View style={styles.note}>
            <View style={styles.noteDot} />
            <Text style={styles.noteText}>You’re viewing tasks assigned to your staff account</Text>
          </View>
        ) : null}
      </ScrollView>
      {asTab ? null : <StaffTabBar active="tasks" />}
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

export default function StaffTasksRoute() {
  const user = useSessionUser();
  if (user && isResidentWithStaff(user)) {
    return <Redirect href="/(tabs)/assigned-tasks" />;
  }
  return <StaffTasksScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  iconHit: { width: sw(28), height: sw(28), alignItems: "center", justifyContent: "center" },
  inviteDot: { position: "absolute", top: 2, right: 1, width: 7, height: 7, borderRadius: 4, backgroundColor: "#F87171" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(14), paddingBottom: sw(20), gap: sw(10) },
  residentSummary: { flexDirection: "row", gap: sw(8) },
  residentCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: sw(14),
    paddingVertical: sw(11),
    paddingHorizontal: sw(5),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  residentCardOn: { borderColor: "#1B4F8A" },
  residentCount: { fontFamily: Fonts.bold, fontSize: sf(18), lineHeight: sf(22) },
  residentLabel: {
    marginTop: 2,
    width: "100%",
    fontFamily: Fonts.medium,
    fontSize: sf(9.5),
    lineHeight: sf(12),
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  summary: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    overflow: "hidden",
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 6 }, opacity: 0.06, radius: 14 }),
  },
  summaryRow: { flexDirection: "row", alignItems: "stretch" },
  summaryRule: { width: StyleSheet.hairlineWidth, backgroundColor: "#E6EDF5", marginVertical: sw(8) },
  summaryItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(5), paddingHorizontal: sw(6), paddingVertical: sw(8) },
  summaryIcon: { width: sw(24), height: sw(24), borderRadius: sw(8), alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryValue: { fontFamily: Fonts.bold, fontSize: sf(16), lineHeight: sf(20), color: "#0F172A", ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  summaryLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#64748B",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  summaryAccents: { flexDirection: "row" },
  summaryAccent: { flex: 1, height: sw(3) },
  findRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sw(2) },
  findLabel: { fontFamily: Fonts.semiBold, fontSize: sf(11), letterSpacing: 0.8, color: "#64748B" },
  findCount: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
  community: { minHeight: sw(46), borderRadius: sw(14), borderWidth: 1, borderColor: "#E6EDF5", backgroundColor: "#fff", paddingHorizontal: sw(12), flexDirection: "row", alignItems: "center", gap: sw(8) },
  menuBackdrop: { flex: 1 },
  communityMenu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    overflow: "hidden",
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 8 }, opacity: 0.12, radius: 16 }),
  },
  communityOption: { minHeight: sw(44), flexDirection: "row", alignItems: "center", gap: sw(8), paddingHorizontal: sw(12), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#EEF2F6" },
  communityText: { flex: 1, fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  communitySelected: { color: NAVY },
  search: { flexDirection: "row", alignItems: "center", gap: sw(10), height: sw(46), paddingHorizontal: sw(14), borderRadius: sw(14), backgroundColor: "#fff", borderWidth: 1, borderColor: "#E6EDF5" },
  searchInput: { flex: 1, height: "100%", paddingVertical: 0, fontFamily: Fonts.medium, fontSize: sf(14), color: Colors.textPrimary, ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null) },
  filters: { gap: sw(8), paddingVertical: sw(2), paddingRight: sw(4), alignItems: "center" },
  filter: { height: sw(34), paddingHorizontal: sw(14), borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E6EDF5", alignItems: "center", justifyContent: "center" },
  filterOn: { backgroundColor: NAVY, borderColor: NAVY },
  filterText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#64748B" },
  filterTextOn: { color: "#fff" },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sw(2) },
  listTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  homeTask: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    gap: sw(6),
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 6 }, opacity: 0.06, radius: 14 }),
  },
  homeTaskMain: { gap: sw(3) },
  homeRef: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  statusPill: { flexDirection: "row", alignItems: "center", gap: sw(4), borderRadius: 999, paddingHorizontal: sw(7), paddingVertical: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  titleRow: { flexDirection: "row", alignItems: "center", gap: sw(6) },
  homeTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(15), lineHeight: sf(19), color: "#0F172A", ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  homeMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sw(8) },
  homeMeta: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  homePriority: { borderRadius: 999, paddingHorizontal: sw(6), paddingVertical: 1 },
  homePriorityText: { fontFamily: Fonts.semiBold, fontSize: sf(10) },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    paddingTop: sw(6),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7EEF6",
  },
  homeCallBtn: { flexDirection: "row", alignItems: "center", gap: sw(4), height: sw(26), paddingHorizontal: sw(10), borderRadius: 999, backgroundColor: "#E8F1FA" },
  task: { backgroundColor: "#fff", borderRadius: sw(16), borderWidth: 1, borderColor: "#E6EDF5", padding: sw(14), gap: sw(8) },
  taskMain: { gap: sw(8) },
  callBtn: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: sw(4), height: sw(28), paddingHorizontal: sw(10), borderRadius: 999, backgroundColor: "#E8F1FA" },
  callText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  callBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", alignItems: "center", justifyContent: "center", paddingHorizontal: sw(24) },
  callSheet: { width: "100%", maxWidth: 360, backgroundColor: "#FFFFFF", borderRadius: 28, paddingHorizontal: sw(18), paddingTop: sw(22), paddingBottom: sw(16), alignItems: "center" },
  callClose: { position: "absolute", top: sw(12), right: sw(12), zIndex: 2, width: sw(32), height: sw(32), borderRadius: sw(16), backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  callIcon: { width: sw(48), height: sw(48), borderRadius: sw(24), backgroundColor: "#E8F1FA", alignItems: "center", justifyContent: "center", marginBottom: sw(10) },
  callTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#64748B" },
  callNumber: { marginTop: sw(6), fontFamily: Fonts.bold, fontSize: sf(22), color: NAVY },
  callAction: { marginTop: sw(16), alignSelf: "stretch", minHeight: sw(48), borderRadius: sw(14), backgroundColor: NAVY, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(6) },
  callActionText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  taskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  refRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(6) },
  ref: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: sw(8), paddingVertical: sw(3) },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(12) },
  title: { fontFamily: Fonts.bold, fontSize: sf(18), lineHeight: sf(23), color: "#0F172A" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sw(10) },
  metaItem: { flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sw(4) },
  meta: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  assignedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8), marginTop: sw(2), paddingTop: sw(8), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E7EEF6" },
  priority: { borderRadius: 999, borderWidth: 1, borderColor: "#E6EDF5", paddingHorizontal: sw(8), paddingVertical: sw(3) },
  priorityText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  note: { flexDirection: "row", alignItems: "center", gap: sw(6), marginTop: sw(2) },
  noteDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" },
  noteText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
});
