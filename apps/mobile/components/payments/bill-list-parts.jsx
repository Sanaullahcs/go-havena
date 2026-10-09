import React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { formatCommunityMoney } from "../../utils/money";
import { billAmount, billListStamp, billStatusMeta, canPayBill } from "../../utils/bill-document";
import { rnShadow } from "../../utils/shadow";
import { sf, sw } from "../../utils/responsive";

const CARD_BORDER = "#D3DCE6";

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
              : summary.paid > 0
                ? t("bills.list.paidTotal", { count: summary.paid, amount: formatCommunityMoney(summary.paidTotal) })
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

/** Pay-tab list: summary + filters fixed; only bill cards scroll (unit & amenity). */
export function BillPayListLayout({
  summary,
  activeFilter,
  onFilterChange,
  t,
  refreshing = false,
  onRefresh,
  data,
  keyExtractor,
  renderItem,
}) {
  return (
    <View style={styles.payListRoot}>
      <View style={styles.payListChrome}>
        <BillSummary summary={summary} t={t} />
        <BillFilters value={activeFilter} onChange={onFilterChange} summary={summary} t={t} />
      </View>
      <FlatList
        style={styles.payListScroll}
        contentContainerStyle={[styles.payListContent, data.length === 0 && styles.payListContentEmpty]}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={BillListSeparator}
        ListEmptyComponent={<BillEmpty filter={activeFilter} t={t} />}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PropertyHubTheme.teal} />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function BillListSeparator() {
  return <View style={styles.listSeparator} />;
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

/** Full-width receipt / proof action for receive-side bill cards. */
export function BillReceiptButton({ label, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.receiptHit, pressed && !disabled && styles.receiptHitPressed, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.receiptFace}>
        <Feather name="file-text" size={sf(16)} color={PropertyHubTheme.deepTeal} />
        <Text style={styles.receiptLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

function statusBadgeStyles(tone) {
  if (tone === "success") {
    return { wrap: styles.status_success, text: styles.statusText_success };
  }
  if (tone === "danger") {
    return { wrap: styles.status_danger, text: styles.statusText_danger };
  }
  if (tone === "info") {
    return { wrap: styles.status_info, text: styles.statusText_info };
  }
  return { wrap: styles.status_pending, text: styles.statusText_pending };
}

/** White bordered bill list container — same on pay and receive lists. */
export function BillCardFrame({ children, style, pressed = false }) {
  return <View style={[styles.card, pressed && styles.cardPressed, style]}>{children}</View>;
}

/** List card shared by amenity and unit bills. Tap opens the invoice / receipt. */
export function BillCard({ bill, icon, title, subtitle, t, busy = false, onPress, onPay, payLabel }) {
  const status = billStatusMeta(bill, t);
  const badge = statusBadgeStyles(status.tone);
  const payable = canPayBill(bill);
  const stamp = billListStamp(bill, status);
  const dateHint = stamp
    ? status.group === "due" && status.key !== "overdue"
      ? t("bills.list.dueOn", { date: stamp })
      : stamp
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={styles.cardHit}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatCommunityMoney(billAmount(bill))}, ${status.label}`}
    >
      {({ pressed }) => (
      <BillCardFrame pressed={pressed}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>{icon}</View>
        <View style={styles.headerCopy}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.statusBadge, badge.wrap]}>
          <Text style={[styles.statusBadgeText, badge.text]} numberOfLines={1}>{status.label}</Text>
        </View>
      </View>

      <Text style={[styles.amount, status.key === "overdue" && styles.amountOverdue]}>
        {formatCommunityMoney(billAmount(bill))}
      </Text>

      {dateHint ? (
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Feather name="calendar" size={sf(12)} color={PropertyHubTheme.textMuted} />
            <Text style={styles.chipText} numberOfLines={2}>{dateHint}</Text>
          </View>
        </View>
      ) : null}

      {status.key === "rejected" && bill.rejection_reason ? (
        <View style={styles.reason}>
          <Feather name="alert-triangle" size={sf(13)} color={PropertyHubTheme.dangerText} />
          <Text style={styles.reasonText} numberOfLines={2}>{bill.rejection_reason}</Text>
        </View>
      ) : null}

      {status.key === "processing" ? (
        <View style={styles.hint}>
          <ActivityIndicator size="small" color="#1B4F8A" />
          <Text style={styles.hintText} numberOfLines={2}>{t("bills.list.processingHint")}</Text>
        </View>
      ) : status.key === "pending_verification" ? (
        <View style={styles.hint}>
          <Feather name="clock" size={sf(13)} color="#1B4F8A" />
          <Text style={styles.hintText} numberOfLines={2}>{t("bills.list.reviewHint")}</Text>
        </View>
      ) : null}

      {payable && onPay ? (
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            onPay();
          }}
          disabled={busy}
          style={({ pressed }) => [styles.payHit, pressed && styles.payBtnPressed, busy && styles.disabled]}
          accessibilityRole="button"
        >
          <View style={styles.payFace}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Feather name="credit-card" size={sf(15)} color="#FFFFFF" />
                <Text style={styles.payText}>{payLabel || t("bills.list.payNow")}</Text>
              </>
            )}
          </View>
        </Pressable>
      ) : null}
      </BillCardFrame>
      )}
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
  payListRoot: { flex: 1 },
  payListChrome: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(10),
    gap: sw(12),
    backgroundColor: "#F9FAFB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  payListScroll: { flex: 1 },
  payListContent: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(32),
  },
  payListContentEmpty: { flexGrow: 1 },
  listSeparator: { height: sw(14) },

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

  cardHit: { width: "100%", alignSelf: "stretch" },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(PropertyHubTheme.cardRadius),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: sw(16),
    gap: sw(12),
    alignItems: "stretch",
    overflow: "hidden",
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 2 }, opacity: 0.08, radius: 12, elevation: 3 }),
  },
  cardPressed: { opacity: 0.96 },
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
    flexShrink: 0,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: Fonts.semiBold, fontSize: sf(15), lineHeight: sf(21), color: PropertyHubTheme.text },
  cardSub: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: PropertyHubTheme.textMuted, marginTop: sw(2) },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderWidth: 1,
    flexShrink: 0,
    maxWidth: "36%",
  },
  statusBadgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  status_success: { backgroundColor: PropertyHubTheme.successBadgeBg, borderColor: PropertyHubTheme.successBorder },
  status_pending: { backgroundColor: PropertyHubTheme.pendingBadgeBg, borderColor: PropertyHubTheme.pendingBorder },
  status_danger: { backgroundColor: PropertyHubTheme.dangerBadgeBg, borderColor: PropertyHubTheme.dangerBorder },
  status_info: { backgroundColor: PropertyHubTheme.accentBlue, borderColor: "#BFDBFE" },
  statusText_success: { color: PropertyHubTheme.successText },
  statusText_pending: { color: PropertyHubTheme.pendingText },
  statusText_danger: { color: PropertyHubTheme.dangerText },
  statusText_info: { color: "#1B4F8A" },
  amount: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: PropertyHubTheme.text,
    fontVariant: ["tabular-nums"],
  },
  amountOverdue: { color: PropertyHubTheme.dangerText },
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
    borderColor: CARD_BORDER,
  },
  chipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: PropertyHubTheme.textMuted, flexShrink: 1 },
  reason: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    padding: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.dangerBorder,
    backgroundColor: PropertyHubTheme.dangerBg,
  },
  reasonText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: PropertyHubTheme.dangerText },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    padding: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: PropertyHubTheme.accentBlue,
  },
  hintText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(17), color: "#1B4F8A" },
  payHit: { width: "100%", alignSelf: "stretch" },
  payFace: {
    width: "100%",
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
  },
  payBtnPressed: { opacity: 0.9 },
  payText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF" },
  disabled: { opacity: 0.55 },

  empty: {
    alignItems: "center",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(PropertyHubTheme.cardRadius),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: sw(20),
    paddingVertical: sw(28),
  },
  emptyIcon: { width: sw(48), height: sw(48), borderRadius: sw(24), backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginBottom: sw(10) },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: PropertyHubTheme.text, textAlign: "center" },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: PropertyHubTheme.textMuted, textAlign: "center", marginTop: sw(4) },

  receiptHit: { width: "100%", alignSelf: "stretch" },
  receiptHitPressed: { opacity: 0.92 },
  receiptFace: {
    width: "100%",
    minHeight: sw(48),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    borderWidth: 1.5,
    borderColor: PropertyHubTheme.teal,
    backgroundColor: PropertyHubTheme.mint,
  },
  receiptLabel: { fontFamily: Fonts.bold, fontSize: sf(14), color: PropertyHubTheme.deepTeal },
});
