import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import AmenityPaymentProofModal from "../../../../components/property/amenity-payment-proof-modal";
import KuickpayPaySheet from "../../../../components/payments/kuickpay-pay-sheet";
import BillDetailSheet from "../../../../components/payments/bill-detail-sheet";
import {
  BillCard,
  BillPayListLayout,
  defaultBillFilter,
  filterBills,
} from "../../../../components/payments/bill-list-parts";
import { PAY_NOW_ENABLED, PAYABLE } from "../../../../services/payments-api";
import { PAYMENT_RESULT_ROUTE } from "../../../../hooks/use-kuickpay-pay";
import { propertyStyles } from "../../../../constants/property-styles";
import { PropertyHubTheme } from "../../../../constants/property-management-theme";
import { Fonts } from "../../../../constants/font";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSessionUser } from "../../../../hooks/use-session-user";
import { sf, sw } from "../../../../utils/responsive";
import { rnShadow } from "../../../../utils/shadow";
import { billListFields, buildBillDocument, canPayBill, sortBills, summarizeBills } from "../../../../utils/bill-document";
import {
  acknowledgeServiceBill,
  fetchServiceBills,
  resolveViewerBillingAccess,
  submitServiceBillProof,
} from "../../../../services/property-services-api";

function needsAcknowledgeBeforePay(bill) {
  if (!bill?.require_acknowledgement || bill.acknowledged_at) return false;
  return ["unpaid", "overdue", "rejected"].includes(String(bill.status ?? "").toLowerCase());
}

function payActionLabel(bill, t) {
  if (needsAcknowledgeBeforePay(bill)) return t("bills.list.acknowledgeAndPay");
  if (bill.online_payment?.available) return t("bills.list.payNow");
  return String(bill.status ?? "").toLowerCase() === "rejected" ? t("bills.list.resubmitProof") : t("bills.list.uploadProof");
}

function showPayAction(bill) {
  if (!canPayBill(bill)) return false;
  if (PAY_NOW_ENABLED) return true;
  if (needsAcknowledgeBeforePay(bill) || bill.online_payment?.available) return false;
  return true;
}

function UnitFilterMenu({ units, value, onChange, billCounts, t }) {
  const options = useMemo(
    () => [
      { id: "all", label: t("services.unitBillsFilterAll"), count: billCounts.all ?? 0 },
      ...units.map((unit) => ({
        id: unit.id,
        label: String(unit.unit_number || ""),
        count: billCounts[String(unit.id)] ?? 0,
      })),
    ],
    [units, billCounts, t],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.unitChips}
    >
      {options.map((option) => {
        const active = String(value) === String(option.id);
        return (
          <Pressable
            key={String(option.id)}
            onPress={() => {
              if (!active) onChange(option.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.unitChip, active && styles.unitChipOn]}
          >
            <Text style={[styles.unitChipText, active && styles.unitChipTextOn]} numberOfLines={1}>
              {option.label}
            </Text>
            <View style={[styles.unitChipCount, active && styles.unitChipCountOn]}>
              <Text style={[styles.unitChipCountText, active && styles.unitChipCountTextOn]}>
                {option.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function UnitBillsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { dialog, runAction, showFailure } = useApiAction();
  const sessionUser = useSessionUser();
  const [bills, setBills] = useState([]);
  const [detailFor, setDetailFor] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isContact, setIsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [billingUnits, setBillingUnits] = useState([]);
  const [unitFilterId, setUnitFilterId] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState(null);

  const unitFiltered = useMemo(() => {
    if (unitFilterId === "all") return bills;
    return bills.filter((bill) => String(bill.unit_id) === String(unitFilterId));
  }, [bills, unitFilterId]);
  const sorted = useMemo(() => sortBills(unitFiltered, t), [unitFiltered, t]);
  const summary = useMemo(() => summarizeBills(sorted, t), [sorted, t]);
  const activeFilter = filter ?? defaultBillFilter(summary);
  const visible = useMemo(() => filterBills(sorted, activeFilter, t), [sorted, activeFilter, t]);
  const detailDoc = useMemo(
    () => (detailFor
      ? buildBillDocument({ ...detailFor, unit_number: detailFor.unit_number || unitNumber }, { kind: "unit", user: sessionUser, communityId: detailFor.community_id, t })
      : null),
    [detailFor, sessionUser, t, unitNumber],
  );
  const showUnitFilter = billingUnits.length > 1;
  const unitBillCounts = useMemo(() => {
    const counts = { all: bills.length };
    for (const unit of billingUnits) {
      counts[String(unit.id)] = bills.filter((bill) => String(bill.unit_id) === String(unit.id)).length;
    }
    return counts;
  }, [bills, billingUnits]);
  const emptyTitle =
    bills.length > 0 && unitFilterId !== "all"
      ? t("services.unitBillsFilterEmptyTitle")
      : t("services.unitBillsEmptyTitle");
  const emptyBody =
    bills.length > 0 && unitFilterId !== "all"
      ? t("services.unitBillsFilterEmptyBody")
      : t("services.unitBillsEmptyBody");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const {
        unit,
        billingUnits: contactUnits,
        isBillingContact,
        contactName: billingContactName,
      } = await resolveViewerBillingAccess();
      setIsContact(isBillingContact);
      setContactName(billingContactName);
      setBillingUnits(contactUnits || []);
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

  function openPayment(bill) {
    setDetailFor(null);
    if (bill.online_payment?.available) setPayFor(bill);
    else setProofFor(bill);
  }

  async function acknowledgeThenPay(bill) {
    const confirmed = await dialog.showConfirm(
      t("services.unitBillsAcknowledgeTitle"),
      t("services.unitBillsAcknowledgeMessage", { title: bill.title }),
      { confirmLabel: t("bills.list.acknowledgeAndPay"), cancelLabel: t("common.cancel") },
    );
    if (confirmed !== "confirm") return;

    setBusyId(bill.id);
    let next = null;
    await runAction({
      action: async () => {
        const updated = await acknowledgeServiceBill(bill.id);
        next = {
          ...bill,
          ...(updated && typeof updated === "object" ? updated : {}),
          acknowledged_at: updated?.acknowledged_at || new Date().toISOString(),
          can_acknowledge: false,
        };
        setBills((current) => current.map((row) => (row.id === bill.id ? next : row)));
        return next;
      },
      errorTitle: t("services.unitBillsTitle"),
    });
    setBusyId(null);
    if (next) openPayment(next);
  }

  function pay(bill) {
    if (needsAcknowledgeBeforePay(bill)) {
      void acknowledgeThenPay(bill);
      return;
    }
    openPayment(bill);
  }

  const headerSubtitle = billingUnits.length > 1
    ? t("myUnits.count", { count: billingUnits.length })
    : unitNumber
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
        <>
          {sorted.length === 0 ? (
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
              {showUnitFilter ? (
                <UnitFilterMenu
                  units={billingUnits}
                  value={unitFilterId}
                  onChange={(next) => {
                    setUnitFilterId(next);
                    setFilter(null);
                  }}
                  billCounts={unitBillCounts}
                  t={t}
                />
              ) : null}
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Feather name="file-text" size={sf(22)} color={PropertyHubTheme.pendingText} />
                </View>
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptyBody}>{emptyBody}</Text>
              </View>
            </ScrollView>
          ) : (
            <BillPayListLayout
              summary={summary}
              activeFilter={activeFilter}
              onFilterChange={setFilter}
              chromeExtra={
                showUnitFilter ? (
                  <UnitFilterMenu
                    units={billingUnits}
                    value={unitFilterId}
                    onChange={(next) => {
                      setUnitFilterId(next);
                      setFilter(null);
                    }}
                    billCounts={unitBillCounts}
                    t={t}
                  />
                ) : null
              }
              t={t}
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              data={visible}
              keyExtractor={(bill) => String(bill.id)}
              renderItem={({ item: bill }) => {
                const fields = billListFields(bill, "unit");
                return (
                  <BillCard
                    bill={bill}
                    t={t}
                    busy={busyId === bill.id}
                    icon={<Feather name="home" size={sf(18)} color={PropertyHubTheme.deepTeal} />}
                    title={fields.title}
                    subtitle={
                      billingUnits.length > 1 && bill.unit_number
                        ? `${bill.unit_number} · ${fields.subtitle || ""}`.replace(/\s·\s$/, "")
                        : fields.subtitle
                    }
                    payLabel={payActionLabel(bill, t)}
                    onPay={showPayAction(bill) ? () => pay(bill) : undefined}
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
          )}
        </>
      )}

      <BillDetailSheet
        visible={Boolean(detailFor)}
        doc={detailDoc}
        primaryLabel={detailFor && showPayAction(detailFor) ? payActionLabel(detailFor, t) : null}
        primaryBusy={busyId === detailFor?.id}
        onPrimary={() => detailFor && pay(detailFor)}
        onClose={() => setDetailFor(null)}
      />
      {payFor ? (
        <KuickpayPaySheet
          visible
          payableType={PAYABLE.SERVICE_BILL}
          payableId={payFor.id}
          bill={{
            title: payFor.title,
            subtitle: [payFor.service_name, payFor.unit_number ? t("services.billingContact.unitLabel", { number: payFor.unit_number }) : null]
              .filter(Boolean).join(" · "),
            amount: payFor.amount,
            dueDate: payFor.due_date,
            isPastDue: String(payFor.status) === "overdue",
            onlinePayment: payFor.online_payment,
          }}
          onClose={() => setPayFor(null)}
          onSettled={() => load({ silent: true })}
          onUploadProof={payFor.can_submit_proof ? () => { const bill = payFor; setPayFor(null); setProofFor(bill); } : undefined}
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
            await load({ silent: true });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: sw(16),
    paddingTop: sw(16),
    justifyContent: "center",
  },
  unitChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(2),
  },
  unitChip: {
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
  unitChipOn: {
    backgroundColor: "#1B4F8A",
    borderColor: "#1B4F8A",
  },
  unitChipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.text,
  },
  unitChipTextOn: {
    color: "#FFFFFF",
  },
  unitChipCount: {
    minWidth: sw(22),
    height: sw(22),
    borderRadius: 999,
    paddingHorizontal: sw(6),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  unitChipCountOn: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  unitChipCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: PropertyHubTheme.textMuted,
  },
  unitChipCountTextOn: {
    color: "#FFFFFF",
  },
  list: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(32),
    gap: sw(14),
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
  primaryBtn: {
    marginTop: sw(14),
    minHeight: sw(44),
    alignSelf: "stretch",
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.text,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});
