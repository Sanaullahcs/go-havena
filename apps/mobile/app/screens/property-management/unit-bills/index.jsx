import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import AmenityPaymentProofModal from "../../../../components/property/amenity-payment-proof-modal";
import UnitBillInvoiceModal from "../../../../components/property/unit-bill-invoice-modal";
import { propertyStyles } from "../../../../constants/property-styles";
import { PropertyHubTheme } from "../../../../constants/property-management-theme";
import { Fonts } from "../../../../constants/font";
import { useApiAction } from "../../../../hooks/use-api-action";
import { sf, sw } from "../../../../utils/responsive";
import { rnShadow } from "../../../../utils/shadow";
import {
  acknowledgeServiceBill,
  billingFrequencyLabel,
  fetchServiceBills,
  resolveViewerBillingAccess,
  submitServiceBillProof,
} from "../../../../services/property-services-api";
import { isRejectedBillStatus } from "../../../../constants/payment-rejection";

function formatAmount(amount) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (Number.isNaN(value)) return `$${amount}`;
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

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
  if (key === "acknowledged" || key === "pending_verification") {
    return {
      label: bill.status_label || (key === "acknowledged"
        ? t("services.unitBillsStatusAcknowledged")
        : t("services.unitBillsStatusPending")),
      tone: key === "acknowledged" ? "success" : "pending",
    };
  }
  return { label: bill.status_label || t("services.unitBillsStatusUnpaid"), tone: "pending" };
}

function billWasAcknowledged(bill) {
  if (bill?.acknowledged_at) return true;
  const status = String(bill.status ?? "").toLowerCase();
  return ["acknowledged", "pending_verification", "paid"].includes(status);
}

function isRejectedBill(bill) {
  return isRejectedBillStatus(bill?.status);
}

function mergeAcknowledgedBill(bill, updated) {
  const next = updated && typeof updated === "object" ? { ...bill, ...updated } : { ...bill };
  return {
    ...next,
    status: next.status || "acknowledged",
    acknowledged_at: next.acknowledged_at || new Date().toISOString(),
    can_acknowledge: false,
    require_acknowledgement: next.require_acknowledgement ?? true,
  };
}

function BillCard({ bill, busy, onAcknowledge, onViewInvoice, onViewReason, t }) {
  const status = statusMeta(bill, t);
  const due = formatDueDate(bill.due_date);
  const acknowledged = billWasAcknowledged(bill);
  const rejected = isRejectedBill(bill);
  const rejectionReason = String(bill.rejection_reason ?? "").trim();
  const showAcknowledgeButton = Boolean(bill.can_acknowledge) && !acknowledged;
  const showAcknowledged = !showAcknowledgeButton && !rejected
    && (acknowledged || Boolean(bill.require_acknowledgement && !bill.can_acknowledge));
  const viewActionPrimary = !showAcknowledgeButton && !showAcknowledged && Boolean(bill.can_submit_proof);
  const viewActionHandler = rejected ? onViewReason : onViewInvoice;
  const viewActionLabel = rejected ? t("services.unitBillsViewReason") : t("services.unitBillsViewInvoice");
  const viewActionIcon = rejected ? "alert-circle" : "file-text";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>
          <Feather name="file-text" size={sf(18)} color={PropertyHubTheme.text} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.billTitle} numberOfLines={2}>{bill.title}</Text>
          <Text style={styles.billMeta} numberOfLines={1}>
            {bill.service_name || bill.billing_period_label || t("services.unitBillsSub")}
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
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t("services.unitBillsDue", { date: due })}</Text>
          </View>
        ) : null}
        {billingFrequencyLabel(bill.billing_frequency, t) ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{billingFrequencyLabel(bill.billing_frequency, t)}</Text>
          </View>
        ) : null}
        {bill.billing_period_label ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{bill.billing_period_label}</Text>
          </View>
        ) : null}
      </View>

      {rejected ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectLabel}>{t("propertyMgmt.rejectionReason")}:</Text>
          <Text style={styles.rejectReason}>{rejectionReason || "—"}</Text>
        </View>
      ) : null}

      {showAcknowledgeButton ? (
        <Pressable
          disabled={busy}
          onPress={onAcknowledge}
          style={[styles.primaryBtn, busy ? styles.disabled : null]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>{t("services.unitBillsAcknowledge")}</Text>
          )}
        </Pressable>
      ) : showAcknowledged ? (
        <View style={styles.ackedSlot}>
          <Feather name="check-circle" size={sf(16)} color={PropertyHubTheme.successText} />
          <Text style={styles.ackedText}>{t("services.unitBillsStatusAcknowledged")}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={busy}
        onPress={viewActionHandler}
        style={[
          rejected
            ? styles.viewReasonBtn
            : viewActionPrimary
              ? styles.primaryBtn
              : styles.secondaryBtn,
          (showAcknowledgeButton || showAcknowledged) ? styles.followAction : styles.firstAction,
          busy ? styles.disabled : null,
        ]}
      >
        <View style={styles.actionInner}>
          <View style={styles.actionIcon}>
            <Feather
              name={viewActionIcon}
              size={sf(15)}
              color={rejected || viewActionPrimary ? "#FFFFFF" : PropertyHubTheme.deepTeal}
            />
          </View>
          <Text style={rejected || viewActionPrimary ? styles.primaryText : styles.secondaryText}>
            {viewActionLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export default function UnitBillsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { dialog, runAction, showFailure } = useApiAction();
  const [bills, setBills] = useState([]);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isContact, setIsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { unit, isBillingContact, contactName: billingContactName } = await resolveViewerBillingAccess();
      setIsContact(isBillingContact);
      setContactName(billingContactName);
      setUnitNumber(unit?.unit_number || "");
      if (!isBillingContact) {
        setBills([]);
        return;
      }
      setBills(await fetchServiceBills());
    } catch (error) {
      await showFailure(t("services.unitBillsTitle"), error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleAcknowledge(bill) {
    const confirmed = await dialog.showConfirm(
      t("services.unitBillsAcknowledgeTitle"),
      t("services.unitBillsAcknowledgeMessage", { title: bill.title }),
      { confirmLabel: t("services.unitBillsAcknowledge"), cancelLabel: t("common.cancel") },
    );
    if (confirmed !== "confirm") return;

    setBusyId(bill.id);
    await runAction({
      action: async () => {
        const updated = await acknowledgeServiceBill(bill.id);
        const next = mergeAcknowledgedBill(bill, updated);
        setBills((current) => current.map((row) => (row.id === bill.id ? next : row)));
        setInvoiceFor((current) => (current?.id === bill.id ? next : current));
        return next;
      },
      successTitle: t("services.unitBillsAcknowledgeSuccessTitle"),
      successMessage: t("services.unitBillsAcknowledgeSuccess"),
      errorTitle: t("services.unitBillsTitle"),
      onSuccess: () => load({ silent: true }),
    });
    setBusyId(null);
  }

  const headerSubtitle = unitNumber
    ? t("services.billingContact.unitLabel", { number: unitNumber })
    : t("services.unitBillsSub");

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title={t("services.unitBillsTitle")} subtitle={headerSubtitle} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PropertyHubTheme.teal} />
        </View>
      ) : !isContact ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Feather name="user-x" size={sf(22)} color={PropertyHubTheme.pendingText} />
            </View>
            <Text style={styles.emptyTitle}>{t("services.unitBillsContactOnlyTitle")}</Text>
            <Text style={styles.emptyBody}>
              {contactName
                ? t("services.unitBillsContactOnlyHintNamed", { name: contactName })
                : t("services.unitBillsContactOnlyHint")}
            </Text>
            <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{t("common.back")}</Text>
            </Pressable>
          </View>
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
          <View style={styles.noteCard}>
            <Feather name="info" size={sf(14)} color={PropertyHubTheme.teal} />
            <Text style={styles.noteText}>{t("services.unitBillsContactIntro")}</Text>
          </View>

          {bills.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="file-text" size={sf(22)} color={PropertyHubTheme.pendingText} />
              </View>
              <Text style={styles.emptyTitle}>{t("services.unitBillsEmptyTitle")}</Text>
              <Text style={styles.emptyBody}>{t("services.unitBillsEmptyBody")}</Text>
            </View>
          ) : (
            bills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                busy={busyId === bill.id}
                onAcknowledge={() => void handleAcknowledge(bill)}
                onViewInvoice={() => setInvoiceFor(bill)}
                onViewReason={() => setInvoiceFor(bill)}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}
      {invoiceFor ? (
        <UnitBillInvoiceModal
          visible
          bill={invoiceFor}
          status={statusMeta(invoiceFor, t)}
          busy={busyId === invoiceFor.id}
          onClose={() => setInvoiceFor(null)}
          onAcknowledge={() => void handleAcknowledge(invoiceFor)}
          onPay={() => setProofFor(invoiceFor)}
        />
      ) : null}
      {proofFor ? (
        <AmenityPaymentProofModal
          visible
          amenityName={proofFor.service_name || proofFor.title}
          bill={proofFor}
          onClose={() => setProofFor(null)}
          submitProof={async (payload) => submitServiceBillProof(proofFor.id, payload)}
          onSubmitted={async () => {
            setProofFor(null);
            setInvoiceFor(null);
            await load({ silent: true });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = {
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: sw(16),
    paddingTop: sw(16),
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(12),
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
    padding: sw(14),
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.text,
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
    backgroundColor: "#E8F0F7",
    borderColor: "rgba(27, 79, 138, 0.16)",
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
  rejectBox: {
    marginTop: sw(12),
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.dangerBg,
    borderWidth: 1,
    borderColor: PropertyHubTheme.dangerBorder,
  },
  rejectLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.dangerText,
    marginBottom: sw(4),
  },
  rejectReason: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: PropertyHubTheme.dangerText,
    lineHeight: sf(18),
  },
  ackedSlot: {
    marginTop: sw(14),
    minHeight: sw(44),
    borderRadius: sw(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: PropertyHubTheme.successBg,
    borderWidth: 1,
    borderColor: PropertyHubTheme.successBorder,
  },
  ackedText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.successText,
  },
  firstAction: {
    marginTop: sw(14),
  },
  followAction: {
    marginTop: sw(10),
  },
  primaryBtn: {
    marginTop: sw(14),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.text,
    alignItems: "center",
    justifyContent: "center",
  },
  viewReasonBtn: {
    marginTop: sw(14),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.dangerText,
    alignItems: "center",
    justifyContent: "center",
  },
  actionInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  actionIcon: {
    width: sw(16),
    height: sw(16),
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: "#FFFFFF",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  secondaryBtn: {
    marginTop: sw(10),
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "rgba(27, 79, 138, 0.16)",
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: PropertyHubTheme.text,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  disabled: { opacity: 0.55 },
};
