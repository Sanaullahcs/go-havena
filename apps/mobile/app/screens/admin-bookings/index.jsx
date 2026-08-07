import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import AmenityIcon from "../../../components/property/amenity-icon";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { sw, sf } from "../../../utils/responsive";
import { pageStyles } from "../../../constants/page-styles";
import {
  fetchBookingInbox,
  approveBooking,
  rejectBooking,
} from "../../../services/amenity-api";
import { getAmenityVisual, formatLongDate } from "../../../utils/amenity-display";
import { useApiAction } from "../../../hooks/use-api-action";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { localizedField } from "../../../i18n";

const TABS = [
  { id: "pending", labelKey: "admin.pending" },
  { id: "confirmed", labelKey: "admin.approved" },
  { id: "all", labelKey: "admin.all" },
];

const STATUS_META = {
  pending: { label: "admin.pending", color: "#B45309", bg: "#FEF3C7" },
  confirmed: { label: "admin.approved", color: "#047857", bg: "#ECFDF5" },
  rejected: { label: "admin.declined", color: "#B91C1C", bg: "#FEF2F2" },
  cancelled: { label: "admin.cancelled", color: "#64748B", bg: "#F1F5F9" },
};

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function BookingInfoSheet({ booking, onClose, t }) {
  if (!booking) return null;
  const amenityName = localizedField(booking, "amenity_name");
  const visual = getAmenityVisual(booking.amenity_name, booking.amenity_icon_key);
  const status = STATUS_META[booking.status] ?? STATUS_META.pending;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("admin.bookingDetails")}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Feather name="x" size={sf(20)} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={[styles.statusPill, { backgroundColor: status.bg, alignSelf: "flex-start" }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{t(status.label)}</Text>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>{t("admin.amenity")}</Text>
            <View style={styles.infoRow}>
              <View style={[styles.detailIcon, { backgroundColor: visual.soft }]}>
                <AmenityIcon
                  iconKey={booking.amenity_icon_key}
                  name={amenityName}
                  size={sf(16)}
                  color={visual.tint}
                />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>{amenityName}</Text>
                {booking.amenity_description ? (
                  <Text style={styles.infoText}>{booking.amenity_description}</Text>
                ) : null}
                {booking.amenity_hours ? (
                  <Text style={styles.infoMeta}>{booking.amenity_hours}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>{t("admin.member")}</Text>
            <View style={styles.infoRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(booking.user_name).toUpperCase()}</Text>
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>{booking.user_name || t("admin.resident")}</Text>
                <Text style={styles.infoMeta}>
                  {booking.user_unit ? t("admin.unitLabel", { unit: booking.user_unit }) : t("admin.noUnitOnFile")}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Feather name="calendar" size={sf(14)} color={Colors.brandPrimaryDeep} />
              <Text style={styles.detailText}>{formatLongDate(booking.date)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Feather name="clock" size={sf(14)} color={Colors.brandPrimaryDeep} />
              <Text style={styles.detailText}>{booking.time_slot || t("admin.openAccessRequest")}</Text>
            </View>
            <View style={styles.detailRow}>
              <Feather name="users" size={sf(14)} color={Colors.brandPrimaryDeep} />
              <Text style={styles.detailText}>
                {t("admin.guestCount", { count: booking.guests })}
              </Text>
            </View>
            {booking.notes ? <Text style={styles.notesText}>{booking.notes}</Text> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AdminBookings() {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState("pending");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [menuBooking, setMenuBooking] = useState(null);
  const [viewing, setViewing] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchBookingInbox();
      setBookings(data ?? []);
    } catch (err) {
      await showFailure(t("admin.couldNotLoadBookings"), err);
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending").length,
    [bookings],
  );

  const filtered = useMemo(() => {
    if (selectedTab === "all") return bookings;
    return bookings.filter((b) => b.status === selectedTab);
  }, [bookings, selectedTab]);

  const handleApprove = async (booking) => {
    setMenuBooking(null);
    setBusyId(booking.id);
    try {
      await runAction({
        action: () => approveBooking(booking.id),
        successTitle: t("admin.bookingApproved"),
        successMessage: t("admin.reservationConfirmed", { name: booking.user_name }),
        errorTitle: t("admin.couldNotApprove"),
        onSuccess: () => load(true),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (booking) => {
    setMenuBooking(null);
    const confirmed = await showConfirm(
      t("admin.declineReservation"),
      t("admin.declineMessage", { name: booking.user_name, amenity: booking.amenity_name }),
      { confirmLabel: t("admin.decline"), cancelLabel: t("admin.keep"), destructive: true },
    );
    if (confirmed !== "confirm") return;

    setBusyId(booking.id);
    try {
      await runAction({
        action: () => rejectBooking(booking.id),
        successTitle: t("admin.reservationDeclined"),
        successMessage: t("admin.residentNotified"),
        errorTitle: t("admin.couldNotDecline"),
        onSuccess: () => load(true),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("admin.bookingRequests")}
        subtitle={t("admin.bookingSubtitle", { count: pendingCount })}
      />

      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
          style={styles.tabScroll}
          keyboardShouldPersistTaps="handled"
        >
          {TABS.map((tab) => {
            const active = selectedTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setSelectedTab(tab.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                  includeFontPadding={false}
                >
                  {t(tab.labelKey)}
                  {tab.id === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brandPrimary} style={{ marginTop: sw(40) }} />
      ) : (
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, pageStyles.scrollBottom]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimary} />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="calendar" size={sf(38)} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{t("admin.noRequests")}</Text>
              <Text style={styles.emptyText}>
                {selectedTab === "pending"
                  ? t("admin.noPendingReservations")
                  : t("admin.nothingToShow")}
              </Text>
            </View>
          ) : (
            filtered.map((booking) => {
              const bookingAmenityName = localizedField(booking, "amenity_name");
              const visual = getAmenityVisual(
                booking.amenity_name,
                booking.amenity_icon_key,
              );
              const status = STATUS_META[booking.status] ?? STATUS_META.pending;
              const isPending = booking.status === "pending";
              return (
                <View key={booking.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {initials(booking.user_name).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {booking.user_name}
                      </Text>
                      <Text style={styles.userUnit} numberOfLines={1}>
                        {booking.user_unit ? t("admin.unitLabel", { unit: booking.user_unit }) : t("admin.resident")}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>
                        {t(status.label)}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.menuBtn}
                      disabled={busyId === booking.id}
                      onPress={() => setMenuBooking(booking)}
                    >
                      <Feather name="more-vertical" size={sf(18)} color="#64748B" />
                    </Pressable>
                  </View>

                  <View style={styles.detailBox}>
                    <View style={styles.detailRow}>
                      <View style={[styles.detailIcon, { backgroundColor: visual.soft }]}>
                        <AmenityIcon
                          iconKey={booking.amenity_icon_key}
                          name={bookingAmenityName}
                          size={sf(16)}
                          color={visual.tint}
                        />
                      </View>
                      <Text style={styles.detailText}>{bookingAmenityName}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Feather name="calendar" size={sf(14)} color={Colors.brandPrimaryDeep} />
                      <Text style={styles.detailText}>{formatLongDate(booking.date)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Feather name="clock" size={sf(14)} color={Colors.brandPrimaryDeep} />
                      <Text style={styles.detailText}>{booking.time_slot}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(menuBooking)}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuBooking(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuBooking(null)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>{t("admin.actions")}</Text>
            <Pressable
              style={styles.actionSheetItem}
              onPress={() => {
                setViewing(menuBooking);
                setMenuBooking(null);
              }}
            >
              <Feather name="info" size={sf(16)} color={Colors.brandPrimaryDeep} />
              <Text style={styles.actionSheetText}>{t("admin.viewInfo")}</Text>
            </Pressable>
            {menuBooking?.status === "pending" ? (
              <>
                <Pressable
                  style={styles.actionSheetItem}
                  onPress={() => handleApprove(menuBooking)}
                >
                  <Feather name="check" size={sf(16)} color="#047857" />
                  <Text style={[styles.actionSheetText, { color: "#047857" }]}>{t("admin.approve")}</Text>
                </Pressable>
                <Pressable
                  style={styles.actionSheetItem}
                  onPress={() => handleReject(menuBooking)}
                >
                  <Feather name="x" size={sf(16)} color="#E11D48" />
                  <Text style={[styles.actionSheetText, { color: "#E11D48" }]}>{t("admin.reject")}</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.actionSheetCancel} onPress={() => setMenuBooking(null)}>
              <Text style={styles.actionSheetCancelText}>{t("admin.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <BookingInfoSheet booking={viewing} onClose={() => setViewing(null)} t={t} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  toolbar: {
    zIndex: 4,
    elevation: 4,
    backgroundColor: "#F7F8FC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  tabScroll: { flexGrow: 0 },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingEnd: Layout.screenPadding + sw(12),
    paddingVertical: sw(12),
    gap: sw(8),
    minHeight: sw(52),
  },
  tab: {
    backgroundColor: Colors.surface,
    height: sw(36),
    paddingHorizontal: sw(16),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tabActive: { backgroundColor: Colors.brandPrimaryDeep, borderColor: Colors.brandPrimaryDeep },
  tabText: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(13),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
  tabTextActive: { fontFamily: Fonts.bold, fontWeight: "700", color: "#FFFFFF" },
  list: { flex: 1, zIndex: 0, elevation: 0 },
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: sw(12), gap: sw(12) },
  empty: { alignItems: "center", paddingVertical: sw(48), gap: sw(8) },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: Colors.textPrimary,
    marginTop: sw(4),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: sw(14),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  avatar: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(13),
    color: Colors.brandPrimaryDeep,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  userName: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  userUnit: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  statusPill: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
    flexShrink: 0,
  },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(10),
  },
  menuBtn: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  detailBox: {
    marginTop: sw(12),
    gap: sw(10),
    backgroundColor: "#FBFCFE",
    borderRadius: sw(12),
    padding: sw(12),
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  detailIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
  },
  detailText: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textBody,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingHorizontal: sw(16),
    paddingTop: sw(16),
    paddingBottom: sw(24),
    gap: sw(4),
  },
  actionSheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: Colors.textPrimary,
    marginBottom: sw(8),
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  actionSheetText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  actionSheetCancel: {
    marginTop: sw(8),
    alignItems: "center",
    paddingVertical: sw(12),
  },
  actionSheetCancelText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: Colors.textMuted,
  },
  sheet: {
    marginTop: "auto",
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    padding: sw(16),
    gap: sw(12),
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  infoSection: { gap: sw(8) },
  infoLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  infoText: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
  },
  infoMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  notesText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textSecondary,
    backgroundColor: "#F8FAFC",
    borderRadius: sw(8),
    padding: sw(10),
  },
});
