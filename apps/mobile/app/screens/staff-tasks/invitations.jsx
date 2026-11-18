import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { getTopInset } from "../../../components/layout/system-chrome";
import { STAFF_NAVY } from "../../../components/layout/staff-screen-header";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { acceptStaffInvitation, fetchStaffInvitations } from "../../../services/complaints-api";
import { fetchMe } from "../../../services/auth-api";
import { canAccessDashboard } from "../../../services/community-access";
import { STAFF_HOME } from "../../../constants/onboarding-routes";
import { parseApiDate } from "../../../utils/parse-api-date";
import { safeGoBack } from "../../../utils/app-navigation";

const STATUS = {
  pending: { label: "Pending", color: NAVY, bg: "#E8F0F7" },
  expired: { label: "Expired", color: "#B45309", bg: "#FEF6E7" },
  inactive: { label: "Inactive", color: "#64748B", bg: "#F1F5F9" },
};

function formatWhen(value) {
  const date = parseApiDate(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function StaffInvitationsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useSafeModeBack();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await fetchStaffInvitations());
    } catch (err) {
      setError(err?.message || "Could not load invitations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const visible = useMemo(
    () => rows.filter((row) => (tab === "pending" ? row.status === "pending" : row.status !== "pending")),
    [rows, tab],
  );

  const accept = async (id) => {
    setBusyId(id);
    setMessage("");
    try {
      const result = await acceptStaffInvitation(id);
      const user = await fetchMe();
      if (user?.staff_access?.active && !canAccessDashboard(user)) {
        router.replace(STAFF_HOME);
        return;
      }
      setMessageOk(true);
      setMessage(result?.message || "Staff access is active for this community.");
      await load();
    } catch (err) {
      setMessageOk(false);
      setMessage(err?.message || "Could not accept this invitation.");
    } finally {
      setBusyId(0);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.header, { paddingTop: getTopInset(insets) + sw(4) }]}>
        <ScreenStatusBar style="light" androidBackgroundColor={STAFF_NAVY} />
        <View style={styles.headerTop}>
          <Pressable onPress={() => safeGoBack(router, navigation)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Feather name="chevron-left" size={sf(18)} color="#FFFFFF" />
            <Text style={styles.backText}>Back to Home</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>Your community access</Text>
        <Text style={styles.title}>Invitations</Text>
        <Text style={styles.subtitle}>A simpler way to join your next team.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.tabs}>
          {["pending", "responded"].map((id) => {
            const selected = tab === id;
            return (
              <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, selected && styles.tabOn]} accessibilityRole="button" accessibilityState={{ selected }}>
                <Text style={[styles.tabText, selected && styles.tabTextOn]}>{id === "pending" ? "Pending" : "Responded"}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.summary}>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryKicker}>AWAITING YOUR RESPONSE</Text>
            <Text style={styles.summaryTitle}>Pending invitations</Text>
          </View>
          <View style={styles.pendingPill}>
            <Text style={styles.pendingText}>{pendingCount} pending</Text>
          </View>
        </View>
        {message ? (
          <View style={[styles.banner, messageOk ? styles.bannerOk : styles.bannerError]}>
            <Feather name={messageOk ? "check-circle" : "alert-circle"} size={sf(15)} color={messageOk ? "#0F766E" : "#B91C1C"} />
            <Text style={[styles.bannerText, { color: messageOk ? "#0F766E" : "#B91C1C" }]}>{message}</Text>
          </View>
        ) : null}
        {loading ? <ActivityIndicator color={NAVY} style={styles.loader} /> : null}
        {!loading && error ? <EmptyState icon="alert-circle" title="Could not load invitations" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} /> : null}
        {!loading && !error && visible.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="mail" size={sf(28)} color={NAVY} />
            </View>
            <Text style={styles.emptyTitle}>{tab === "pending" ? "All caught up!" : "Nothing here yet"}</Text>
            <Text style={styles.emptyBody}>
              {tab === "pending"
                ? "You have no community invitations waiting for your response."
                : "Invitations you have already responded to appear here."}
            </Text>
          </View>
        ) : null}
        {!loading && !error ? visible.map((row) => {
          const status = STATUS[row.status] ?? STATUS.inactive;
          const pending = row.status === "pending";
          const detail = pending
            ? "Waiting for your acceptance"
            : row.status === "expired"
              ? "This invitation has expired"
              : "This invitation is no longer active";
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Feather name="home" size={sf(16)} color={NAVY} />
                </View>
                <View style={styles.cardCopy}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{row.community_name}</Text>
                    <View style={[styles.badge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{detail}</Text>
                  {row.expires_at ? <Text style={styles.cardDate}>{pending ? "Expires" : "Dated"} {formatWhen(row.expires_at)}</Text> : null}
                </View>
              </View>
              {pending ? (
                <Pressable disabled={busyId === row.id} onPress={() => void accept(row.id)} style={[styles.button, busyId === row.id && styles.buttonBusy]}>
                  <Text style={styles.buttonText}>{busyId === row.id ? "Accepting…" : "Accept invitation"}</Text>
                </Pressable>
              ) : (
                <Text style={styles.cardNote}>Ask that community admin to send a new invitation.</Text>
              )}
            </View>
          );
        }) : null}
        <View style={styles.info}>
          <Feather name="shield" size={sf(14)} color={NAVY} />
          <Text style={styles.infoText}>When a community invites you as staff, you’ll be able to review and accept it here.</Text>
        </View>
        <Text style={styles.footer}>Only invitations for your Havena account appear here</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  header: {
    backgroundColor: STAFF_NAVY,
    paddingHorizontal: sw(16),
    paddingBottom: sw(14),
    borderBottomLeftRadius: sw(20),
    borderBottomRightRadius: sw(20),
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#FFFFFF" },
  eyebrow: { marginTop: sw(8), fontFamily: Fonts.semiBold, fontSize: sf(11), letterSpacing: 1.1, color: "rgba(255,255,255,0.72)", textTransform: "uppercase" },
  title: { marginTop: sw(2), fontFamily: Fonts.bold, fontSize: sf(24), lineHeight: sf(28), color: "#FFFFFF", ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  subtitle: { marginTop: sw(2), fontFamily: Fonts.medium, fontSize: sf(13), color: "rgba(255,255,255,0.8)" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(16), paddingBottom: sw(28), gap: sw(12) },
  summary: { backgroundColor: "#FFFFFF", borderRadius: sw(16), paddingHorizontal: sw(14), paddingVertical: sw(14), flexDirection: "row", alignItems: "center", gap: sw(10) },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryKicker: { fontFamily: Fonts.semiBold, fontSize: sf(10), letterSpacing: 0.6, color: "#94A3B8" },
  summaryTitle: { marginTop: 2, fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  pendingPill: { borderRadius: 999, backgroundColor: "#E7F8EF", paddingHorizontal: sw(10), paddingVertical: sw(6) },
  pendingText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#059669" },
  tabs: { flexDirection: "row", backgroundColor: "#E8EEF5", borderRadius: sw(14), padding: sw(4) },
  tab: { flex: 1, height: sw(36), borderRadius: sw(10), alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: "#FFFFFF" },
  tabText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#64748B" },
  tabTextOn: { color: NAVY },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: sw(8), borderRadius: sw(12), borderWidth: 1, paddingHorizontal: sw(12), paddingVertical: sw(10) },
  bannerOk: { backgroundColor: "#F3FBF7", borderColor: "#D1FAE5" },
  bannerError: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  bannerText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
  loader: { marginTop: sw(12) },
  empty: { backgroundColor: "#FFFFFF", borderRadius: sw(16), borderWidth: 1, borderColor: "#E6EDF5", alignItems: "center", paddingHorizontal: sw(20), paddingVertical: sw(28), gap: sw(8) },
  emptyIcon: { width: sw(64), height: sw(64), borderRadius: sw(32), backgroundColor: "#E8F1FA", alignItems: "center", justifyContent: "center", marginBottom: sw(4) },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: "#0F172A" },
  emptyBody: { fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#64748B", textAlign: "center" },
  card: { backgroundColor: "#FFFFFF", borderRadius: sw(16), borderWidth: 1, borderColor: "#E6EDF5", padding: sw(14), gap: sw(12) },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  cardIcon: { width: sw(36), height: sw(36), borderRadius: sw(10), backgroundColor: "#F4F8FD", alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  cardName: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  badge: { borderRadius: 999, paddingHorizontal: sw(8), paddingVertical: sw(3) },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  cardMeta: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  cardDate: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
  cardNote: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(17), color: "#64748B" },
  button: { minHeight: sw(40), borderRadius: sw(12), backgroundColor: NAVY, alignItems: "center", justifyContent: "center" },
  buttonBusy: { opacity: 0.7 },
  buttonText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },
  info: { flexDirection: "row", alignItems: "flex-start", gap: sw(8), backgroundColor: "#F7FAFD", borderRadius: sw(14), borderWidth: 1, borderColor: "#E6EDF5", padding: sw(12) },
  infoText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(17), color: "#64748B" },
  footer: { textAlign: "center", fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
});
