import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import HeroMoney from "../../../components/payments/hero-money";
import KuickpayPaySheet from "../../../components/payments/kuickpay-pay-sheet";
import { KuickpayColors } from "../../../components/payments/kuickpay-brand";
import Tap from "../../../components/ui/tap";
import BillerLogo from "../../../components/payments/biller-logo";
import { UTILITY_CATEGORIES } from "../../../components/payments/utility-meta";
import { Fonts } from "../../../constants/font";
import { useApiAction } from "../../../hooks/use-api-action";
import { PAYMENT_RESULT_ROUTE } from "../../../hooks/use-kuickpay-pay";
import {
  PAYABLE,
  fetchUtilityAccounts,
  refreshUtilityAccount,
  removeUtilityAccount,
} from "../../../services/payments-api";
import { formatMoney } from "../../../utils/money";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function timeAgo(value, t) {
  if (!value) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return t("utilities.updatedJustNow");
  if (minutes < 60) return t("utilities.updatedMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("utilities.updatedHours", { count: hours });
  return t("utilities.updatedDays", { count: Math.round(hours / 24) });
}

function dueMeta(bill, t) {
  if (!bill) return null;
  if (bill.status === "paid" || bill.status === "externally_paid") {
    return { tone: "success", label: bill.status === "paid" ? t("utilities.paidWithHavena") : t("utilities.paidElsewhere") };
  }
  if (bill.status === "blocked") return { tone: "muted", label: t("utilities.unavailable") };
  if (bill.is_past_due) return { tone: "danger", label: t("utilities.overdue") };
  const days = bill.days_until_due;
  if (days === 0) return { tone: "pending", label: t("utilities.dueToday") };
  if (days != null && days > 0 && days <= 5) return { tone: "pending", label: t("utilities.dueInDays", { count: days }) };
  return { tone: "info", label: t("utilities.dueOn", { date: formatDate(bill.due_date) || "—" }) };
}

const PILL = {
  success: { bg: "#ECFDF5", color: "#047857" },
  pending: { bg: "#FFFBEB", color: "#B45309" },
  danger: { bg: "#FEF2F2", color: "#B91C1C" },
  muted: { bg: "#F1F5F9", color: "#475569" },
  info: { bg: "#EFF6FF", color: "#1D4ED8" },
};

function AccountCard({ account, refreshing, onRefresh, onPay, onMore, onOpenPayment, t }) {
  const bill = account.current_bill;
  const due = dueMeta(bill, t);
  const pill = PILL[due?.tone] ?? PILL.muted;
  const active = bill?.online_payment?.active_payment;
  const processing = active?.status === "processing";
  const payable = bill && !["paid", "externally_paid", "blocked"].includes(bill.status) && bill.payable_amount > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <BillerLogo biller={account.biller} serviceType={account.service_type} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{account.display_name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[account.biller?.short_name !== account.display_name ? account.biller?.short_name : null, account.masked_reference, account.consumer_name]
              .filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Pressable onPress={onMore} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("utilities.manageAccount")}>
          <Feather name="more-vertical" size={sf(17)} color={KuickpayColors.muted} />
        </Pressable>
      </View>

      {bill ? (
        <View style={styles.billBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.billMonth}>{bill.billing_month_label}</Text>
            <Text style={styles.billAmount}>
              {bill.status === "paid" || bill.status === "externally_paid"
                ? formatMoney(bill.paid_amount ?? bill.payable_amount, "PKR")
                : bill.formatted_payable_amount}
            </Text>
            {bill.is_past_due && bill.amount_after_due && bill.status === "unpaid" ? (
              <Text style={styles.lateText}>{t("utilities.lateAmountApplies")}</Text>
            ) : null}
          </View>
          {due ? (
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              <Text style={[styles.pillText, { color: pill.color }]}>{due.label}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.noBill}>{t("utilities.noBillYet")}</Text>
      )}

      {processing ? (
        <Pressable onPress={() => onOpenPayment(active)} style={styles.processing}>
          <ActivityIndicator size="small" color="#B45309" />
          <Text style={styles.processingText}>{t("utilities.paymentProcessing")}</Text>
          <Feather name="chevron-right" size={sf(16)} color="#B45309" />
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn} accessibilityRole="button" accessibilityLabel={t("utilities.refresh")}>
          {refreshing ? <ActivityIndicator size="small" color="#1B4F8A" /> : <Feather name="refresh-cw" size={sf(14)} color="#1B4F8A" />}
          <Text style={styles.refreshText} numberOfLines={1}>{timeAgo(account.last_refreshed_at, t) || t("utilities.refresh")}</Text>
        </Pressable>
        {payable && !processing ? (
          <Tap onPress={onPay} style={styles.payBtn} pressedStyle={styles.payBtnPressed} accessibilityRole="button" accessibilityLabel={t("utilities.payNow")}>
            <Feather name="lock" size={sf(14)} color="#FFFFFF" />
            <Text style={styles.payText}>{t("utilities.payNow")}</Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

export default function UtilitiesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { dialog, showFailure } = useApiAction();
  const [accounts, setAccounts] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchUtilityAccounts();
      setAccounts(result.accounts);
      setMeta(result.meta);
    } catch (error) {
      await showFailure(t("utilities.title"), error);
    } finally {
      setLoading(false);
      setPulling(false);
    }
  }, [showFailure, t]);

  useFocusEffect(useCallback(() => { void load({ silent: true }); }, [load]));

  const due = useMemo(() => {
    const unpaid = accounts.map((a) => a.current_bill).filter((b) => b && b.status === "unpaid");
    return {
      count: unpaid.length,
      total: unpaid.reduce((sum, b) => sum + Number(b.payable_amount || 0), 0),
      overdue: unpaid.filter((b) => b.is_past_due).length,
    };
  }, [accounts]);

  async function refresh(account) {
    setRefreshingId(account.id);
    try {
      const updated = await refreshUtilityAccount(account.id);
      setAccounts((rows) => rows.map((row) => (row.id === account.id ? updated : row)));
    } catch (error) {
      await showFailure(t("utilities.refreshFailed"), error);
    } finally {
      setRefreshingId(null);
    }
  }

  async function manage(account) {
    if (!meta.can_manage) return;
    const choice = await dialog.showConfirm(
      t("utilities.removeTitle", { name: account.display_name }),
      t("utilities.removeBody"),
      { confirmLabel: t("utilities.remove"), destructive: true },
    );
    if (choice !== "confirm") return;
    try {
      await removeUtilityAccount(account.id);
      setAccounts((rows) => rows.filter((row) => row.id !== account.id));
    } catch (error) {
      await showFailure(t("utilities.removeFailed"), error);
    }
  }

  function addAccount(serviceType) {
    router.push({ pathname: "/screens/utilities/add", params: serviceType ? { serviceType } : {} });
  }

  const blocked = !loading && (!meta.enabled || !meta.unit);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("utilities.title")}
        subtitle={t("utilities.subtitle")}
        right={
          <Pressable onPress={() => router.push("/screens/payments-history")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("payments.historyTitle")}>
            <Feather name="clock" size={sf(20)} color="#1B4F8A" />
          </Pressable>
        }
      />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={KuickpayColors.brand} /></View>
      ) : blocked ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}><Feather name={meta.enabled ? "home" : "slash"} size={sf(22)} color={KuickpayColors.muted} /></View>
          <Text style={styles.emptyTitle}>{meta.enabled ? t("utilities.noUnitTitle") : t("utilities.unavailableTitle")}</Text>
          <Text style={styles.emptyBody}>{meta.enabled ? t("utilities.noUnitBody") : t("utilities.unavailableBody")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => { setPulling(true); void load({ silent: true }); }} tintColor={KuickpayColors.brand} />}
        >
          <LinearGradient colors={["#0B3B6E", "#1B4F8A", "#0F766E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={[styles.orb, styles.orbOne]} />
            <View style={[styles.orb, styles.orbTwo]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>{due.count > 0 ? t("utilities.totalDue") : t("utilities.allCaughtUp")}</Text>
              <HeroMoney text={formatMoney(due.total, "PKR")} />
              <Text style={styles.heroMeta}>
                {due.count > 0
                  ? t("utilities.billsDue", { count: due.count }) + (due.overdue ? ` · ${t("utilities.overdueCount", { count: due.overdue })}` : "")
                  : t("utilities.nothingDue")}
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name={due.count > 0 ? "receipt" : "check-decagram"} size={sf(24)} color="#FFFFFF" />
            </View>
          </LinearGradient>

          <View style={styles.categoryCard}>
            <Text style={styles.categoryHeading}>{meta.can_manage ? t("utilities.addByType") : t("utilities.types")}</Text>
            <View style={styles.categories}>
              {UTILITY_CATEGORIES.map((category) => (
                <Tap
                  key={category.id}
                  onPress={() => addAccount(category.id)}
                  disabled={!meta.can_manage}
                  containerStyle={styles.categoryCell}
                  style={styles.category}
                  accessibilityRole="button"
                  accessibilityLabel={t(`utilities.categories.${category.id}`)}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: category.bg }]}>
                    <MaterialCommunityIcons name={category.icon} size={sf(24)} color={category.color} />
                  </View>
                  <Text style={styles.categoryText} numberOfLines={1}>{t(`utilities.categories.${category.id}`)}</Text>
                </Tap>
              ))}
            </View>
          </View>

          {accounts.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="lightning-bolt" size={sf(26)} color="#D97706" /></View>
              <Text style={styles.emptyTitle}>{t("utilities.emptyTitle")}</Text>
              <Text style={styles.emptyBody}>{meta.can_manage ? t("utilities.emptyBody") : t("utilities.contactOnly")}</Text>
              {meta.can_manage ? (
                <Pressable onPress={() => addAccount()} style={styles.addBtn}>
                  <Feather name="plus" size={sf(16)} color="#FFFFFF" />
                  <Text style={styles.addText}>{t("utilities.addFirst")}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t("utilities.yourBills")}</Text>
                {meta.can_manage ? (
                  <Pressable onPress={() => addAccount()} hitSlop={8} style={styles.sectionAction}>
                    <Feather name="plus" size={sf(14)} color="#1B4F8A" />
                    <Text style={styles.sectionActionText}>{t("utilities.add")}</Text>
                  </Pressable>
                ) : null}
              </View>
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  refreshing={refreshingId === account.id}
                  onRefresh={() => void refresh(account)}
                  onPay={() => setPayFor(account)}
                  onMore={() => void manage(account)}
                  onOpenPayment={(payment) => router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id: payment.id } })}
                  t={t}
                />
              ))}
              {!meta.can_manage ? <Text style={styles.footnote}>{t("utilities.contactOnly")}</Text> : null}
            </>
          )}
        </ScrollView>
      )}

      {payFor?.current_bill ? (
        <KuickpayPaySheet
          visible
          payableType={PAYABLE.UTILITY_BILL}
          payableId={payFor.current_bill.id}
          bill={{
            title: `${payFor.biller?.short_name ?? payFor.display_name} · ${payFor.current_bill.billing_month_label}`,
            subtitle: [payFor.consumer_name, payFor.masked_reference].filter(Boolean).join(" · "),
            amount: payFor.current_bill.payable_amount,
            dueDate: payFor.current_bill.due_date,
            isPastDue: payFor.current_bill.is_past_due,
            amountAfterDue: payFor.current_bill.amount_after_due,
            onlinePayment: payFor.current_bill.online_payment,
          }}
          onClose={() => setPayFor(null)}
          onSettled={() => load({ silent: true })}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FB" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: sw(24), gap: sw(8) },
  content: { padding: sw(16), paddingBottom: sw(36), gap: sw(14) },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderRadius: sw(24),
    padding: sw(20),
    overflow: "hidden",
  },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  orbOne: { width: sw(180), height: sw(180), top: -sw(70), right: -sw(50) },
  orbTwo: { width: sw(110), height: sw(110), bottom: -sw(50), left: -sw(30) },
  heroLabel: { fontFamily: Fonts.semiBold, fontSize: sf(13), letterSpacing: 0.4, color: "rgba(255,255,255,0.82)" },
  heroMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: "rgba(255,255,255,0.85)", marginTop: sw(4) },
  heroBadge: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(26),
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(20),
    paddingVertical: sw(14),
    paddingHorizontal: sw(8),
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 12, elevation: 2 }),
  },
  categoryHeading: { fontFamily: Fonts.bold, fontSize: sf(14), color: KuickpayColors.ink, paddingHorizontal: sw(8), marginBottom: sw(12) },
  categories: { flexDirection: "row" },
  categoryCell: { flex: 1 },
  category: { alignItems: "center", gap: sw(7) },
  categoryIcon: { width: sw(52), height: sw(52), borderRadius: sw(18), alignItems: "center", justifyContent: "center" },
  categoryText: { fontFamily: Fonts.medium, fontSize: sf(11.5), color: KuickpayColors.ink },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sw(4) },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: KuickpayColors.ink },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: sw(4) },
  sectionActionText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#1B4F8A" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    padding: sw(14),
    gap: sw(12),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: sw(12) },
  billerBadge: { width: sw(42), height: sw(42), borderRadius: sw(12), alignItems: "center", justifyContent: "center" },
  billerInitials: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#FFFFFF" },
  cardTitle: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: KuickpayColors.ink },
  cardMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, marginTop: sw(1) },
  iconBtn: { width: sw(32), height: sw(32), alignItems: "center", justifyContent: "center" },
  billBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: "#F8FAFC",
    borderRadius: sw(14),
    padding: sw(12),
  },
  billMonth: { fontFamily: Fonts.medium, fontSize: sf(12), color: KuickpayColors.muted },
  billAmount: { fontFamily: Fonts.bold, fontSize: sf(20), color: KuickpayColors.ink, marginTop: sw(1) },
  lateText: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#B91C1C", marginTop: sw(2) },
  noBill: { fontFamily: Fonts.regular, fontSize: sf(13), color: KuickpayColors.muted },
  pill: { paddingHorizontal: sw(10), paddingVertical: sw(5), borderRadius: 999 },
  pillText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  processing: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderRadius: sw(12),
    padding: sw(10),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  processingText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#92400E" },
  actions: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  refreshBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(42),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
  },
  refreshText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#1B4F8A" },
  payBtn: {
    flexDirection: "row",
    gap: sw(6),
    minHeight: sw(42),
    paddingHorizontal: sw(20),
    borderRadius: sw(12),
    backgroundColor: KuickpayColors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnPressed: { backgroundColor: KuickpayColors.brandDark },
  payText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF" },
  emptyCard: {
    alignItems: "center",
    gap: sw(8),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    padding: sw(24),
  },
  emptyIcon: { width: sw(52), height: sw(52), borderRadius: sw(16), backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: KuickpayColors.ink, textAlign: "center" },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: KuickpayColors.muted, textAlign: "center" },
  addBtn: {
    marginTop: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(46),
    paddingHorizontal: sw(20),
    borderRadius: sw(14),
    backgroundColor: "#1B4F8A",
  },
  addText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF" },
  footnote: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, textAlign: "center" },
});
