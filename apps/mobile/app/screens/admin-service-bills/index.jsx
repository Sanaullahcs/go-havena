import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../constants/property-styles";
import { PropertyHubTheme } from "../../../constants/property-management-theme";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { Fonts } from "../../../constants/font";
import { useApiAction } from "../../../hooks/use-api-action";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import {
  approveAdminServiceBill,
  billingFrequencyLabel,
  fetchAdminServiceBills,
  rejectAdminServiceBill,
  serviceCategoryLabel,
} from "../../../services/property-services-api";
import { formatCommunityMoney } from "../../../utils/money";

const TABS = [
  { id: "all", labelKey: "services.serviceBillsTabAll" },
  { id: "pending_verification", labelKey: "services.serviceBillsTabPending" },
  { id: "overdue", labelKey: "services.serviceBillsTabOverdue" },
  { id: "paid", labelKey: "services.serviceBillsTabPaid" },
];

function formatAmount(amount) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return formatCommunityMoney(value);
}

function formatAcknowledgedAt(value) {
  if (!value) return null;
  const raw = String(value);
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDueDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function statusMeta(bill, t) {
  const key = String(bill.status ?? "").toLowerCase();
  if (key === "overdue" || key === "rejected") {
    return {
      label: bill.status_label || t(key === "overdue" ? "services.unitBillsStatusOverdue" : "services.unitBillsStatusRejected"),
      tone: "danger",
    };
  }
  if (key === "paid") {
    return { label: bill.status_label || t("services.unitBillsStatusPaid"), tone: "success" };
  }
  if (key === "acknowledged") {
    return { label: bill.status_label || t("services.unitBillsStatusAcknowledged"), tone: "success" };
  }
  if (key === "pending_verification") {
    return { label: bill.status_label || t("services.unitBillsStatusPending"), tone: "pending" };
  }
  return { label: bill.status_label || t("services.unitBillsStatusUnpaid"), tone: "pending" };
}

function canReviewBill(bill) {
  return bill.can_review === true || String(bill.status ?? "").toLowerCase() === "pending_verification";
}

function billMatchesTab(bill, tab) {
  if (tab === "all") return true;
  return String(bill.status ?? "").toLowerCase() === tab;
}

function emptyCopy(tab, t) {
  if (tab === "pending_verification") {
    return { title: t("services.serviceBillsEmptyPendingTitle"), body: t("services.serviceBillsEmptyPendingBody") };
  }
  if (tab === "overdue") {
    return { title: t("services.serviceBillsEmptyOverdueTitle"), body: t("services.serviceBillsEmptyOverdueBody") };
  }
  if (tab === "paid") {
    return { title: t("services.serviceBillsEmptyPaidTitle"), body: t("services.serviceBillsEmptyPaidBody") };
  }
  return { title: t("services.serviceBillsEmptyTitle"), body: t("services.serviceBillsEmptyBody") };
}

function BillCard({ bill, busy, onApprove, onReject, t }) {
  const status = statusMeta(bill, t);
  const due = formatDueDate(bill.due_date);
  const reviewable = canReviewBill(bill);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>
          <Feather name="file-text" size={sf(18)} color={PropertyHubTheme.pendingText} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.billTitle} numberOfLines={2}>
            {bill.service_name || bill.title}
          </Text>
          <Text style={styles.billMeta} numberOfLines={1}>
            {t("services.serviceBillsUnit", { number: bill.unit_number || "—" })}
            {bill.billing_contact?.name ? ` · ${bill.billing_contact.name}` : ""}
          </Text>
        </View>
        <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
          <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatAmount(bill.amount)}</Text>
        </View>
        {due ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{t("services.unitBillsDue", { date: due })}</Text>
          </View>
        ) : null}
        {billingFrequencyLabel(bill.billing_frequency, t) ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{billingFrequencyLabel(bill.billing_frequency, t)}</Text>
          </View>
        ) : null}
        {bill.category ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{serviceCategoryLabel(bill.category)}</Text>
          </View>
        ) : null}
      </View>

      {bill.acknowledged_at ? (
        <Text style={styles.ackLine}>
          {t("services.serviceBillsAcknowledgedLine", {
            name: bill.acknowledged_by_name || bill.billing_contact?.name || t("services.serviceBillsMember"),
            when: formatAcknowledgedAt(bill.acknowledged_at),
            bill: bill.title || bill.service_name || "",
          })}
        </Text>
      ) : null}

      {reviewable ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onApprove}
            disabled={busy}
            style={[styles.approveBtn, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.approveText}>{t("services.serviceBillsApprove")}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onReject}
            disabled={busy}
            style={[styles.rejectBtn, busy && styles.disabled]}
          >
            <Text style={styles.rejectText}>{t("services.serviceBillsReject")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function AdminServiceBillsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { runAction, dialog, showFailure } = useApiAction();
  const [bills, setBills] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      setBills(await fetchAdminServiceBills("all"));
    } catch (error) {
      await showFailure(t("services.serviceBillsTitle"), error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, showFailure]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = useMemo(() => bills.filter((bill) => billMatchesTab(bill, tab)), [bills, tab]);
  const pendingCount = useMemo(
    () => bills.filter((bill) => String(bill.status ?? "").toLowerCase() === "pending_verification").length,
    [bills],
  );
  const empty = emptyCopy(tab, t);

  async function handleApprove(bill) {
    setBusyId(bill.id);
    await runAction({
      action: () => approveAdminServiceBill(bill.id),
      successTitle: t("services.serviceBillsApprovedTitle"),
      successMessage: t("services.serviceBillsApprovedMsg"),
      errorTitle: t("services.serviceBillsCouldNotReview"),
      onSuccess: () => load({ silent: true }),
    });
    setBusyId(null);
  }

  async function handleReject(bill) {
    const choice = await dialog.showConfirm(
      t("services.serviceBillsRejectTitle"),
      t("services.serviceBillsRejectMsg"),
      { confirmLabel: t("services.serviceBillsReject"), destructive: true },
    );
    if (choice !== "confirm") return;
    setBusyId(bill.id);
    await runAction({
      action: () => rejectAdminServiceBill(bill.id, "unclear_proof"),
      successTitle: t("services.serviceBillsRejectedTitle"),
      successMessage: t("services.serviceBillsRejectedMsg"),
      errorTitle: t("services.serviceBillsCouldNotReview"),
      onSuccess: () => load({ silent: true }),
    });
    setBusyId(null);
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.serviceBillsTitle")}
        subtitle={t("services.serviceBillsSub")}
        right={
          <Pressable
            onPress={() => router.push(PropertyManagementRoutes.ADMIN_SERVICE_FORM)}
            style={styles.addBtn}
          >
            <Feather name="plus" size={sf(16)} color="#1B4F8A" />
            <Text style={styles.addBtnText}>{t("propertyMgmt.addBtn")}</Text>
          </Pressable>
        }
      />

      {loading && bills.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PropertyHubTheme.teal} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              tintColor={PropertyHubTheme.teal}
            />
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {TABS.map((item) => {
              const active = tab === item.id;
              const count = item.id === "pending_verification" ? pendingCount : null;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setTab(item.id)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {t(item.labelKey)}
                    {count ? ` (${count})` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="file-text" size={sf(22)} color={PropertyHubTheme.pendingText} />
              </View>
              <Text style={styles.emptyTitle}>{empty.title}</Text>
              <Text style={styles.emptyBody}>{empty.body}</Text>
            </View>
          ) : (
            visible.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                busy={busyId === bill.id}
                onApprove={() => void handleApprove(bill)}
                onReject={() => void handleReject(bill)}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = {
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(12),
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingVertical: sw(6),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  addBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#1B4F8A",
  },
  tabs: {
    flexDirection: "row",
    gap: sw(8),
    paddingBottom: sw(4),
  },
  tab: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    backgroundColor: PropertyHubTheme.surface,
  },
  tabActive: {
    backgroundColor: PropertyHubTheme.mint,
    borderColor: PropertyHubTheme.iconBorder,
  },
  tabText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.textMuted,
  },
  tabTextActive: {
    color: PropertyHubTheme.deepTeal,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    paddingHorizontal: sw(20),
    paddingVertical: sw(28),
  },
  emptyIcon: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    backgroundColor: PropertyHubTheme.pendingBadgeBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: PropertyHubTheme.text,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.textMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    padding: sw(16),
    ...rnShadow({ color: PropertyHubTheme.text, offset: { width: 0, height: 2 }, opacity: 0.04, radius: 8 }),
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  iconWell: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    backgroundColor: PropertyHubTheme.pendingBg,
    borderColor: PropertyHubTheme.pendingBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(1),
  },
  billTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: PropertyHubTheme.text,
  },
  ackLine: {
    marginTop: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: PropertyHubTheme.textMuted,
  },
  billMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderWidth: 1,
    flexShrink: 0,
  },
  status_success: {
    backgroundColor: PropertyHubTheme.successBg,
    borderColor: PropertyHubTheme.successBorder,
  },
  status_pending: {
    backgroundColor: PropertyHubTheme.pendingBadgeBg,
    borderColor: PropertyHubTheme.pendingBorder,
  },
  status_danger: {
    backgroundColor: PropertyHubTheme.dangerBg,
    borderColor: PropertyHubTheme.dangerBorder,
  },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  statusText_success: { color: PropertyHubTheme.successText },
  statusText_pending: { color: PropertyHubTheme.pendingText },
  statusText_danger: { color: PropertyHubTheme.dangerText },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginTop: sw(14),
  },
  chip: {
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.deepTeal,
  },
  chipMuted: {
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
  },
  chipMutedText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: sw(14),
  },
  approveBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  rejectBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.dangerBorder,
    backgroundColor: PropertyHubTheme.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.dangerText,
  },
  disabled: { opacity: 0.55 },
};
