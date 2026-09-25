import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import AmenityPaymentProofModal from "../../../../components/property/amenity-payment-proof-modal";
import AmenityIcon from "../../../../components/property/amenity-icon";
import { propertyStyles } from "../../../../constants/property-styles";
import { PropertyHubTheme } from "../../../../constants/property-management-theme";
import { Fonts } from "../../../../constants/font";
import { Layout } from "../../../../constants/tokens";
import {
  approveAmenityOwnerPayment,
  approveBooking,
  fetchAmenities,
  fetchAmenityOwnerBills,
  fetchBookingInbox,
  fetchMyAmenityBills,
  rejectAmenityOwnerPayment,
  rejectBooking,
} from "../../../../services/amenity-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { sf, sw } from "../../../../utils/responsive";
import { rnShadow } from "../../../../utils/shadow";
import { formatBookingDisplayFee, formatUsdAmount } from "../../../../utils/amenity-display";
import { localizedField } from "../../../../i18n";

const MINE_TAB = "mine";

function formatDueDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function statusMeta(bill, t) {
  const key = String(bill.status ?? "").toLowerCase();
  if (key === "overdue") {
    return { label: bill.status_label || t("services.unitBillsStatusOverdue"), tone: "danger" };
  }
  if (key === "rejected") {
    return { label: bill.status_label || t("services.unitBillsStatusRejected"), tone: "danger" };
  }
  if (key === "paid") {
    return { label: bill.status_label || t("services.unitBillsStatusPaid"), tone: "success" };
  }
  if (key === "pending_verification") {
    return { label: bill.status_label || t("services.unitBillsStatusPending"), tone: "pending" };
  }
  return { label: bill.status_label || t("services.unitBillsStatusUnpaid"), tone: "pending" };
}

function bookingStatusMeta(booking, t) {
  const key = String(booking.status ?? "").toLowerCase();
  if (key === "confirmed") {
    return { label: t("propertyMgmt.statusConfirmed"), tone: "success" };
  }
  if (key === "rejected" || key === "cancelled") {
    return {
      label: key === "cancelled" ? t("propertyMgmt.statusCancelled") : t("propertyMgmt.statusDeclined"),
      tone: "danger",
    };
  }
  return { label: t("propertyMgmt.statusPending"), tone: "pending" };
}

function canPay(bill) {
  const status = String(bill.status ?? "").toLowerCase();
  return ["unpaid", "rejected", "overdue"].includes(status);
}

function BillCard({ bill, busy, onPay, t }) {
  const status = statusMeta(bill, t);
  const due = formatDueDate(bill.due_date);
  const amount = bill.amount ?? bill.resident_amount ?? bill.amount_per_resident;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>
          <AmenityIcon iconKey={bill.amenity_icon_key} name={bill.amenity_name} size={sf(18)} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.billTitle} numberOfLines={2}>
            {bill.title || bill.amenity_name || t("services.myAmenityBillsTitle")}
          </Text>
          <Text style={styles.billMeta} numberOfLines={1}>
            {bill.amenity_name}
            {bill.billing_month_label ? ` · ${bill.billing_month_label}` : ""}
          </Text>
        </View>
        <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
          <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatUsdAmount(amount)}</Text>
        </View>
        {due ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t("services.unitBillsDue", { date: due })}</Text>
          </View>
        ) : null}
      </View>

      {bill.rejection_reason ? (
        <Text style={styles.rejectReason}>{bill.rejection_reason}</Text>
      ) : null}

      {canPay(bill) ? (
        <Pressable
          disabled={busy}
          onPress={onPay}
          style={[styles.primaryBtn, busy ? styles.disabled : null]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>{t("services.myAmenityBillsPay")}</Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.infoRow}>
          <Feather name="info" size={sf(14)} color={PropertyHubTheme.muted} />
          <Text style={styles.infoText}>
            {status.tone === "success"
              ? t("services.myAmenityBillsPaidHint")
              : t("services.myAmenityBillsPendingHint")}
          </Text>
        </View>
      )}
    </View>
  );
}

function ReceivedPaymentCard({ booking, bill, busy, onApprove, onReject, onApprovePayment, onRejectPayment, t }) {
  const status = booking ? bookingStatusMeta(booking, t) : statusMeta(bill || {}, t);
  const amenityName = localizedField(booking || bill || {}, "amenity_name") || booking?.amenity_name || bill?.amenity_name;
  const dateLabel = formatDueDate(booking?.date || bill?.due_date);
  const proof = bill?.payment_proof || booking?.payment_proof;
  const canReviewBooking = booking?.status === "pending";
  const canReviewPayment = bill?.can_review === true || String(bill?.status ?? "").toLowerCase() === "pending_verification";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>
          <AmenityIcon iconKey={booking?.amenity_icon_key || bill?.amenity_icon_key} name={amenityName} size={sf(18)} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.billTitle} numberOfLines={1}>
            {booking?.user_name || bill?.resident_name || t("admin.resident")}
          </Text>
          <Text style={styles.billMeta} numberOfLines={1}>
            {amenityName}
            {booking?.user_unit || bill?.unit_number
              ? ` · ${t("admin.unitLabel", { unit: booking?.user_unit || bill?.unit_number })}`
              : ""}
          </Text>
        </View>
        <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
          <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {booking ? formatBookingDisplayFee(booking) : formatUsdAmount(bill?.amount)}
          </Text>
        </View>
        {dateLabel ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{dateLabel}</Text>
          </View>
        ) : null}
        {booking?.time_slot ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{booking.time_slot}</Text>
          </View>
        ) : null}
      </View>

      {proof ? (
        <View style={styles.proofBox}>
          <Text style={styles.proofLine}>
            {t("propertyMgmt.paymentDate")}: {proof.payment_date || "—"}
          </Text>
          <Text style={styles.proofLine}>
            {t("propertyMgmt.paymentReference")}: {proof.payment_reference || "—"}
          </Text>
          {proof.file_url ? (
            <Pressable onPress={() => Linking.openURL(proof.file_url)}>
              <Text style={styles.proofLink}>{t("propertyMgmt.viewPaymentProof")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.infoText}>{t("services.myAmenityBillsNoProof")}</Text>
      )}

      {canReviewBooking ? (
        <View style={styles.reviewRow}>
          <Pressable
            disabled={busy}
            onPress={onReject}
            style={[styles.secondaryBtn, busy ? styles.disabled : null]}
          >
            <Text style={styles.secondaryText}>{t("admin.reject")}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={onApprove}
            style={[styles.primaryBtn, styles.reviewPrimary, busy ? styles.disabled : null]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>{t("admin.approve")}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {canReviewPayment ? (
        <View style={styles.reviewRow}>
          <Pressable
            disabled={busy}
            onPress={onRejectPayment}
            style={[styles.secondaryBtn, busy ? styles.disabled : null]}
          >
            <Text style={styles.secondaryText}>{t("admin.reject")}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={onApprovePayment}
            style={[styles.primaryBtn, styles.reviewPrimary, busy ? styles.disabled : null]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>{t("admin.approve")}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function MyAmenityBillsScreen() {
  const { t } = useTranslation();
  const { runAction, dialog, showFailure } = useApiAction();
  const [tab, setTab] = useState(MINE_TAB);
  const [bills, setBills] = useState([]);
  const [ownerBills, setOwnerBills] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [proofFor, setProofFor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [nextBills, nextOwnerBills, nextAmenities, nextInbox] = await Promise.all([
        fetchMyAmenityBills().catch(() => []),
        fetchAmenityOwnerBills().catch(() => []),
        fetchAmenities().catch(() => []),
        fetchBookingInbox().catch(() => []),
      ]);
      setBills(Array.isArray(nextBills) ? nextBills : []);
      setOwnerBills(Array.isArray(nextOwnerBills) ? nextOwnerBills : []);
      setAmenities(Array.isArray(nextAmenities) ? nextAmenities : []);
      setInbox(Array.isArray(nextInbox) ? nextInbox : []);
    } catch (error) {
      await showFailure(t("services.myAmenityBillsTitle"), error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const myAmenities = useMemo(() => {
    const fromList = amenities.filter((item) => item.is_mine);
    const byId = new Map(fromList.map((item) => [Number(item.id), item]));
    for (const booking of inbox) {
      const id = Number(booking.amenity_id);
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: booking.amenity_name,
        name_es: booking.amenity_name_es,
        name_ar: booking.amenity_name_ar,
        icon_key: booking.amenity_icon_key,
        is_mine: true,
      });
    }
    return [...byId.values()];
  }, [amenities, inbox]);

  const tabs = useMemo(() => [
    { id: MINE_TAB, label: t("services.myAmenityBillsTabMine") },
    ...myAmenities.map((amenity) => ({
      id: `amenity-${amenity.id}`,
      amenityId: Number(amenity.id),
      label: localizedField(amenity, "name") || amenity.name,
    })),
  ], [myAmenities, t]);

  const selectedAmenityId = tab.startsWith("amenity-") ? Number(tab.replace("amenity-", "")) : null;
  const receivedPayments = useMemo(() => {
    if (!selectedAmenityId) return [];
    const amenityBookings = inbox.filter((booking) => Number(booking.amenity_id) === selectedAmenityId);
    const amenityBills = ownerBills.filter((bill) => Number(bill.amenity_id) === selectedAmenityId);
    const usedBillIds = new Set();
    const items = amenityBookings.map((booking) => {
      const bill = amenityBills.find((row) => Number(row.booking_id) === Number(booking.id));
      if (bill?.resident_bill_id) usedBillIds.add(Number(bill.resident_bill_id));
      return { key: `booking-${booking.id}`, booking, bill };
    });
    for (const bill of amenityBills) {
      if (usedBillIds.has(Number(bill.resident_bill_id))) continue;
      items.push({ key: `bill-${bill.resident_bill_id}`, booking: null, bill });
    }
    return items;
  }, [inbox, ownerBills, selectedAmenityId]);

  async function handleSubmitted() {
    setProofFor(null);
    await load({ silent: true });
  }

  async function handleApprove(booking) {
    setBusyId(booking.id);
    try {
      await runAction({
        action: () => approveBooking(booking.id),
        successTitle: t("admin.bookingApproved"),
        successMessage: t("admin.reservationConfirmed", { name: booking.user_name }),
        errorTitle: t("admin.couldNotApprove"),
        onSuccess: () => load({ silent: true }),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(booking) {
    setBusyId(booking.id);
    try {
      await runAction({
        action: () => rejectBooking(booking.id),
        successTitle: t("admin.reservationDeclined"),
        successMessage: t("admin.residentNotified"),
        errorTitle: t("admin.couldNotDecline"),
        onSuccess: () => load({ silent: true }),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprovePayment(bill) {
    setBusyId(bill.resident_bill_id);
    try {
      await runAction({
        action: () => approveAmenityOwnerPayment(bill.amenity_id, bill.resident_bill_id),
        successTitle: t("services.amenityBillsApprovedTitle"),
        successMessage: t("services.amenityBillsApprovedMsg"),
        errorTitle: t("services.amenityBillsCouldNotReview"),
        onSuccess: () => load({ silent: true }),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectPayment(bill) {
    const choice = await dialog.showConfirm(
      t("services.amenityBillsRejectTitle"),
      t("services.amenityBillsRejectMsg"),
      { confirmLabel: t("services.amenityBillsReject"), destructive: true },
    );
    if (choice !== "confirm") return;
    setBusyId(bill.resident_bill_id);
    try {
      await runAction({
        action: () => rejectAmenityOwnerPayment(bill.amenity_id, bill.resident_bill_id, "unclear_proof"),
        successTitle: t("services.amenityBillsRejectedTitle"),
        successMessage: t("services.amenityBillsRejectedMsg"),
        errorTitle: t("services.amenityBillsCouldNotReview"),
        onSuccess: () => load({ silent: true }),
      });
    } finally {
      setBusyId(null);
    }
  }

  const showingMine = tab === MINE_TAB;

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.myAmenityBillsTitle")}
        subtitle={showingMine ? t("services.myAmenityBillsSub") : t("services.myAmenityBillsReceivedSub")}
      />

      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
          keyboardShouldPersistTaps="handled"
        >
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                  includeFontPadding={false}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true });
            }}
            tintColor={PropertyHubTheme.teal}
          />
        }
      >
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={PropertyHubTheme.teal} />
          </View>
        ) : showingMine ? (
          bills.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="file-text" size={sf(28)} color={PropertyHubTheme.muted} />
              <Text style={styles.emptyTitle}>{t("services.myAmenityBillsEmptyTitle")}</Text>
              <Text style={styles.emptyBody}>{t("services.myAmenityBillsEmptyBody")}</Text>
            </View>
          ) : (
            bills.map((bill) => (
              <BillCard
                key={bill.resident_bill_id || bill.id}
                bill={bill}
                busy={false}
                onPay={() => setProofFor(bill)}
                t={t}
              />
            ))
          )
        ) : receivedPayments.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="credit-card" size={sf(28)} color={PropertyHubTheme.muted} />
            <Text style={styles.emptyTitle}>{t("services.myAmenityBillsReceivedEmptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("services.myAmenityBillsReceivedEmptyBody")}</Text>
          </View>
        ) : (
          receivedPayments.map((item) => (
            <ReceivedPaymentCard
              key={item.key}
              booking={item.booking}
              bill={item.bill}
              busy={busyId === item.booking?.id || busyId === item.bill?.resident_bill_id}
              onApprove={() => item.booking && void handleApprove(item.booking)}
              onReject={() => item.booking && void handleReject(item.booking)}
              onApprovePayment={() => item.bill && void handleApprovePayment(item.bill)}
              onRejectPayment={() => item.bill && void handleRejectPayment(item.bill)}
              t={t}
            />
          ))
        )}
      </ScrollView>

      {proofFor ? (
        <AmenityPaymentProofModal
          visible
          bill={proofFor}
          amenityId={proofFor.amenity_id}
          amenityName={proofFor.amenity_name}
          onClose={() => setProofFor(null)}
          onSubmitted={() => void handleSubmitted()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: "#F9FAFB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingEnd: Layout.screenPadding + sw(12),
    paddingVertical: sw(12),
    gap: sw(8),
  },
  tab: {
    backgroundColor: "#FFFFFF",
    height: sw(36),
    paddingHorizontal: sw(16),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
  },
  tabTextActive: { fontFamily: Fonts.bold, color: "#FFFFFF" },
  content: { padding: sw(16), paddingBottom: sw(40), gap: sw(12) },
  loader: { paddingVertical: sw(40), alignItems: "center" },
  empty: {
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(40),
    paddingHorizontal: sw(20),
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: PropertyHubTheme.text,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: PropertyHubTheme.muted,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(14),
    gap: sw(12),
    ...rnShadow({ offsetY: 2, blur: 8, opacity: 0.05 }),
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  iconWell: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  billTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: PropertyHubTheme.text,
  },
  billMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.muted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  status_pending: { backgroundColor: "#FEF3C7" },
  status_success: { backgroundColor: "#ECFDF5" },
  status_danger: { backgroundColor: "#FEF2F2" },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  statusText_pending: { color: "#B45309" },
  statusText_success: { color: "#047857" },
  statusText_danger: { color: "#B91C1C" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  chip: {
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  chipText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#1B4F8A" },
  rejectReason: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  primaryBtn: {
    backgroundColor: PropertyHubTheme.deepTeal,
    borderRadius: sw(12),
    minHeight: sw(44),
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPrimary: { flex: 1 },
  primaryText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },
  secondaryBtn: {
    flex: 1,
    borderRadius: sw(12),
    minHeight: sw(44),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  secondaryText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#B91C1C" },
  reviewRow: { flexDirection: "row", gap: sw(8) },
  disabled: { opacity: 0.6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  infoText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: PropertyHubTheme.muted },
  proofBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    padding: sw(10),
    gap: sw(4),
  },
  proofLine: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.text,
  },
  proofLink: {
    marginTop: sw(4),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#1B4F8A",
  },
});
