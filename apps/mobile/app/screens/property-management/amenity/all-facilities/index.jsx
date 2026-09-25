import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from "react-native";
import React, { useCallback, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect, usePathname } from "expo-router";
import ScreenHeader from "../../../../../components/layout/screen-header";
import AmenityIcon from "../../../../../components/property/amenity-icon";
import { Fonts } from "../../../../../constants/font";
import { Colors, Layout } from "../../../../../constants/tokens";
import { sw, sf } from "../../../../../utils/responsive";
import { pageStyles } from "../../../../../constants/page-styles";
import { PropertyManagementRoutes, amenityFlowRoutes } from "../../../../../constants/property-management-routes";
import { fetchAmenityBills, fetchMyBookings } from "../../../../../services/amenity-api";
import AmenityPaymentProofModal from "../../../../../components/property/amenity-payment-proof-modal";
import {
  getAmenityVisual,
  getAmenityStatus,
  formatLongDate,
  formatUsdAmount,
  bookingFeeAmount,
  hasUpcomingUserBooking,
  getNextUserBookingDate,
} from "../../../../../utils/amenity-display";
import { localizedField } from "../../../../../i18n";
import { rnShadow } from "../../../../../utils/shadow";


export default function AllFacilities() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const {
    id,
    name: nameEn,
    nameEs,
    nameAr,
    description: descEn,
    descriptionEs,
    descriptionAr,
    capacity,
    floor,
    hours,
    status,
    iconKey,
    weekendsAvailable,
    isMine,
    reviewStatus,
    userHasUpcomingBooking,
    userNextBookingDate,
    hasOverdueSharedAmenityBill,
    bookingFee,
    displayFee,
    sharedBillingEnabled,
    sharedBillingFrequency,
  } = useLocalSearchParams();

  const amenityObj = { name: nameEn, name_es: nameEs, name_ar: nameAr, description: descEn, description_es: descriptionEs, description_ar: descriptionAr };
  const name = localizedField(amenityObj, "name") || nameEn;
  const description = localizedField(amenityObj, "description") || descEn;

  const [myBookings, setMyBookings] = useState([]);
  const [bills, setBills] = useState([]);
  const [billsError, setBillsError] = useState(null);
  const [proofBill, setProofBill] = useState(null);

  useFocusEffect(
    useCallback(() => {
      fetchMyBookings()
        .then((rows) => setMyBookings(rows ?? []))
        .catch(() => setMyBookings([]));
      if (!id) return;
      fetchAmenityBills(id)
        .then((rows) => {
          setBills(rows ?? []);
          setBillsError(null);
        })
        .catch(() => {
          setBills([]);
          setBillsError(t("propertyMgmt.couldNotLoadBills"));
        });
    }, [id, t]),
  );

  const amenityId = Number(id);
  const reservedDate =
    String(userNextBookingDate ?? "") ||
    getNextUserBookingDate(myBookings, amenityId) ||
    null;
  const alreadyBooked =
    userHasUpcomingBooking === "1" ||
    userHasUpcomingBooking === "true" ||
    hasUpcomingUserBooking(myBookings, amenityId);

  const visual = getAmenityVisual(name, iconKey || null);
  const statusMeta = getAmenityStatus(status);
  const ownedByMe = isMine === "1" || isMine === "true";
  const billingRestricted =
    hasOverdueSharedAmenityBill === "1" ||
    hasOverdueSharedAmenityBill === "true" ||
    bills.some((bill) => bill.has_overdue_shared_amenity_bill);
  const outstandingPrevious = bills.find((bill) => bill.outstanding_previous_bill)?.outstanding_previous_bill;
  const canBook =
    !ownedByMe &&
    !alreadyBooked &&
    !billingRestricted &&
    reviewStatus !== "pending" &&
    reviewStatus !== "rejected" &&
    (status === "bookable" || status === "open");

  const weekendsOn =
    weekendsAvailable !== "0" &&
    weekendsAvailable !== "false" &&
    weekendsAvailable !== false;

  const infoRows = [
    floor
      ? { icon: "map-pin", tint: "#0284C7", label: t("propertyMgmt.locationLabel"), value: floor }
      : null,
    hours
      ? { icon: "clock", tint: "#059669", label: t("propertyMgmt.hoursLabel"), value: hours }
      : null,
    {
      icon: "calendar",
      tint: "#0D9488",
      label: t("propertyMgmt.weekendsLabel"),
      value: weekendsOn ? t("propertyMgmt.available") : t("propertyMgmt.closedSatSun"),
    },
    capacity
      ? {
          icon: "users",
          tint: "#7C3AED",
          label: t("propertyMgmt.capacityLabel"),
          value: t("propertyMgmt.people", { count: Number(capacity) }),
        }
      : null,
    bookingFeeAmount(displayFee ?? bookingFee) > 0
      ? {
          icon: "credit-card",
          tint: "#B45309",
          label:
            String(sharedBillingEnabled) === "1"
              ? t("propertyMgmt.sharedFee")
              : t("propertyMgmt.bookingFee"),
          value:
            String(sharedBillingEnabled) === "1"
              ? `${formatUsdAmount(displayFee ?? bookingFee)} / ${
                  sharedBillingFrequency === "yearly"
                    ? t("admin.sharedBillingYearly")
                    : t("admin.sharedBillingMonthly")
                }`
              : formatUsdAmount(displayFee ?? bookingFee),
        }
      : null,
  ].filter(Boolean);

  const goToCalendar = () => {
    if (ownedByMe) {
      router.push(PropertyManagementRoutes.ADMIN_BOOKINGS);
      return;
    }
    router.push({
      pathname: amenityFlowRoutes(pathname).reservationCalendar,
      params: {
        id: String(id ?? ""),
        name,
        hours,
        status: String(status ?? ""),
        weekendsAvailable: String(weekendsAvailable ?? "1"),
        isMine: ownedByMe ? "1" : "0",
        bookingFee: String(bookingFee ?? "0"),
      },
    });
  };

  const goToInbox = () => {
    router.push(PropertyManagementRoutes.ADMIN_BOOKINGS);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        titleAlign="center"
        title={name || t("propertyMgmt.amenityFallback")}
        iconOnly
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, pageStyles.scrollBottom]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: visual.soft }]}>
            <AmenityIcon
              iconKey={iconKey || null}
              name={name}
              size={sf(32)}
              color={visual.tint}
            />
          </View>
          <Text style={styles.heroTitle}>{name}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusMeta.dot }]} />
            <Text style={[styles.statusText, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
          </View>
          {description ? (
            <Text style={styles.heroDesc}>{description}</Text>
          ) : null}
        </View>

        {/* Info */}
        {infoRows.length > 0 ? (
          <View style={styles.card}>
            {infoRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.infoRow, index < infoRows.length - 1 && styles.infoRowBorder]}
              >
                <View style={[styles.infoIcon, { backgroundColor: `${row.tint}14` }]}>
                  <Feather name={row.icon} size={sf(16)} color={row.tint} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {billsError || bills.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>{t("propertyMgmt.billingHistory")}</Text>
            {billsError ? <Text style={styles.billMuted}>{billsError}</Text> : null}
            {billingRestricted && outstandingPrevious ? (
              <Text style={styles.rejectedNote}>
                {t("propertyMgmt.outstandingPreviousBill", {
                  amenity: name,
                  month: outstandingPrevious.billing_month_label || outstandingPrevious.billing_month,
                })}
              </Text>
            ) : null}
            {bills.map((bill) => {
              const pending = bill.status === "pending_verification";
              const paid = bill.status === "paid";
              const rejected = bill.status === "rejected";
              const overdue = bill.status === "overdue";
              const proof = bill.payment_proof;
              const acknowledgement = bill.payment_acknowledgement;
              return (
              <View key={String(bill.id)} style={styles.billBlock}>
                <View style={styles.billHeader}>
                  <Text style={styles.billTitle}>{name}</Text>
                  <View
                    style={[
                      styles.unpaidPill,
                      pending && styles.pendingPill,
                      paid && styles.paidPill,
                      (rejected || overdue) && styles.rejectedPill,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unpaidText,
                        pending && styles.pendingText,
                        paid && styles.paidText,
                        (rejected || overdue) && styles.rejectedText,
                      ]}
                    >
                      {bill.status_label
                        || (paid
                          ? t("propertyMgmt.billPaid")
                          : overdue
                            ? t("propertyMgmt.billOverdue")
                            : rejected
                              ? t("propertyMgmt.billRejected")
                              : pending
                                ? t("propertyMgmt.pendingVerification")
                                : t("propertyMgmt.billUnpaid"))}
                    </Text>
                  </View>
                </View>
                <Text style={styles.billMeta}>
                  {t("propertyMgmt.billingMonth")}: {bill.billing_month_label || bill.billing_month}
                </Text>
                <Text style={styles.billMeta}>
                  {t("propertyMgmt.billAmount")}: {bill.amount ?? bill.amount_per_resident}
                </Text>
                <Text style={styles.billMeta}>
                  {t("propertyMgmt.billDueDate")}: {formatLongDate(bill.due_date) || bill.due_date}
                </Text>
                {paid && bill.paid_at ? (
                  <Text style={styles.billMeta}>
                    {t("propertyMgmt.paidDate")}: {formatLongDate(bill.paid_at) || bill.paid_at}
                  </Text>
                ) : null}
                {bill.file_url ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(bill.file_url)}
                    activeOpacity={0.8}
                    style={styles.billLink}
                  >
                    <Feather name="file-text" size={sf(14)} color="#1B4F8A" />
                    <Text style={styles.billLinkText}>
                      {bill.file_name || t("propertyMgmt.viewBillDocument")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {pending ? (
                  <Text style={styles.proofNote}>{t("propertyMgmt.paymentProofSubmitted")}</Text>
                ) : null}
                {(rejected || overdue) && bill.rejection_reason ? (
                  <Text style={styles.rejectedNote}>
                    {t("propertyMgmt.paymentRejected")}: {bill.rejection_reason}
                  </Text>
                ) : null}
                {paid && acknowledgement ? (
                  <View style={styles.ackBox}>
                    <Text style={styles.ackLabel}>{t("propertyMgmt.paymentAcknowledgement")}</Text>
                    <Text style={styles.ackMessage}>{acknowledgement.message}</Text>
                    <Text style={styles.billMeta}>
                      {t("propertyMgmt.billingMonth")}: {acknowledgement.billing_month_label || acknowledgement.billing_month}
                    </Text>
                    <Text style={styles.billMeta}>
                      {t("propertyMgmt.billAmount")}: {acknowledgement.amount}
                    </Text>
                    {acknowledgement.payment_date ? (
                      <Text style={styles.billMeta}>
                        {t("propertyMgmt.paymentDate")}: {formatLongDate(acknowledgement.payment_date) || acknowledgement.payment_date}
                      </Text>
                    ) : null}
                    {acknowledgement.approved_at ? (
                      <Text style={styles.billMeta}>
                        {t("propertyMgmt.approvedDate")}: {formatLongDate(acknowledgement.approved_at) || acknowledgement.approved_at}
                      </Text>
                    ) : null}
                    {acknowledgement.payment_reference ? (
                      <Text style={styles.billMeta}>
                        {t("propertyMgmt.paymentReference")}: {acknowledgement.payment_reference}
                      </Text>
                    ) : null}
                    <Text style={styles.billMeta}>
                      {t("propertyMgmt.billStatus")}: {acknowledgement.status_label || t("propertyMgmt.billPaid")}
                    </Text>
                    <Text style={styles.billMeta}>
                      {t("propertyMgmt.communityAcknowledgement")}: {acknowledgement.acknowledged_by_label}
                    </Text>
                  </View>
                ) : null}
                {bill.can_submit_proof && bill.resident_bill_id ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.proofBtn}
                    onPress={() => setProofBill(bill)}
                  >
                    <Feather name="upload" size={sf(14)} color="#FFFFFF" />
                    <Text style={styles.proofBtnText}>
                      {rejected ? t("propertyMgmt.uploadNewPaymentProof") : t("propertyMgmt.uploadPaymentProof")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {proof ? (
                  <View style={styles.proofBox}>
                    <Text style={styles.proofBoxLabel}>{t("propertyMgmt.submittedProof")}</Text>
                    {proof.payment_date ? (
                      <Text style={styles.billMeta}>
                        {t("propertyMgmt.paymentDate")}: {formatLongDate(proof.payment_date) || proof.payment_date}
                      </Text>
                    ) : null}
                    {proof.payment_reference ? (
                      <Text style={styles.billMeta}>
                        {t("propertyMgmt.paymentReference")}: {proof.payment_reference}
                      </Text>
                    ) : null}
                    {proof.payment_note ? <Text style={styles.billMeta}>{proof.payment_note}</Text> : null}
                    {proof.file_url ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(proof.file_url)}
                        activeOpacity={0.8}
                        style={styles.billLink}
                      >
                        <Feather name="image" size={sf(14)} color="#1B4F8A" />
                        <Text style={styles.billLinkText}>
                          {proof.file_name || t("propertyMgmt.viewPaymentProof")}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
              );
            })}
          </View>
        ) : null}

        {/* Guidelines */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>{t("propertyMgmt.goodToKnow")}</Text>
          {[
            t("propertyMgmt.tipArriveOnTime"),
            t("propertyMgmt.tipRespectCapacity"),
            t("propertyMgmt.tipLeaveClean"),
          ].map((tip, index) => (
            <View key={index} style={styles.tipRow}>
              <View style={styles.tipDot}>
                <Feather name="check" size={sf(11)} color="#FFFFFF" />
              </View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {ownedByMe ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToInbox}>
            <Feather name="inbox" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{t("propertyMgmt.approveRequests")}</Text>
          </TouchableOpacity>
        ) : canBook && status === "bookable" ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToCalendar}>
            <Feather name="calendar" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{t("propertyMgmt.reserveSlot")}</Text>
          </TouchableOpacity>
        ) : canBook && status === "open" ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToCalendar}>
            <Feather name="send" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{t("propertyMgmt.requestAccess")}</Text>
          </TouchableOpacity>
        ) : billingRestricted && !ownedByMe ? (
          <View style={styles.bookedBtn}>
            <Feather name="alert-circle" size={sf(15)} color="#B91C1C" />
            <View style={styles.bookedCopy}>
              <Text style={[styles.bookedTitle, { color: "#B91C1C" }]}>
                {t("propertyMgmt.bookingPausedForBill")}
              </Text>
              <Text style={styles.bookedText}>{t("propertyMgmt.bookingPausedForBillHint")}</Text>
            </View>
          </View>
        ) : alreadyBooked && !ownedByMe ? (
          <View style={styles.bookedBtn}>
            <Feather name="bookmark" size={sf(15)} color="#64748B" />
            <View style={styles.bookedCopy}>
              <Text style={styles.bookedTitle}>{t("propertyMgmt.alreadyBookedSection")}</Text>
              <Text style={styles.bookedText}>
                {reservedDate
                  ? t("propertyMgmt.reservationOnDate", { date: formatLongDate(reservedDate) })
                  : t("propertyMgmt.alreadyUpcoming")}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.closedBtn}>
            <Feather name="lock" size={sf(15)} color={Colors.textMuted} />
            <Text style={styles.closedText}>
              {reviewStatus === "pending"
                ? t("propertyMgmt.waitingAdminApproval")
                : reviewStatus === "rejected"
                  ? t("propertyMgmt.notApproved")
                  : t("propertyMgmt.currentlyClosed")}
            </Text>
          </View>
        )}
      </View>

      <AmenityPaymentProofModal
        visible={Boolean(proofBill)}
        bill={proofBill}
        amenityId={amenityId}
        amenityName={name}
        onClose={() => setProofBill(null)}
        onSubmitted={(updated) => {
          if (updated) {
            setBills((current) =>
              current.map((row) =>
                row.resident_bill_id === updated.resident_bill_id ? updated : row,
              ),
            );
          }
          setProofBill(null);
          if (id) {
            fetchAmenityBills(id)
              .then((rows) => setBills(rows ?? []))
              .catch(() => {});
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(12),
    gap: sw(14),
  },

  hero: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: sw(22),
    paddingHorizontal: sw(18),
    ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
    elevation: 1,
  },
  heroIcon: {
    width: sw(68),
    height: sw(68),
    borderRadius: sw(20),
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    marginTop: sw(14),
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(20),
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(10),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
  },
  statusDot: { width: sw(6), height: sw(6), borderRadius: sw(3) },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
  },
  heroDesc: {
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
    textAlign: "center",
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: sw(16),
    paddingVertical: sw(4),
    ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(14),
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  infoIcon: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  infoValue: {
    marginTop: 1,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    color: Colors.textPrimary,
  },

  cardHeading: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: Colors.textPrimary,
    marginTop: sw(12),
    marginBottom: sw(4),
  },
  billMuted: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
    paddingBottom: sw(12),
  },
  billBlock: {
    paddingVertical: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  billHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(6),
  },
  billTitle: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  unpaidPill: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  unpaidText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: "#B45309",
  },
  billMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: Colors.textSecondary,
  },
  billLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(8),
  },
  billLinkText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: "#1B4F8A",
  },
  pendingPill: { backgroundColor: "#DBEAFE" },
  pendingText: { color: "#1D4ED8" },
  paidPill: { backgroundColor: "#D1FAE5" },
  paidText: { color: "#047857" },
  rejectedPill: { backgroundColor: "#FEE2E2" },
  rejectedText: { color: "#B91C1C" },
  rejectedNote: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#B91C1C",
  },
  proofNote: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: Colors.textSecondary,
  },
  proofBtn: {
    marginTop: sw(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#1B4F8A",
    borderRadius: sw(12),
    paddingVertical: sw(11),
  },
  proofBtnText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  proofBox: {
    marginTop: sw(10),
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    padding: sw(10),
    gap: sw(2),
  },
  ackBox: {
    marginTop: sw(10),
    backgroundColor: "#ECFDF5",
    borderRadius: sw(12),
    padding: sw(10),
    gap: sw(2),
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  ackLabel: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: "#047857",
    marginBottom: sw(4),
  },
  ackMessage: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#065F46",
    marginBottom: sw(4),
  },
  proofBoxLabel: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: Colors.textMuted,
    marginBottom: sw(4),
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    paddingVertical: sw(8),
  },
  tipDot: {
    width: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textBody,
  },

  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(20),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#F7F8FC",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: Colors.brandPrimaryDeep,
    paddingVertical: sw(15),
    borderRadius: sw(14),
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  closedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#F1F5F9",
    paddingVertical: sw(15),
    borderRadius: sw(14),
  },
  closedText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textMuted,
  },
  bookedBtn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    borderRadius: sw(14),
  },
  bookedCopy: { flex: 1, minWidth: 0 },
  bookedTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: "#334155",
  },
  bookedText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#64748B",
  },
});
