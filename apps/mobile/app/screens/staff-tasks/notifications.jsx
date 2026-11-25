import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import {
  fetchNotifications,
  markNotificationRead,
  resolveNotificationRoute,
} from "../../../services/notifications-api";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "messages", label: "Messages" },
  { id: "updates", label: "Updates" },
];

function groupFor(item) {
  const text = `${item?.title || ""} ${item?.description || ""} ${item?.actionUrl || ""}`.toLowerCase();
  if (text.includes("message") || text.includes("chat=1")) return "messages";
  if (text.includes("invitation") || text.includes("assigned")) return "tasks";
  return "updates";
}

function iconFor(group) {
  if (group === "messages") return "message-circle";
  if (group === "tasks") return "clipboard";
  return "refresh-cw";
}

export default function StaffNotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try {
      const result = await fetchNotifications({ page: 1, perPage: 40 });
      setItems(result.notifications ?? []);
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load notifications.");
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

  const visible = useMemo(
    () => items.filter((item) => filter === "all" || groupFor(item) === filter),
    [filter, items],
  );
  const unread = items.filter((item) => !item.read).length;

  const open = async (item) => {
    if (!item.read) {
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      void markNotificationRead(item.id).catch(() => {});
    }
    const route = resolveNotificationRoute(item);
    if (route?.pathname) router.push(route);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "Assignments, messages, and updates"}
        showBack
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={NAVY} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, active && styles.filterOn]}>
                <Text style={[styles.filterText, active && styles.filterTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {loading ? <ActivityIndicator color={NAVY} /> : null}
        {!loading && error ? <EmptyState icon="alert-circle" title="Could not load notifications" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} /> : null}
        {!loading && !error && visible.length === 0 ? <EmptyState icon="bell" title="No notifications" body="Assignments, messages, and updates appear here." /> : null}
        {!loading && !error ? visible.map((item) => {
          const group = groupFor(item);
          return (
            <Pressable key={item.id} onPress={() => void open(item)} style={[styles.row, !item.read && styles.rowUnread]}>
              <View style={styles.icon}><Feather name={iconFor(group)} size={sf(16)} color={NAVY} /></View>
              <View style={styles.copy}>
                <Text style={styles.title}>{item.title}</Text>
                {item.description ? <Text style={styles.bodyText} numberOfLines={2}>{item.description}</Text> : null}
                <Text style={styles.time}>{item.time}</Text>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        }) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  body: { padding: sw(16), gap: sw(10) },
  filters: { gap: sw(8), paddingBottom: sw(4) },
  filter: { height: sw(34), paddingHorizontal: sw(14), borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E6EDF5", alignItems: "center", justifyContent: "center" },
  filterOn: { backgroundColor: NAVY, borderColor: NAVY },
  filterText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#64748B" },
  filterTextOn: { color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: "#fff",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    padding: sw(12),
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8 }),
  },
  rowUnread: { backgroundColor: "#F7FAFD", borderColor: "#D7E4F2" },
  icon: { width: sw(32), height: sw(32), borderRadius: sw(10), backgroundColor: "#E8F0F7", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0F172A" },
  bodyText: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: "#475569" },
  time: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0F766E", marginTop: sw(6) },
});
