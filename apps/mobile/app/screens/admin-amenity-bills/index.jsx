import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import LocaleTextInput from "../../../components/ui/locale-text-input";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import AmenityPaymentProofModal from "../../../components/property/amenity-payment-proof-modal";
import FormDatePickerSheet from "../../../components/forms/form-date-picker-sheet";
import { propertyStyles } from "../../../constants/property-styles";
import { PropertyHubTheme } from "../../../constants/property-management-theme";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { Fonts } from "../../../constants/font";
import { useApiAction } from "../../../hooks/use-api-action";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import { pickImageFile } from "../../../utils/pickImage";
import {
  approveAmenityResidentPayment,
  fetchAdminAmenities,
  fetchAdminCommunityAmenityBills,
  fetchMyAmenityBills,
  publishAmenityMonthlyBill,
  rejectAmenityResidentPayment,
} from "../../../services/amenity-api";
import { getUser } from "../../../services/auth-session";
import { formatCommunityMoney } from "../../../utils/money";

const MODE_TABS = [
  { id: "receive", labelKey: "services.amenityBillsTabReceive" },
  { id: "pay", labelKey: "services.amenityBillsTabPay" },
];

const RECEIVE_KIND_OPTIONS = [
  { id: "all", labelKey: "services.amenityBillsFilterAll" },
  { id: "shared", labelKey: "services.amenityBillsTabShared" },
  { id: "booking", labelKey: "services.amenityBillsTabBooking" },
];

function currentBillingMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function defaultBillTitle(amenityName, billingMonth) {
  const [year, month] = String(billingMonth).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1, 12, 0, 0);
  const label = Number.isNaN(date.getTime())
    ? billingMonth
    : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `${amenityName} — ${label}`;
}

function defaultDueDate(billingMonth, dueDay) {
  const [year, month] = String(billingMonth).split("-");
  const day = Math.min(Math.max(Number(dueDay) || 10, 1), 28);
  if (!year || !month) return "";
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function formatAmount(amount) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return formatCommunityMoney(value);
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
  if (key === "pending_verification") {
    return { label: bill.status_label || t("services.unitBillsStatusPending"), tone: "pending" };
  }
  return { label: bill.status_label || t("services.unitBillsStatusUnpaid"), tone: "pending" };
}

function canReviewBill(bill) {
  return bill.can_review === true || String(bill.status ?? "").toLowerCase() === "pending_verification";
}

function canPayBill(bill) {
  return bill.can_submit_proof === true || ["unpaid", "rejected", "overdue"].includes(String(bill.status ?? "").toLowerCase());
}

function isBookingBill(bill) {
  return Number(bill.booking_id) > 0;
}


function BillCard({ bill, busy, onApprove, onReject, onPay, t }) {
  const status = statusMeta(bill, t);
  const due = formatDueDate(bill.due_date);
  const reviewable = !onPay && canReviewBill(bill);
  const payable = Boolean(onPay) && canPayBill(bill);
  const amount = bill.amount ?? bill.resident_amount ?? bill.amount_per_resident;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWell}>
          <Feather name="file-text" size={sf(18)} color={PropertyHubTheme.pendingText} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.billTitle} numberOfLines={2}>
            {bill.amenity_name || bill.title}
          </Text>
          <Text style={styles.billMeta} numberOfLines={1}>
            {onPay
              ? (bill.title || bill.amenity_name || t("services.amenityBillsTitle"))
              : `${bill.resident_name || t("services.amenityBillsResident")}${bill.unit_number ? ` · ${t("services.serviceBillsUnit", { number: bill.unit_number })}` : ""}`}
          </Text>
        </View>
        <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
          <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatAmount(amount)}</Text>
        </View>
        {bill.billing_month_label ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{bill.billing_month_label}</Text>
          </View>
        ) : null}
        {due ? (
          <View style={styles.chipMuted}>
            <Text style={styles.chipMutedText}>{t("services.unitBillsDue", { date: due })}</Text>
          </View>
        ) : null}
      </View>

      {payable ? (
        <Pressable
          onPress={onPay}
          disabled={busy}
          style={[styles.approveBtn, busy && styles.disabled, { marginTop: sw(14) }]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.approveText}>{t("services.myAmenityBillsPay")}</Text>
          )}
        </Pressable>
      ) : reviewable ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onApprove}
            disabled={busy}
            style={[styles.approveBtn, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.approveText}>{t("services.amenityBillsApprove")}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onReject}
            disabled={busy}
            style={[styles.rejectBtn, busy && styles.disabled]}
          >
            <Text style={styles.rejectText}>{t("services.amenityBillsReject")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function PublishBillModal({ visible, amenities, submitting, onClose, onSubmit, t }) {
  const billingMonthDefault = currentBillingMonth();
  const [selectedId, setSelectedId] = useState(null);
  const [billingMonth, setBillingMonth] = useState(billingMonthDefault);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fileAsset, setFileAsset] = useState(null);
  const [duePickerOpen, setDuePickerOpen] = useState(false);

  const selected = useMemo(
    () => amenities.find((item) => Number(item.id) === Number(selectedId)) ?? null,
    [amenities, selectedId],
  );

  React.useEffect(() => {
    if (!visible) return;
    const first = amenities[0] ?? null;
    const nextId = first?.id ?? null;
    setSelectedId(nextId);
    const month = currentBillingMonth();
    setBillingMonth(month);
    if (first) {
      setTitle(defaultBillTitle(first.name, month));
      setAmount(first.shared_billing_amount != null ? String(first.shared_billing_amount) : "");
      setDueDate(defaultDueDate(month, first.shared_billing_due_day));
    } else {
      setTitle("");
      setAmount("");
      setDueDate("");
    }
    setDescription("");
    setFileAsset(null);
  }, [visible, amenities]);

  React.useEffect(() => {
    if (!selected) return;
    setTitle((current) => {
      if (current.trim()) return current;
      return defaultBillTitle(selected.name, billingMonth);
    });
    if (!amount && selected.shared_billing_amount != null) {
      setAmount(String(selected.shared_billing_amount));
    }
    if (!dueDate) {
      setDueDate(defaultDueDate(billingMonth, selected.shared_billing_due_day));
    }
  }, [selected, billingMonth, amount, dueDate]);

  async function pickAttachment() {
    const asset = await pickImageFile(undefined, { allowPdf: true });
    if (asset) setFileAsset(asset);
  }

  function handleMonthChange(value) {
    const month = String(value).trim();
    setBillingMonth(month);
    if (selected) {
      setTitle(defaultBillTitle(selected.name, month));
      setDueDate(defaultDueDate(month, selected.shared_billing_due_day));
    }
  }

  const canSubmit = selected && billingMonth && title.trim() && amount && dueDate && fileAsset?.uri;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t("services.amenityBillsPublishTitle")}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={sf(22)} color={PropertyHubTheme.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {amenities.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t("services.amenityBillsNoBillingAmenitiesTitle")}</Text>
              <Text style={styles.emptyBody}>{t("services.amenityBillsNoBillingAmenitiesBody")}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>{t("services.amenityBillsSelectAmenity")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.amenityRow}>
                {amenities.map((item) => {
                  const active = Number(item.id) === Number(selectedId);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        setSelectedId(item.id);
                        setTitle(defaultBillTitle(item.name, billingMonth));
                        setAmount(item.shared_billing_amount != null ? String(item.shared_billing_amount) : "");
                        setDueDate(defaultDueDate(billingMonth, item.shared_billing_due_day));
                      }}
                      style={[styles.amenityChip, active && styles.amenityChipActive]}
                    >
                      <Text style={[styles.amenityChipText, active && styles.amenityChipTextActive]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>{t("services.billingMonth")}</Text>
              <LocaleTextInput
                style={styles.input}
                value={billingMonth}
                onChangeText={handleMonthChange}
                placeholder="YYYY-MM"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>{t("services.amenityBillsBillTitle")}</Text>
              <LocaleTextInput style={styles.input} value={title} onChangeText={setTitle} />

              <Text style={styles.fieldLabel}>{t("services.billAmount")}</Text>
              <LocaleTextInput
                style={styles.input}
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>{t("services.billDueDate")}</Text>
              <Pressable style={styles.inputPressable} onPress={() => setDuePickerOpen(true)}>
                <Text style={dueDate ? styles.inputValue : styles.inputPlaceholder}>
                  {dueDate ? formatDueDate(dueDate) : t("services.amenityBillsPickDueDate")}
                </Text>
                <Feather name="calendar" size={sf(16)} color={PropertyHubTheme.textMuted} />
              </Pressable>

              <Text style={styles.fieldLabel}>{t("services.amenityBillsDescription")}</Text>
              <LocaleTextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Text style={styles.fieldLabel}>{t("services.amenityBillsAttachmentRequired")}</Text>
              <Pressable style={styles.attachBtn} onPress={() => void pickAttachment()}>
                <Feather name="paperclip" size={sf(16)} color={PropertyHubTheme.deepTeal} />
                <Text style={styles.attachText}>
                  {fileAsset?.name || fileAsset?.fileName || t("services.amenityBillsAttachRequired")}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          <Pressable style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            style={[styles.publishBtn, (!canSubmit || submitting) && styles.disabled]}
            disabled={!canSubmit || submitting}
            onPress={() => onSubmit({
              amenityId: selectedId,
              billingMonth,
              title,
              description,
              amountPerResident: amount,
              dueDate,
              fileAsset,
            })}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.publishText}>{t("services.amenityBillsPublishAction")}</Text>
            )}
          </Pressable>
        </View>

        <FormDatePickerSheet
          visible={duePickerOpen}
          value={dueDate}
          onCancel={() => setDuePickerOpen(false)}
          onConfirm={(value) => {
            setDuePickerOpen(false);
            if (!value) return;
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) return;
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            setDueDate(`${date.getFullYear()}-${month}-${day}`);
          }}
          title={t("services.billDueDate")}
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function AdminAmenityBillsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { runAction, dialog, showFailure } = useApiAction();
  const [bills, setBills] = useState([]);
  const [myBills, setMyBills] = useState([]);
  const [billingAmenities, setBillingAmenities] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [mode, setMode] = useState("receive");
  const [receiveKind, setReceiveKind] = useState("all");
  const [kindOpen, setKindOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [proofFor, setProofFor] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [billRows, amenityRows, payableRows, user] = await Promise.all([
        fetchAdminCommunityAmenityBills("all"),
        fetchAdminAmenities(),
        fetchMyAmenityBills().catch(() => []),
        getUser().catch(() => null),
      ]);
      setBills(Array.isArray(billRows) ? billRows : []);
      setMyBills(Array.isArray(payableRows) ? payableRows : []);
      setCurrentUserId(user?.id ?? null);
      const amenitiesList = Array.isArray(amenityRows?.data) ? amenityRows.data : (amenityRows ?? []);
      setBillingAmenities(amenitiesList.filter((item) => Boolean(item.shared_billing_enabled)));
    } catch (error) {
      await showFailure(t("services.amenityBillsTitle"), error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, showFailure]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const receiveBills = useMemo(() => bills.filter((bill) => {
    if (currentUserId && Number(bill.user_id) === Number(currentUserId)) return false;
    const booking = isBookingBill(bill);
    if (receiveKind === "all") return true;
    return receiveKind === "booking" ? booking : !booking;
  }), [bills, currentUserId, receiveKind]);

  const paying = mode === "pay";
  const receiveKindLabel = t(
    RECEIVE_KIND_OPTIONS.find((item) => item.id === receiveKind)?.labelKey
      ?? "services.amenityBillsFilterAll",
  );

  async function handleApprove(bill) {
    setBusyId(bill.resident_bill_id);
    await runAction({
      action: () => approveAmenityResidentPayment(bill.amenity_id, bill.resident_bill_id),
      successTitle: t("services.amenityBillsApprovedTitle"),
      successMessage: t("services.amenityBillsApprovedMsg"),
      errorTitle: t("services.amenityBillsCouldNotReview"),
      onSuccess: () => load({ silent: true }),
    });
    setBusyId(null);
  }

  async function handleReject(bill) {
    const choice = await dialog.showConfirm(
      t("services.amenityBillsRejectTitle"),
      t("services.amenityBillsRejectMsg"),
      { confirmLabel: t("services.amenityBillsReject"), destructive: true },
    );
    if (choice !== "confirm") return;
    setBusyId(bill.resident_bill_id);
    await runAction({
      action: () => rejectAmenityResidentPayment(bill.amenity_id, bill.resident_bill_id, "unclear_proof"),
      successTitle: t("services.amenityBillsRejectedTitle"),
      successMessage: t("services.amenityBillsRejectedMsg"),
      errorTitle: t("services.amenityBillsCouldNotReview"),
      onSuccess: () => load({ silent: true }),
    });
    setBusyId(null);
  }

  async function handlePublish(payload) {
    setPublishing(true);
    await runAction({
      action: () => publishAmenityMonthlyBill(payload.amenityId, {
        billingMonth: payload.billingMonth,
        title: payload.title,
        description: payload.description,
        amountPerResident: payload.amountPerResident,
        dueDate: payload.dueDate,
        fileAsset: payload.fileAsset,
      }),
      successTitle: t("services.amenityBillsPublishedTitle"),
      successMessage: t("services.amenityBillsPublishedMsg"),
      errorTitle: t("services.amenityBillsCouldNotPublish"),
      onSuccess: () => {
        setPublishOpen(false);
        load({ silent: true });
      },
    });
    setPublishing(false);
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.amenityBillsTitle")}
        subtitle={paying ? t("services.amenityBillsPaySub") : t("services.amenityBillsSub")}
        right={
          paying ? null : (
            <Pressable onPress={() => setPublishOpen(true)} style={styles.addBtn}>
              <Feather name="plus" size={sf(16)} color="#1B4F8A" />
              <Text style={styles.addBtnText}>{t("services.amenityBillsPublishAction")}</Text>
            </Pressable>
          )
        }
      />

      {loading && bills.length === 0 && myBills.length === 0 ? (
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {MODE_TABS.map((item) => {
              const active = mode === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setMode(item.id);
                    setKindOpen(false);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(item.labelKey)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {paying ? (
            myBills.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Feather name="file-text" size={sf(22)} color={PropertyHubTheme.pendingText} />
                </View>
                <Text style={styles.emptyTitle}>{t("services.amenityBillsPayEmptyTitle")}</Text>
                <Text style={styles.emptyBody}>{t("services.amenityBillsPayEmptyBody")}</Text>
              </View>
            ) : (
              myBills.map((bill) => (
                <BillCard
                  key={bill.resident_bill_id || bill.id}
                  bill={bill}
                  busy={busyId === (bill.resident_bill_id || bill.id)}
                  onPay={() => setProofFor(bill)}
                  t={t}
                />
              ))
            )
          ) : (
            <>
              <View style={styles.dropdownWrap}>
                <Pressable
                  onPress={() => setKindOpen((open) => !open)}
                  style={styles.dropdownBtn}
                >
                  <Text style={styles.dropdownBtnText}>{receiveKindLabel}</Text>
                  <Feather
                    name={kindOpen ? "chevron-up" : "chevron-down"}
                    size={sf(16)}
                    color={PropertyHubTheme.deepTeal}
                  />
                </Pressable>
                {kindOpen ? (
                  <View style={styles.dropdownMenu}>
                    {RECEIVE_KIND_OPTIONS.map((item) => {
                      const active = receiveKind === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            setReceiveKind(item.id);
                            setKindOpen(false);
                          }}
                          style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                        >
                          <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                            {t(item.labelKey)}
                          </Text>
                          {active ? <Feather name="check" size={sf(14)} color={PropertyHubTheme.deepTeal} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {receiveBills.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <Feather name="file-text" size={sf(22)} color={PropertyHubTheme.pendingText} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {receiveKind === "booking"
                      ? t("services.myAmenityBillsReceivedEmptyTitle")
                      : t("services.amenityBillsEmptyTitle")}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {receiveKind === "booking"
                      ? t("services.myAmenityBillsReceivedEmptyBody")
                      : t("services.amenityBillsEmptyBody")}
                  </Text>
                  {receiveKind !== "booking" ? (
                    billingAmenities.length > 0 ? (
                      <Pressable style={styles.emptyAction} onPress={() => setPublishOpen(true)}>
                        <Text style={styles.emptyActionText}>{t("services.amenityBillsPublishAction")}</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.emptyAction}
                        onPress={() => router.push(PropertyManagementRoutes.ADMIN_AMENITIES)}
                      >
                        <Text style={styles.emptyActionText}>{t("services.amenityBillsManageAmenities")}</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              ) : (
                receiveBills.map((bill) => (
                  <BillCard
                    key={bill.resident_bill_id}
                    bill={bill}
                    busy={busyId === bill.resident_bill_id}
                    onApprove={() => void handleApprove(bill)}
                    onReject={() => void handleReject(bill)}
                    t={t}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      <PublishBillModal
        visible={publishOpen}
        amenities={billingAmenities}
        submitting={publishing}
        onClose={() => setPublishOpen(false)}
        onSubmit={(payload) => void handlePublish(payload)}
        t={t}
      />

      {proofFor ? (
        <AmenityPaymentProofModal
          visible
          bill={proofFor}
          amenityId={proofFor.amenity_id}
          amenityName={proofFor.amenity_name}
          onClose={() => setProofFor(null)}
          onSubmitted={() => {
            setProofFor(null);
            void load({ silent: true });
          }}
        />
      ) : null}
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
  tabs: { flexDirection: "row", gap: sw(8), paddingBottom: sw(4) },
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
  tabTextActive: { color: PropertyHubTheme.deepTeal },
  dropdownWrap: { zIndex: 2 },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sw(44),
    paddingHorizontal: sw(14),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    backgroundColor: PropertyHubTheme.surface,
  },
  dropdownBtnText: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.text,
  },
  dropdownMenu: {
    marginTop: sw(8),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    backgroundColor: PropertyHubTheme.surface,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PropertyHubTheme.border,
  },
  dropdownItemActive: { backgroundColor: PropertyHubTheme.mint },
  dropdownItemText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: PropertyHubTheme.text,
  },
  dropdownItemTextActive: {
    fontFamily: Fonts.semiBold,
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
  emptyAction: {
    marginTop: sw(16),
    paddingHorizontal: sw(16),
    paddingVertical: sw(10),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.teal,
  },
  emptyActionText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
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
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: sw(12) },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: PropertyHubTheme.text,
  },
  cardMeta: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
  proofLink: {
    marginTop: sw(8),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.deepTeal,
  },
  reviewRow: { flexDirection: "row", gap: sw(10), marginTop: sw(14) },
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
  headerCopy: { flex: 1, minWidth: 0, paddingTop: sw(1) },
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
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  statusText_success: { color: PropertyHubTheme.successText },
  statusText_pending: { color: PropertyHubTheme.pendingText },
  statusText_danger: { color: PropertyHubTheme.dangerText },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginTop: sw(14) },
  chip: {
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  chipText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: PropertyHubTheme.deepTeal },
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
  actions: { flexDirection: "row", gap: sw(10), marginTop: sw(14) },
  approveBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },
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
  rejectText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: PropertyHubTheme.dangerText },
  disabled: { opacity: 0.55 },
  modalScreen: { flex: 1, backgroundColor: PropertyHubTheme.surface },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(16),
    paddingVertical: sw(14),
    borderBottomWidth: 1,
    borderBottomColor: PropertyHubTheme.border,
  },
  modalTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: PropertyHubTheme.text },
  modalBody: { padding: sw(16), gap: sw(10) },
  modalFooter: {
    flexDirection: "row",
    gap: sw(10),
    padding: sw(16),
    borderTopWidth: 1,
    borderTopColor: PropertyHubTheme.border,
  },
  fieldLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.text,
    marginTop: sw(4),
  },
  input: {
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: PropertyHubTheme.text,
    backgroundColor: "#FFFFFF",
  },
  textArea: { minHeight: sw(88), textAlignVertical: "top" },
  inputPressable: {
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputValue: { fontFamily: Fonts.regular, fontSize: sf(14), color: PropertyHubTheme.text },
  inputPlaceholder: { fontFamily: Fonts.regular, fontSize: sf(14), color: PropertyHubTheme.textMuted },
  amenityRow: { flexDirection: "row", gap: sw(8), paddingVertical: sw(4) },
  amenityChip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    backgroundColor: "#F8FAFC",
  },
  amenityChipActive: {
    backgroundColor: PropertyHubTheme.mint,
    borderColor: PropertyHubTheme.iconBorder,
  },
  amenityChipText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: PropertyHubTheme.textMuted },
  amenityChipTextActive: { color: PropertyHubTheme.deepTeal },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    backgroundColor: "#F8FAFC",
  },
  attachText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(13), color: PropertyHubTheme.text },
  cancelBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: PropertyHubTheme.textMuted },
  publishBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  publishText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },
};
