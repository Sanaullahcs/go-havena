import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { PropertyType } from "../../../../constants/property-management-type";
import React, { useState, useEffect, useCallback } from "react";
import { Fonts } from "../../../../constants/font";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { Property, propertyStyles } from "../../../../constants/property-styles";
import { fetchMyBookings, cancelBooking } from "../../../../services/amenity-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useAppDialog } from "../../../../providers/app-dialog-provider";
import { sw, sf } from "../../../../utils/responsive";

const STATUS_META = {
  pending: { label: "Pending", color: "#B45309", bg: "#FEF3C7", icon: "clock" },
  confirmed: { label: "Confirmed", color: "#047857", bg: "#ECFDF5", icon: "check-circle" },
  rejected: { label: "Declined", color: "#B91C1C", bg: "#FEF2F2", icon: "x-circle" },
  cancelled: { label: "Cancelled", color: "#64748B", bg: "#F1F5F9", icon: "slash" },
};

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  try {
    // Parse YYYY-MM-DD as a local date to avoid UTC day-shift.
    const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return timeStr ? `${dateLabel} at ${timeStr}` : dateLabel;
  } catch {
    return dateStr;
  }
}

export default function MyBooking() {
  const [selectedTab, setSelectedTab] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchMyBookings();
      setBookings(data);
    } catch (err) {
      await showFailure("Could not load bookings", err);
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const handleCancel = async (reservation) => {
    const isPending = reservation?.status === "pending";
    const confirmed = await showConfirm(
      isPending ? "Cancel Request" : "Cancel Reservation",
      isPending
        ? "Withdraw this booking request? You can request again later."
        : "Are you sure you want to cancel this booking?",
      { confirmLabel: isPending ? "Withdraw" : "Cancel Booking", cancelLabel: "Keep It", destructive: true },
    );
    if (confirmed !== "confirm") return;

    await runAction({
      action: () => cancelBooking(reservation.id),
      successTitle: isPending ? "Request withdrawn" : "Reservation cancelled",
      successMessage: isPending
        ? "Your booking request was withdrawn."
        : "Your booking was cancelled successfully.",
      errorTitle: "Could not cancel booking",
      onSuccess: () => load(true),
    });
  };

  // Compare as YYYY-MM-DD strings to stay timezone-safe (avoids UTC parsing
  // pushing today's/tomorrow's bookings into the past).
  const t = new Date();
  const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(
    t.getDate(),
  ).padStart(2, "0")}`;

  const categorized = bookings.map((b) => {
    const dateKey = String(b.date ?? b.starts_at ?? "").slice(0, 10);
    const isActive = b.status === "pending" || b.status === "confirmed";
    return {
      ...b,
      timeframe: isActive && dateKey >= todayKey ? "upcoming" : "past",
    };
  });

  const upcomingCount = categorized.filter((b) => b.timeframe === "upcoming").length;
  const tabs = [
    { id: "upcoming", title: `Upcoming (${upcomingCount})` },
    { id: "past", title: "Past" },
    { id: "all", title: "All" },
  ];

  const filtered = selectedTab === "all" ? categorized : categorized.filter((b) => b.timeframe === selectedTab);

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title="My Reservations" subtitle={`${upcomingCount} upcoming reservations`} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
        style={styles.tabScroll}
      >
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.id;
          return (
            <Pressable key={tab.id} onPress={() => setSelectedTab(tab.id)} style={[styles.tab, isSelected && styles.tabActive]}>
              <Text style={[styles.tabText, isSelected && styles.tabTextActive]} numberOfLines={1}>
                {tab.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#007BFF" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, pageStyles.scrollBottom]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007BFF" />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="calendar" size={sf(28)} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No reservations</Text>
              <Text style={styles.emptyText}>Book an amenity to see it here.</Text>
            </View>
          ) : (
            filtered.map((reservation) => {
              const isPast = reservation.timeframe === "past";
              const meta = STATUS_META[reservation.status] ?? STATUS_META.pending;
              const amenityName = reservation.amenity?.name ?? reservation.amenity_name ?? "Amenity";
              const dateLabel = formatDateTime(reservation.date ?? reservation.starts_at, null);
              const canCancel =
                reservation.timeframe === "upcoming" &&
                (reservation.status === "pending" || reservation.status === "confirmed");
              const cancelLabel =
                reservation.status === "pending" ? "Cancel Request" : "Cancel Reservation";

              return (
                <View key={reservation.id} style={[styles.card, isPast && styles.cardPast]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {amenityName}
                      </Text>
                      {reservation.status === "pending" ? (
                        <Text style={styles.pendingNote}>Awaiting owner approval</Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Feather name={meta.icon} size={sf(11)} color={meta.color} />
                      <Text style={[styles.statusText, { color: meta.color }]}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.details}>
                    <View style={styles.detailRow}>
                      <View style={styles.detailIcon}>
                        <Feather name="calendar" size={sf(14)} color="#0052DF" />
                      </View>
                      <Text style={styles.detailText}>{dateLabel || "Date TBD"}</Text>
                    </View>
                    {reservation.time_slot ? (
                      <View style={styles.detailRow}>
                        <View style={styles.detailIcon}>
                          <Feather name="clock" size={sf(14)} color="#0052DF" />
                        </View>
                        <Text style={styles.detailText}>{reservation.time_slot}</Text>
                      </View>
                    ) : null}
                  </View>

                  {canCancel ? (
                    <Pressable
                      style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                      onPress={() => handleCancel(reservation)}
                      accessibilityRole="button"
                      accessibilityLabel={cancelLabel}
                    >
                      <View style={styles.cancelInner}>
                        <Feather name="x" size={sf(15)} color="#DC2626" />
                        <Text style={styles.cancelText}>{cancelLabel}</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}

          <View style={styles.reminder}>
            <View style={styles.reminderIcon}>
              <Feather name="bell" size={sf(18)} color="#047857" />
            </View>
            <View style={styles.reminderBody}>
              <Text style={styles.reminderTitle}>Automatic Reminders</Text>
              <Text style={styles.reminderText}>
                You'll receive push notifications 1 hour before each reservation
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E7EB", backgroundColor: "#FFFFFF" },
  tabBar: { paddingHorizontal: Property.gutter, paddingVertical: sw(12), gap: sw(8) },
  tab: {
    backgroundColor: "#F1F5F9",
    paddingVertical: sw(8),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
  },
  tabActive: { backgroundColor: "#0052DF" },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.bodyMd,
    lineHeight: PropertyType.bodyMdLine,
    color: "#4A5565",
    fontWeight: "500",
  },
  tabTextActive: { fontFamily: Fonts.bold, color: "#FFFFFF", fontWeight: "700" },
  content: { paddingHorizontal: Property.gutter, paddingTop: sw(16), gap: sw(12) },
  empty: { paddingVertical: sw(40), alignItems: "center", gap: sw(8) },
  emptyIcon: {
    width: sw(64),
    height: sw(64),
    borderRadius: sw(20),
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.bodyMd,
    color: "#101828",
    fontWeight: "700",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: PropertyType.bodyMd,
    color: "#6A7282",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(16),
    padding: sw(16),
    gap: sw(12),
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  cardPast: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(10),
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: sw(4),
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: "#0F172A",
    fontWeight: "700",
  },
  pendingNote: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
    color: "#B45309",
    fontWeight: "500",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingVertical: sw(5),
    paddingHorizontal: sw(9),
    borderRadius: 999,
    flexShrink: 0,
  },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
  },
  details: {
    gap: sw(8),
    paddingTop: sw(2),
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  detailIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  detailText: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#334155",
    fontWeight: "500",
  },
  cancelBtn: {
    marginTop: sw(2),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: sw(12),
    minHeight: sw(44),
    paddingHorizontal: sw(14),
    justifyContent: "center",
    alignItems: "center",
  },
  cancelInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: "#DC2626",
    fontWeight: "600",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  pressed: { opacity: 0.88 },
  reminder: {
    marginTop: sw(4),
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: sw(16),
    backgroundColor: "#F0FDF4",
    padding: sw(14),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  reminderIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(12),
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reminderBody: { flex: 1, minWidth: 0, gap: sw(2) },
  reminderTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#14532D",
    fontWeight: "700",
  },
  reminderText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#15803D",
  },
});
