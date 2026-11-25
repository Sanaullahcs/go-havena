import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import BillerLogo from "./biller-logo";
import { KuickpayMark } from "./kuickpay-brand";

const HAVENA_MARK = require("../../assets/images/havena-logo.png");
const HAVENA_WORDMARK = require("../../assets/images/havena-wordmark.png");

/** Fixed pixel sizes: this card is captured to an image, so it must not scale with the device. */
const WIDTH = 360;
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SUCCESS = "#047857";
const PAGE = "#EEF2F7";

const PAYABLE_ICON = {
  unit_service_bill: { name: "home-city-outline", color: "#1B4F8A", bg: "#E8F0F7" },
  amenity_resident_bill: { name: "calendar-star", color: "#0F766E", bg: "#E6F4F1" },
};

export function formatReceiptDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ label, value, mono }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function PayeeIcon({ payment }) {
  if (payment.biller) return <BillerLogo biller={payment.biller} size={40} />;
  const icon = PAYABLE_ICON[payment.payable_type] ?? { name: "receipt", color: "#475569", bg: "#F1F5F9" };
  return (
    <View style={[styles.payeeIcon, { backgroundColor: icon.bg }]}>
      <MaterialCommunityIcons name={icon.name} size={22} color={icon.color} />
    </View>
  );
}

/**
 * Branded payment receipt rendered off-screen and captured as an image for sharing.
 * Only rendered for payments KuickPay has confirmed (payment.receipt is set).
 */
const ReceiptCard = forwardRef(function ReceiptCard({ payment, t }, ref) {
  const receipt = payment.receipt ?? {};
  const paidAt = formatReceiptDate(receipt.paid_at);

  return (
    <View ref={ref} collapsable={false} style={styles.page}>
      <View style={styles.ticket}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={HAVENA_MARK} style={styles.brandMark} contentFit="contain" />
            <Image source={HAVENA_WORDMARK} style={styles.brandWordmark} contentFit="contain" />
          </View>
          <Text style={styles.headerLabel}>{t("payments.receipt")}</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.successRing}>
            <View style={styles.successDot}>
              <Feather name="check" size={26} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.status}>{payment.status_label}</Text>
          <Text style={styles.amount}>{payment.formatted_amount}</Text>
          {paidAt ? <Text style={styles.when}>{paidAt}</Text> : null}
          {payment.test_mode ? (
            <View style={styles.testBadge}>
              <Text style={styles.testText}>{t("payments.testMode")}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.payee}>
          <PayeeIcon payment={payment} />
          <View style={styles.payeeBody}>
            <Text style={styles.payeeLabel}>{t("payments.paidTo")}</Text>
            <Text style={styles.payeeName} numberOfLines={2}>{receipt.paid_to || payment.community_name || payment.title}</Text>
          </View>
        </View>

        <View style={styles.tear}>
          <View style={[styles.notch, styles.notchLeft]} />
          <View style={styles.dash} />
          <View style={[styles.notch, styles.notchRight]} />
        </View>

        <View style={styles.rows}>
          <Row label={t("payments.bill")} value={payment.title} />
          <Row label={t("payments.billDetails")} value={payment.subtitle} />
          <Row label={t("payments.community")} value={receipt.community_name || payment.community_name} />
          <Row label={t("payments.apartment")} value={receipt.apartment || payment.apartment} />
          <Row label={t("payments.invoice")} value={receipt.invoice_number || payment.invoice_number} />
          <Row label={t("payments.paidBy")} value={receipt.payer} />
          <Row label={t("payments.method")} value={receipt.method_label} />
          <Row label={t("payments.channel")} value={receipt.channel_label} />
          <Row label={t("payments.reference")} value={receipt.reference || payment.reference} mono />
          <Row label={t("payments.transactionId")} value={receipt.transaction_id} mono />
        </View>

        <View style={styles.footer}>
          <View style={styles.processed}>
            <Text style={styles.processedText}>{t("payments.processedBy")}</Text>
            <KuickpayMark size={18} />
            <Text style={styles.processedBrand}>KuickPay</Text>
          </View>
          <Text style={styles.footnote}>{t("payments.receiptFootnote", { reference: receipt.reference || payment.reference })}</Text>
        </View>
      </View>
    </View>
  );
});

export default ReceiptCard;

const styles = StyleSheet.create({
  page: { width: WIDTH, padding: 16, backgroundColor: PAGE },
  ticket: { backgroundColor: "#FFFFFF", borderRadius: 22, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandMark: { width: 30, height: 30 },
  brandWordmark: { width: 82, height: 17 },
  headerLabel: { fontFamily: Fonts.semiBold, fontSize: 12, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  hero: { alignItems: "center", paddingTop: 22, paddingBottom: 18, paddingHorizontal: 18 },
  successRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successDot: { width: 50, height: 50, borderRadius: 25, backgroundColor: SUCCESS, alignItems: "center", justifyContent: "center" },
  status: { fontFamily: Fonts.semiBold, fontSize: 15, color: SUCCESS },
  amount: { fontFamily: Fonts.bold, fontSize: 32, color: INK, marginTop: 4, letterSpacing: 0.2 },
  when: { fontFamily: Fonts.regular, fontSize: 12, color: MUTED, marginTop: 4 },
  testBadge: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" },
  testText: { fontFamily: Fonts.semiBold, fontSize: 10, color: "#B45309" },
  payee: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 18,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
  },
  payeeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payeeBody: { flex: 1 },
  payeeLabel: { fontFamily: Fonts.regular, fontSize: 11, color: MUTED },
  payeeName: { fontFamily: Fonts.bold, fontSize: 14, color: INK, marginTop: 1 },
  tear: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  notch: { width: 20, height: 20, borderRadius: 10, backgroundColor: PAGE },
  notchLeft: { marginLeft: -10 },
  notchRight: { marginRight: -10 },
  dash: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", marginHorizontal: 6 },
  rows: { paddingHorizontal: 18, paddingTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 9 },
  rowLabel: { fontFamily: Fonts.regular, fontSize: 12.5, color: MUTED },
  rowValue: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 12.5, color: INK, textAlign: "right" },
  mono: { letterSpacing: 0.4 },
  footer: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#F8FAFC", alignItems: "center", gap: 6 },
  processed: { flexDirection: "row", alignItems: "center", gap: 6 },
  processedText: { fontFamily: Fonts.regular, fontSize: 11, color: MUTED },
  processedBrand: { fontFamily: Fonts.bold, fontSize: 12, color: "#0047CC" },
  footnote: { fontFamily: Fonts.regular, fontSize: 10, lineHeight: 14, color: "#94A3B8", textAlign: "center" },
});
