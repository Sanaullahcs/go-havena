import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, RefreshControl, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import StaffTabBar from "../../../components/layout/staff-tab-bar";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { fetchStaffTasks } from "../../../services/complaints-api";
import { parseApiDate } from "../../../utils/parse-api-date";

const AVATARS = [
  { bg: "#E8F0F7", color: NAVY },
  { bg: "#E5F6EF", color: "#3D8B6E" },
  { bg: "#F3E8F8", color: "#7C5CBF" },
  { bg: "#FEF6E7", color: "#C2410C" },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "R";
}

function avatarTone(name) {
  const value = String(name || "");
  const index = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATARS.length;
  return AVATARS[index];
}

function formatWhen(value) {
  const date = parseApiDate(value) || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function matches(row, query) {
  if (!query) return true;
  const haystack = [row.reporter_name, row.reference, row.unit_number, row.last_message, row.community_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function StaffMessagesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try {
      const result = await fetchStaffTasks({});
      const conversations = (result.data ?? [])
        .filter((row) => row.last_message || Number(row.unread_count) > 0)
        .sort((a, b) => String(b.last_message_at || b.updated_at || "").localeCompare(String(a.last_message_at || a.updated_at || "")));
      setRows(conversations);
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load messages.");
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => matches(row, needle));
  }, [query, rows]);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader
        title="Messages"
        subtitle="Resident conversations"
        right={(
          <>
            <Pressable onPress={() => router.push("/screens/staff-tasks/notifications")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications">
              <Feather name="bell" size={sf(18)} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => router.push("/screens/staff-tasks/invitations")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Invitations">
              <Feather name="mail" size={sf(18)} color="#FFFFFF" />
            </Pressable>
          </>
        )}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={NAVY} />}
      >
        <View style={styles.search}>
          <Feather name="search" size={sf(16)} color="#94A3B8" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        {loading ? <ActivityIndicator color={NAVY} style={styles.loader} /> : null}
        {!loading && error ? <EmptyState icon="alert-circle" title="Could not load messages" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} /> : null}
        {!loading && !error && rows.length === 0 ? <EmptyState icon="message-circle" title="No messages yet" body="Conversations with residents appear here." /> : null}
        {!loading && !error && rows.length > 0 && visible.length === 0 ? <EmptyState icon="search" title="No matching conversations" body="Try a name, reference, unit, or message." /> : null}
        {!loading && !error ? visible.map((row) => {
          const tone = avatarTone(row.reporter_name);
          const unread = Number(row.unread_count) > 0;
          const place = [row.reference, row.unit_number ? `Unit ${row.unit_number}` : ""].filter(Boolean).join(" · ");
          return (
            <Pressable
              key={row.id}
              onPress={() => router.push({ pathname: "/screens/staff-tasks/chat", params: { id: String(row.id) } })}
              style={[styles.card, unread && styles.cardUnread]}
            >
              {unread ? <View style={styles.accent} /> : null}
              <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
                <Text style={[styles.avatarText, { color: tone.color }]}>{initials(row.reporter_name)}</Text>
              </View>
              <View style={styles.copy}>
                <View style={styles.top}>
                  <Text style={styles.name} numberOfLines={1}>{row.reporter_name || "Resident"}</Text>
                  <Text style={styles.time}>{formatWhen(row.last_message_at || row.updated_at)}</Text>
                </View>
                {place ? <Text style={styles.ref} numberOfLines={1}>{place}</Text> : null}
                <Text style={styles.preview} numberOfLines={1}>{row.last_message || "Open the conversation"}</Text>
              </View>
              {unread ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{row.unread_count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }) : null}
      </ScrollView>
      <StaffTabBar active="messages" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(14), paddingBottom: sw(20), gap: sw(10) },
  search: {
    height: sw(46),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EDF5",
    paddingHorizontal: sw(14),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  searchInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: "#0F172A",
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
  },
  loader: { marginTop: sw(12) },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    paddingVertical: sw(12),
    paddingRight: sw(12),
    paddingLeft: sw(12),
    overflow: "hidden",
  },
  cardUnread: { backgroundColor: "#F7FAFD", borderColor: "#D7E4F2" },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: sw(3), backgroundColor: NAVY },
  avatar: { width: sw(44), height: sw(44), borderRadius: sw(22), alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: Fonts.bold, fontSize: sf(15) },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  name: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(15), color: "#0F172A" },
  time: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  ref: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  preview: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: "#334155" },
  unread: {
    minWidth: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    paddingHorizontal: sw(6),
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { fontFamily: Fonts.bold, fontSize: sf(11), color: "#FFFFFF" },
});
