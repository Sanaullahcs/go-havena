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
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import AmenityPaymentProofModal from "../../../../components/property/amenity-payment-proof-modal";
import AmenityIcon from "../../../../components/property/amenity-icon";
import KuickpayPaySheet from "../../../../components/payments/kuickpay-pay-sheet";
import { PAYABLE } from "../../../../services/payments-api";
import { PAYMENT_RESULT_ROUTE } from "../../../../hooks/use-kuickpay-pay";
import { propertyStyles } from "../../../../constants/property-styles";
import { PropertyHubTheme } from "../../../../constants/property-management-theme";
import { Fonts } from "../../../../constants/font";
import { Layout } from "../../../../constants/tokens";
import {
  approveAmenityOwnerPayment,
  approveBooking,
  fetchAmenityOwnerBills,
  fetchBookingInbox,
  fetchMyAmenityBills,
  rejectAmenityOwnerPayment,
  rejectBooking,
} from "../../../../services/amenity-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { sf, sw } from "../../../../utils/responsive";
import { formatBookingDisplayFee } from "../../../../utils/amenity-display";
import { formatCommunityMoney } from "../../../../utils/money";
import { localizedField } from "../../../../i18n";
import BillDetailSheet from "../../../../components/payments/bill-detail-sheet";
import {
  BillCard,
  BillCardFrame,
  BillPayListLayout,
  BillReceiptButton,
  defaultBillFilter,
  filterBills,
} from "../../../../components/payments/bill-list-parts";
import { billListFields, buildBillDocument, canPayBill, sortBills, summarizeBills } from "../../../../utils/bill-document";
import { useSessionUser } from "../../../../hooks/use-session-user";

const PAY_TAB = "pay";
const RECEIVE_TAB = "receive";

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

function payActionLabel(bill, t) {
  if (bill.online_payment?.available) return t("bills.list.payNow");
  return String(bill.status ?? "").toLowerCase() === "rejected" ? t("bills.list.resubmitProof") : t("bills.list.uploadProof");
}

function ReceivedPaymentCard({ booking, bill, busy, onApprove, onReject, onApprovePayment, onRejectPayment, onViewReceipt, t }) {
  const status = booking ? bookingStatusMeta(booking, t) : statusMeta(bill || {}, t);
  const amenityName = localizedField(booking || bill || {}, "amenity_name") || booking?.amenity_name || bill?.amenity_name;
  const dateLabel = formatDueDate(booking?.date || bill?.due_date);
  const proof = bill?.payment_proof || booking?.payment_proof;
  const receiptUrl = proof?.file_url || null;
  const paid = String(bill?.status ?? "").toLowerCase() === "paid";
  const canViewReceipt = Boolean(receiptUrl || (paid && bill));
  const canReviewBooking = booking?.status === "pending";
  const canReviewPayment = bill?.can_review === true || String(bill?.status ?? "").toLowerCase() === "pending_verification";

  return (
    <BillCardFrame>
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

      <Text style={styles.amount}>
        {booking ? formatBookingDisplayFee(booking) : formatCommunityMoney(bill?.amount)}
      </Text>
      <View style={styles.chips}>
        {dateLabel ? (
          <View style={styles.chip}>
            <Feather name="calendar" size={sf(12)} color={PropertyHubTheme.textMuted} />
            <Text style={styles.chipText}>{dateLabel}</Text>
          </View>
        ) : null}
        {booking?.time_slot ? (
          <View style={styles.chip}>
            <Feather name="clock" size={sf(12)} color={PropertyHubTheme.textMuted} />
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
        </View>
      ) : (
        <Text style={styles.infoText}>{t("services.myAmenityBillsNoProof")}</Text>
      )}

      {(canViewReceipt || canReviewBooking || canReviewPayment) ? (
        <View style={styles.cardActions}>
          {canViewReceipt ? (
            <BillReceiptButton
              label={t("bills.list.viewReceipt")}
              onPress={() => {
                if (receiptUrl) Linking.openURL(receiptUrl).catch(() => {});
                else if (bill) onViewReceipt?.(bill);
              }}
            />
          ) : null}

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
      ) : null}
    </BillCardFrame>
  );
}

export default function MyAmenityBillsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { runAction, dialog, showFailure } = useApiAction();
  const [payFor, setPayFor] = useState(null);
  const [tab, setTab] = useState(PAY_TAB);
  const [bills, setBills] = useState([]);
  const [ownerBills, setOwnerBills] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [proofFor, setProofFor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const sessionUser = useSessionUser();

  const myBills = useMemo(() => sortBills(bills, t), [bills, t]);
  const summary = useMemo(() => summarizeBills(myBills, t), [myBills, t]);
  const activeFilter = filter ?? defaultBillFilter(summary);
  const visibleBills = useMemo(() => filterBills(myBills, activeFilter, t), [myBills, activeFilter, t]);
  const detailDoc = useMemo(
    () => (detailFor ? buildBillDocument(detailFor, { kind: "amenity", user: sessionUser, communityId: detailFor.community_id, t }) : null),
    [detailFor, sessionUser, t],
  );

  function startPayment(bill) {
    setDetailFor(null);
    if (bill.online_payment?.available) setPayFor(bill);
    else setProofFor(bill);
  }

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [nextBills, nextOwnerBills, nextInbox] = await Promise.all([
        fetchMyAmenityBills().catch(() => []),
        fetchAmenityOwnerBills().catch(() => []),
        fetchBookingInbox().catch(() => []),
      ]);
      setBills(Array.isArray(nextBills) ? nextBills : []);
      setOwnerBills(Array.isArray(nextOwnerBills) ? nextOwnerBills : []);
      setInbox(Array.isArray(nextInbox) ? nextInbox : []);
    } catch (error) {
      await showFailure(t("services.myAmenityBillsTitle"), error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const tabs = useMemo(() => [
    { id: PAY_TAB, label: t("services.myAmenityBillsTabPay") },
    { id: RECEIVE_TAB, label: t("services.myAmenityBillsTabReceive") },
  ], [t]);

  const receivedPayments = useMemo(() => {
    const usedBillIds = new Set();
    const items = inbox.map((booking) => {
      const bill = ownerBills.find((row) => Number(row.booking_id) === Number(booking.id));
      if (bill?.resident_bill_id) usedBillIds.add(Number(bill.resident_bill_id));
      return { key: `booking-${booking.id}`, booking, bill };
    });
    for (const bill of ownerBills) {
      if (usedBillIds.has(Number(bill.resident_bill_id))) continue;
      items.push({ key: `bill-${bill.resident_bill_id}`, booking: null, bill });
    }
    return items;
  }, [inbox, ownerBills]);

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

  const showingPay = tab === PAY_TAB;

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.myAmenityBillsTitle")}
        subtitle={showingPay ? t("services.myAmenityBillsSub") : t("services.myAmenityBillsReceivedSub")}
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

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={PropertyHubTheme.teal} />
        </View>
      ) : showingPay && myBills.length > 0 ? (
        <BillPayListLayout
          summary={summary}
          activeFilter={activeFilter}
          onFilterChange={setFilter}
          t={t}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load({ silent: true });
          }}
          data={visibleBills}
          keyExtractor={(bill) => String(bill.resident_bill_id || bill.id)}
          renderItem={({ item: bill }) => {
            const fields = billListFields(bill, "amenity");
            return (
              <BillCard
                bill={bill}
                t={t}
                icon={<AmenityIcon iconKey={bill.amenity_icon_key} name={bill.amenity_name} size={sf(18)} />}
                title={fields.title || t("services.myAmenityBillsTitle")}
                subtitle={fields.subtitle}
                payLabel={payActionLabel(bill, t)}
                onPay={() => startPayment(bill)}
                onPress={() => {
                  const active = bill.online_payment?.active_payment;
                  if (active?.status === "processing") {
                    router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id: active.id } });
                    return;
                  }
                  setDetailFor(bill);
                }}
              />
            );
          }}
        />
      ) : (
        <ScrollView
          style={styles.scrollFlex}
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
          {showingPay ? (
            <View style={styles.empty}>
              <Feather name="file-text" size={sf(28)} color={PropertyHubTheme.muted} />
              <Text style={styles.emptyTitle}>{t("services.myAmenityBillsEmptyTitle")}</Text>
              <Text style={styles.emptyBody}>{t("services.myAmenityBillsEmptyBody")}</Text>
            </View>
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
                onViewReceipt={(bill) => setDetailFor(bill)}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}

      <BillDetailSheet
        visible={Boolean(detailFor)}
        doc={detailDoc}
        primaryLabel={detailFor && canPayBill(detailFor) ? payActionLabel(detailFor, t) : null}
        onPrimary={() => detailFor && startPayment(detailFor)}
        onClose={() => setDetailFor(null)}
      />
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
      {payFor ? (
        <KuickpayPaySheet
          visible
          payableType={PAYABLE.AMENITY_BILL}
          payableId={payFor.resident_bill_id}
          bill={{
            title: payFor.title || payFor.amenity_name,
            subtitle: [payFor.amenity_name, payFor.billing_month_label].filter(Boolean).join(" · "),
            amount: payFor.amount ?? payFor.resident_amount ?? payFor.amount_per_resident,
            dueDate: payFor.due_date,
            isPastDue: String(payFor.status) === "overdue",
            onlinePayment: payFor.online_payment,
          }}
          onClose={() => setPayFor(null)}
          onSettled={() => load({ silent: true })}
          onUploadProof={() => { const bill = payFor; setPayFor(null); setProofFor(bill); }}
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
  scrollFlex: { flex: 1 },
  content: { padding: sw(16), paddingBottom: sw(40), gap: sw(12) },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: sw(12) },
  iconWell: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
    backgroundColor: PropertyHubTheme.mint,
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
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderWidth: 1,
  },
  status_pending: { backgroundColor: PropertyHubTheme.pendingBadgeBg, borderColor: PropertyHubTheme.pendingBorder },
  status_success: { backgroundColor: PropertyHubTheme.successBadgeBg, borderColor: PropertyHubTheme.successBorder },
  status_danger: { backgroundColor: PropertyHubTheme.dangerBadgeBg, borderColor: PropertyHubTheme.dangerBorder },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  statusText_pending: { color: PropertyHubTheme.pendingText },
  statusText_success: { color: PropertyHubTheme.successText },
  statusText_danger: { color: PropertyHubTheme.dangerText },
  amount: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: PropertyHubTheme.text,
    fontVariant: ["tabular-nums"],
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderWidth: 1,
    borderColor: "#D3DCE6",
  },
  chipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: PropertyHubTheme.textMuted },
  rejectReason: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  primaryBtn: {
    backgroundColor: PropertyHubTheme.teal,
    borderRadius: sw(12),
    minHeight: sw(44),
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPrimary: { flex: 1 },
  kuickpayBtn: { backgroundColor: "#EF4B23" },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    borderRadius: sw(12),
    padding: sw(10),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  processingText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#B45309" },
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
  cardActions: { alignSelf: "stretch", width: "100%", alignItems: "stretch", gap: sw(10), marginTop: sw(2) },
  reviewRow: { flexDirection: "row", gap: sw(8), width: "100%" },
  disabled: { opacity: 0.6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  infoText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: PropertyHubTheme.muted },
  proofBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#D3DCE6",
    padding: sw(12),
    gap: sw(4),
  },
  proofLine: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.text,
  },
});
