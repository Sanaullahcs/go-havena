import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { formatCommunityMoney } from "../../utils/money";
import { billAmount, billStatusMeta, canPayBill, formatBillDate } from "../../utils/bill-document";
import { rnShadow } from "../../utils/shadow";
import { sf, sw } from "../../utils/responsive";

const TONE = {
  success: { fg: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
  warning: { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  danger: { fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  info: { fg: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
};

export const FILTERS = ["due", "review", "paid", "all"];

/** Default to what needs action; fall back to everything when nothing is due. */
export function defaultBillFilter(summary) {
  if (summary.due > 0) return "due";
  if (summary.review > 0) return "review";
  return "all";
}

export function filterBills(bills, filter, t) {
  if (filter === "all") return bills;
  return bills.filter((bill) => billStatusMeta(bill, t).group === filter);
}

export function BillSummary({ summary, t }) {
  const clear = summary.due === 0;
  return (
    <View style={[styles.summary, clear ? styles.summaryClear : styles.summaryDue]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryLabel, clear && styles.summaryLabelClear]}>
          {clear ? t("bills.list.allClear") : t("bills.list.outstanding")}
        </Text>
        <Text style={[styles.summaryAmount, clear && styles.summaryAmountClear]}>
          {clear ? t("bills.list.nothingDue") : formatCommunityMoney(summary.outstanding)}
        </Text>
        <Text style={[styles.summaryMeta, clear && styles.summaryMetaClear]}>
          {clear
            ? summary.review > 0
              ? t("bills.list.inReviewCount", { count: summary.review })
              : t("bills.list.paidCount", { count: summary.paid })
            : summary.overdue > 0
              ? t("bills.list.overdueOf", { overdue: summary.overdue, count: summary.due })
              : t("bills.list.toPayCount", { count: summary.due })}
        </Text>
      </View>
      <View style={[styles.summaryIcon, clear ? styles.summaryIconClear : null]}>
        <Feather name={clear ? "check" : summary.overdue > 0 ? "alert-circle" : "file-text"} size={sf(20)} color={clear ? "#047857" : "#FFFFFF"} />
      </View>
    </View>
  );
}

export function BillFilters({ value, onChange, summary, t }) {
  const counts = { due: summary.due, review: summary.review, paid: summary.paid, all: summary.due + summary.review + summary.paid };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {FILTERS.map((key) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.filter, active && styles.filterActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.filterText, active && styles.filterTextActive]}>{t(`bills.list.filter.${key}`)}</Text>
            <View style={[styles.filterCount, active && styles.filterCountActive]}>
              <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{counts[key]}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** List card shared by amenity and unit bills. Tap opens the invoice / receipt. */
export function BillCard({ bill, icon, title, subtitle, t, busy = false, onPress, onPay, payLabel }) {
  const status = billStatusMeta(bill, t);
  const tone = TONE[status.tone] ?? TONE.warning;
  const due = formatBillDate(bill.due_date);
  const payable = canPayBill(bill);
  const paid = status.group === "paid";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} accessibilityRole="button" accessibilityLabel={`${title}, ${status.label}`}>
      <View style={styles.cardTop}>
        <View style={styles.iconWell}>{icon}</View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatCommunityMoney(billAmount(bill))}</Text>
        <Text style={[styles.dueText, status.key === "overdue" && styles.dueOverdue]}>
          {paid
            ? t("bills.list.viewReceipt")
            : due
              ? status.key === "overdue" ? t("bills.list.wasDue", { date: due }) : t("bills.list.dueOn", { date: due })
              : null}
        </Text>
      </View>

      {status.key === "rejected" && bill.rejection_reason ? (
        <View style={styles.reason}>
          <Feather name="alert-triangle" size={sf(13)} color="#B91C1C" />
          <Text style={styles.reasonText} numberOfLines={3}>{bill.rejection_reason}</Text>
        </View>
      ) : null}

      {status.key === "processing" ? (
        <View style={styles.hint}>
          <ActivityIndicator size="small" color="#1D4ED8" />
          <Text style={[styles.hintText, { color: "#1D4ED8" }]}>{t("bills.list.processingHint")}</Text>
        </View>
      ) : status.key === "pending_verification" ? (
        <View style={styles.hint}>
          <Feather name="clock" size={sf(14)} color="#1D4ED8" />
          <Text style={[styles.hintText, { color: "#1D4ED8" }]}>{t("bills.list.reviewHint")}</Text>
        </View>
      ) : null}

      {payable && onPay ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onPay}
            disabled={busy}
            style={({ pressed }) => [styles.payBtn, pressed && styles.cardPressed, busy && styles.disabled]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Feather name="credit-card" size={sf(15)} color="#FFFFFF" />
                <Text style={styles.payText}>{payLabel || t("bills.list.payNow")}</Text>
              </>
            )}
          </Pressable>
          <View style={styles.detailsLink}>
            <Text style={styles.detailsText}>{t("bills.list.invoice")}</Text>
            <Feather name="chevron-right" size={sf(15)} color={PropertyHubTheme.deepTeal} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export function BillEmpty({ filter, t }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={filter === "paid" ? "file-text" : "check"} size={sf(22)} color="#047857" />
      </View>
      <Text style={styles.emptyTitle}>{t(`bills.list.empty.${filter}.title`)}</Text>
      <Text style={styles.emptyBody}>{t(`bills.list.empty.${filter}.body`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: sw(12), borderRadius: sw(20), padding: sw(18) },
  summaryDue: { backgroundColor: "#1B4F8A" },
  summaryClear: { backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" },
  summaryLabel: { fontFamily: Fonts.medium, fontSize: sf(12.5), color: "rgba(255,255,255,0.82)" },
  summaryLabelClear: { color: "#047857" },
  summaryAmount: { fontFamily: Fonts.bold, fontSize: sf(26), color: "#FFFFFF", marginTop: sw(2) },
  summaryAmountClear: { fontSize: sf(20), color: "#064E3B" },
  summaryMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: "rgba(255,255,255,0.82)", marginTop: sw(4) },
  summaryMetaClear: { color: "#047857" },
  summaryIcon: { width: sw(44), height: sw(44), borderRadius: sw(22), alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  summaryIconClear: { backgroundColor: "#D1FAE5" },

  filters: { gap: sw(8), paddingVertical: sw(2) },
  filter: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingLeft: sw(14),
    paddingRight: sw(8),
    minHeight: sw(36),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    backgroundColor: "#FFFFFF",
  },
  filterActive: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  filterText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: PropertyHubTheme.text },
  filterTextActive: { color: "#FFFFFF" },
  filterCount: { minWidth: sw(22), height: sw(22), borderRadius: 999, paddingHorizontal: sw(6), alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  filterCountText: { fontFamily: Fonts.bold, fontSize: sf(11), color: PropertyHubTheme.textMuted },
  filterCountTextActive: { color: "#FFFFFF" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    padding: sw(16),
    gap: sw(12),
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 12, elevation: 2 }),
  },
  cardPressed: { opacity: 0.9 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: sw(12) },
  iconWell: { width: sw(42), height: sw(42), borderRadius: sw(13), alignItems: "center", justifyContent: "center", backgroundColor: PropertyHubTheme.mint },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: Fonts.bold, fontSize: sf(15), lineHeight: sf(20), color: PropertyHubTheme.text },
  cardSub: { fontFamily: Fonts.regular, fontSize: sf(12.5), color: PropertyHubTheme.textMuted, marginTop: sw(2) },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: sw(10), paddingVertical: sw(4), flexShrink: 0 },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  amountRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: sw(10) },
  amount: { fontFamily: Fonts.bold, fontSize: sf(20), color: PropertyHubTheme.text },
  dueText: { fontFamily: Fonts.medium, fontSize: sf(12.5), color: PropertyHubTheme.textMuted },
  dueOverdue: { color: "#B91C1C" },
  reason: { flexDirection: "row", gap: sw(8), padding: sw(10), borderRadius: sw(12), backgroundColor: "#FEF2F2" },
  reasonText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12.5), lineHeight: sf(18), color: "#7F1D1D" },
  hint: { flexDirection: "row", alignItems: "center", gap: sw(8), padding: sw(10), borderRadius: sw(12), backgroundColor: "#EFF6FF" },
  hintText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12.5), lineHeight: sf(18) },
  actions: { flexDirection: "row", alignItems: "center", gap: sw(12) },
  payBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  payText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF" },
  detailsLink: { flexDirection: "row", alignItems: "center", gap: sw(2), paddingHorizontal: sw(4) },
  detailsText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: PropertyHubTheme.deepTeal },
  disabled: { opacity: 0.55 },

  empty: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: sw(18), paddingHorizontal: sw(20), paddingVertical: sw(28) },
  emptyIcon: { width: sw(48), height: sw(48), borderRadius: sw(24), backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginBottom: sw(10) },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: PropertyHubTheme.text, textAlign: "center" },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: PropertyHubTheme.textMuted, textAlign: "center", marginTop: sw(4) },
});
