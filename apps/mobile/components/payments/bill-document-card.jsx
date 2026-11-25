import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";

const HAVENA_MARK = require("../../assets/images/havena-logo.png");
const HAVENA_WORDMARK = require("../../assets/images/havena-wordmark.png");

/** Fixed pixel sizes: this card is captured to an image, so it must not scale with the device. */
const WIDTH = 360;
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const PAGE = "#EEF2F7";

const TONES = {
  success: { fg: "#047857", bg: "#D1FAE5", solid: "#047857", icon: "check" },
  warning: { fg: "#B45309", bg: "#FEF3C7", solid: "#D97706", icon: "clock" },
  danger: { fg: "#B91C1C", bg: "#FEE2E2", solid: "#DC2626", icon: "alert-circle" },
  info: { fg: "#1D4ED8", bg: "#DBEAFE", solid: "#2563EB", icon: "loader" },
};

const KIND_ICON = {
  unit: { name: "home-city-outline", color: "#1B4F8A", bg: "#E8F0F7" },
  amenity: { name: "calendar-star", color: "#0F766E", bg: "#E6F4F1" },
};

function Row({ label, value, strong }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

/** Branded invoice (unpaid) or receipt (paid) for amenity and unit bills. */
const BillDocumentCard = forwardRef(function BillDocumentCard({ doc, t }, ref) {
  const tone = TONES[doc.status.tone] ?? TONES.warning;
  const icon = KIND_ICON[doc.kind] ?? KIND_ICON.amenity;
  const isReceipt = doc.type === "receipt";

  return (
    <View ref={ref} collapsable={false} style={styles.page}>
      <View style={styles.ticket}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={HAVENA_MARK} style={styles.brandMark} contentFit="contain" />
            <Image source={HAVENA_WORDMARK} style={styles.brandWordmark} contentFit="contain" />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{isReceipt ? t("bills.doc.receipt") : t("bills.doc.invoice")}</Text>
            <Text style={styles.number}>{doc.number}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={[styles.ring, { backgroundColor: tone.bg }]}>
            <View style={[styles.dot, { backgroundColor: tone.solid }]}>
              <Feather name={tone.icon} size={24} color="#FFFFFF" />
            </View>
          </View>
          <Text style={[styles.status, { color: tone.fg }]}>{doc.status.label}</Text>
          <Text style={styles.amount}>{doc.amountLabel}</Text>
          <Text style={styles.when}>
            {isReceipt
              ? doc.paidOn ? t("bills.doc.paidOn", { date: doc.paidOn }) : null
              : doc.dueOn ? t("bills.doc.dueOn", { date: doc.dueOn }) : null}
          </Text>
        </View>

        <View style={styles.payee}>
          <View style={[styles.payeeIcon, { backgroundColor: icon.bg }]}>
            <MaterialCommunityIcons name={icon.name} size={22} color={icon.color} />
          </View>
          <View style={styles.payeeBody}>
            <Text style={styles.payeeLabel} numberOfLines={1}>{doc.service || t(doc.kind === "unit" ? "bills.doc.unitBill" : "bills.doc.amenityBill")}</Text>
            <Text style={styles.payeeName} numberOfLines={2}>{doc.title}</Text>
          </View>
        </View>

        <View style={styles.tear}>
          <View style={[styles.notch, styles.notchLeft]} />
          <View style={styles.dash} />
          <View style={[styles.notch, styles.notchRight]} />
        </View>

        <View style={styles.rows}>
          <Row label={t("bills.doc.billedTo")} value={doc.billedTo} />
          <Row label={t("bills.doc.unit")} value={doc.unitNumber} />
          <Row label={t("bills.doc.payTo")} value={doc.payTo} />
          <Row label={t("bills.doc.period")} value={doc.period} />
          <Row label={t("bills.doc.issuedOn")} value={doc.issuedOn} />
          {!isReceipt ? <Row label={t("bills.doc.dueDate")} value={doc.dueOn} /> : null}
          {isReceipt ? <Row label={t("bills.doc.paidOnLabel")} value={doc.paidOn} /> : null}
          {isReceipt ? <Row label={t("bills.doc.method")} value={doc.method} /> : null}
          <Row label={t("bills.doc.reference")} value={doc.reference} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isReceipt ? t("bills.doc.totalPaid") : t("bills.doc.totalDue")}</Text>
            <Text style={styles.totalValue}>{doc.amountLabel}</Text>
          </View>
        </View>

        {doc.rejectionReason ? (
          <View style={styles.alert}>
            <Text style={styles.alertLabel}>{t("bills.doc.rejectionReason")}</Text>
            <Text style={styles.alertText}>{doc.rejectionReason}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footnote}>
            {isReceipt
              ? t("bills.doc.receiptFootnote", { number: doc.number })
              : t("bills.doc.invoiceFootnote", { number: doc.number })}
          </Text>
        </View>
      </View>
    </View>
  );
});

export default BillDocumentCard;

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
  headerRight: { alignItems: "flex-end" },
  headerLabel: { fontFamily: Fonts.semiBold, fontSize: 11, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  number: { fontFamily: Fonts.bold, fontSize: 12, color: INK, marginTop: 2, letterSpacing: 0.4 },
  hero: { alignItems: "center", paddingTop: 20, paddingBottom: 16, paddingHorizontal: 18 },
  ring: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  dot: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  status: { fontFamily: Fonts.semiBold, fontSize: 14 },
  amount: { fontFamily: Fonts.bold, fontSize: 30, color: INK, marginTop: 4, letterSpacing: 0.2 },
  when: { fontFamily: Fonts.regular, fontSize: 12, color: MUTED, marginTop: 4 },
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
  tear: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  notch: { width: 20, height: 20, borderRadius: 10, backgroundColor: PAGE },
  notchLeft: { marginLeft: -10 },
  notchRight: { marginRight: -10 },
  dash: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", marginHorizontal: 6 },
  rows: { paddingHorizontal: 18, paddingTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 8 },
  rowLabel: { fontFamily: Fonts.regular, fontSize: 12.5, color: MUTED },
  rowValue: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 12.5, color: INK, textAlign: "right" },
  rowStrong: { fontFamily: Fonts.bold },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  totalLabel: { fontFamily: Fonts.semiBold, fontSize: 13, color: INK },
  totalValue: { fontFamily: Fonts.bold, fontSize: 16, color: INK },
  alert: { marginHorizontal: 18, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#FEF2F2" },
  alertLabel: { fontFamily: Fonts.semiBold, fontSize: 11, color: "#B91C1C" },
  alertText: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: "#7F1D1D", marginTop: 2 },
  footer: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#F8FAFC", alignItems: "center" },
  footnote: { fontFamily: Fonts.regular, fontSize: 10, lineHeight: 14, color: "#94A3B8", textAlign: "center" },
});
