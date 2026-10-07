import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { billingFrequencyLabel } from "../../services/property-services-api";
import { sf, sw } from "../../utils/responsive";

const WINDOW_HEIGHT = Dimensions.get("window").height;

function formatAmount(amount) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (Number.isNaN(value)) return `$${amount}`;
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isImageInvoice(invoice) {
  const name = String(invoice?.file_name || invoice?.file_url || "").toLowerCase();
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name);
}

function InvoiceRow({ label, value, isLast = false }) {
  if (!value) return null;
  return (
    <View style={[styles.row, isLast ? styles.rowLast : null]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function needsAcknowledgeBeforePay(bill) {
  if (!bill?.require_acknowledgement) return false;
  if (bill.acknowledged_at) return false;
  const status = String(bill.status ?? "").toLowerCase();
  return ["unpaid", "overdue", "rejected"].includes(status);
}

export default function UnitBillInvoiceModal({
  visible,
  bill,
  status,
  busy = false,
  onClose,
  onPay,
  onAcknowledge,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const invoice = bill?.invoice ?? null;
  const invoiceUrl = invoice?.file_url || null;
  const rejected = String(bill?.status ?? "").toLowerCase() === "rejected";
  const rejectionReason = String(bill?.rejection_reason ?? "").trim()
    || (rejected ? t("services.unitBillsRejectedReasonFallback") : "");
  const scrollMaxHeight = Math.round(WINDOW_HEIGHT * 0.9) - sw(168) - insets.bottom;
  const invoiceRows = [
    { key: "service", label: t("services.unitBillsInvoiceService"), value: bill?.title },
    {
      key: "type",
      label: t("notices.billType"),
      value: billingFrequencyLabel(bill?.billing_frequency, t),
    },
    { key: "period", label: t("propertyMgmt.billingMonth"), value: bill?.billing_period_label },
    { key: "due", label: t("propertyMgmt.billDueDate"), value: formatDate(bill?.due_date) },
    { key: "unit", label: t("services.unitBillsInvoiceUnit"), value: bill?.unit_number },
  ].filter((row) => row.value);
  const lastInvoiceRowKey = invoiceRows[invoiceRows.length - 1]?.key;

  async function openInvoiceFile() {
    if (!invoiceUrl) return;
    try {
      await Linking.openURL(invoiceUrl);
    } catch {
      // The OS already surfaces unsupported-scheme errors.
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sw(12)) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>
                {rejected ? t("services.unitBillsRejectionTitle") : t("services.unitBillsInvoiceTitle")}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {bill?.service_name || bill?.title || t("services.unitBillsSub")}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Feather name="x" size={sf(18)} color={PropertyHubTheme.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: scrollMaxHeight }}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>{t("propertyMgmt.billAmount")}</Text>
              <Text style={styles.amount}>{formatAmount(bill?.amount)}</Text>
              {status?.label ? (
                <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
                  <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>
                    {status.label}
                  </Text>
                </View>
              ) : null}
            </View>

            {rejected && rejectionReason ? (
              <View style={styles.rejectCard}>
                <Text style={styles.rejectTitle}>{t("services.unitBillsRejectedHint")}</Text>
                <Text style={styles.rejectBody}>{rejectionReason}</Text>
              </View>
            ) : null}

            <View style={styles.detailsCard}>
              {invoiceRows.map((row) => (
                <InvoiceRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  isLast={!bill?.description && row.key === lastInvoiceRowKey}
                />
              ))}
              {bill?.description ? (
                <Text style={styles.description}>{bill.description}</Text>
              ) : null}
            </View>

            {bill?.payment_instructions ? (
              <View style={styles.noteCard}>
                <Text style={styles.noteLabel}>{t("services.unitBillsPaymentInstructions")}</Text>
                <Text style={styles.noteText}>{bill.payment_instructions}</Text>
              </View>
            ) : null}

            {invoiceUrl ? (
              <View style={styles.fileCard}>
                <Text style={styles.noteLabel}>{t("services.unitBillsInvoiceDocument")}</Text>
                {isImageInvoice(invoice) ? (
                  <Image source={{ uri: invoiceUrl }} style={styles.preview} resizeMode="contain" />
                ) : (
                  <View style={styles.pdfPreview}>
                    <Feather name="file-text" size={sf(18)} color={PropertyHubTheme.deepTeal} />
                    <Text style={styles.pdfName} numberOfLines={2}>
                      {invoice.file_name || t("services.unitBillsOpenInvoice")}
                    </Text>
                  </View>
                )}
                <Pressable onPress={() => void openInvoiceFile()} style={styles.openFileBtn}>
                  <Feather name="external-link" size={sf(14)} color={PropertyHubTheme.deepTeal} />
                  <Text style={styles.openFileText}>{t("services.unitBillsOpenInvoice")}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          {(rejected && bill?.can_submit_proof) || (!rejected && (bill?.can_submit_proof || needsAcknowledgeBeforePay(bill))) ? (
            <View style={styles.footer}>
              <Pressable
                disabled={busy}
                onPress={needsAcknowledgeBeforePay(bill) ? onAcknowledge : onPay}
                style={[styles.payBtn, busy ? styles.disabled : null]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : needsAcknowledgeBeforePay(bill) ? (
                  <Text style={styles.payText}>{t("services.unitBillsAcknowledgeThenPay")}</Text>
                ) : (
                  <>
                    <Feather name={rejected ? "upload" : "credit-card"} size={sf(15)} color="#FFFFFF" />
                    <Text style={styles.payText}>
                      {rejected ? t("services.myAmenityBillsResubmitPay") : t("services.unitBillsPayNow")}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: PropertyHubTheme.surface,
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
    paddingBottom: sw(10),
    borderBottomWidth: 1,
    borderBottomColor: PropertyHubTheme.border,
  },
  headerCopy: { flex: 1, paddingRight: sw(12) },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: PropertyHubTheme.text,
  },
  subtitle: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
  closeBtn: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(16),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  body: {
    paddingHorizontal: sw(18),
    paddingTop: sw(14),
    paddingBottom: sw(16),
    gap: sw(12),
  },
  amountCard: {
    alignItems: "center",
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
    paddingVertical: sw(18),
    paddingHorizontal: sw(16),
  },
  amountLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.deepTeal,
  },
  amount: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: sf(28),
    color: PropertyHubTheme.text,
  },
  statusBadge: {
    marginTop: sw(10),
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderWidth: 1,
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
  rejectCard: {
    backgroundColor: PropertyHubTheme.dangerBg,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.dangerBorder,
    padding: sw(14),
  },
  rejectTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.dangerText,
    marginBottom: sw(6),
  },
  rejectBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.dangerText,
  },
  detailsCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    paddingHorizontal: sw(14),
    paddingVertical: sw(6),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sw(12),
    paddingVertical: sw(10),
    borderBottomWidth: 1,
    borderBottomColor: PropertyHubTheme.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    flexShrink: 0,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: PropertyHubTheme.textMuted,
  },
  rowValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.text,
  },
  description: {
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.text,
  },
  noteCard: {
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    padding: sw(14),
  },
  noteLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
    marginBottom: sw(6),
  },
  noteText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.text,
  },
  fileCard: {
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    padding: sw(14),
  },
  preview: {
    width: "100%",
    height: sw(220),
    borderRadius: sw(10),
    backgroundColor: "#F8FAFC",
  },
  pdfPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: sw(10),
    padding: sw(12),
  },
  pdfName: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.deepTeal,
  },
  openFileBtn: {
    marginTop: sw(10),
    minHeight: sw(40),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
    backgroundColor: PropertyHubTheme.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  openFileText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.deepTeal,
  },
  footer: {
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
  },
  payBtn: {
    minHeight: sw(46),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
  },
  payText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
    textAlign: "center",
  },
  disabled: { opacity: 0.55 },
};
