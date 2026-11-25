import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "../../constants/font";
import { formatMoney } from "../../utils/money";
import { sf, sw } from "../../utils/responsive";
import { PAYMENT_RESULT_ROUTE, useKuickpayPay } from "../../hooks/use-kuickpay-pay";
import { KuickpayColors, KuickpayMark, KuickpayMethodsStrip, KuickpaySecureNote, TestModeBadge } from "./kuickpay-brand";
import Tap from "../ui/tap";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Confirmation before leaving Havena for KuickPay. Shows exactly what will be
 * charged, any payment already underway, and the voucher number for paying
 * from another banking app.
 *
 * bill: { title, subtitle, amount, dueDate, amountAfterDue, isPastDue, onlinePayment }
 */
export default function KuickpayPaySheet({
  visible,
  payableType,
  payableId,
  bill,
  onClose,
  onSettled,
  onUploadProof,
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pay, resume, isPaying } = useKuickpayPay();
  const [copied, setCopied] = useState(false);

  const online = bill?.onlinePayment ?? {};
  const active = online.active_payment ?? null;
  const processing = active?.status === "processing";
  const awaiting = active?.status === "awaiting_payment";
  const voucher = online.voucher ?? null;
  const amount = Number(bill?.amount ?? 0);
  const busy = isPaying(payableType, payableId);
  const due = formatDate(bill?.dueDate);

  async function handlePay() {
    if (processing) {
      onClose?.();
      router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id: active.id } });
      return;
    }
    // iOS cannot present the checkout browser over an open modal, so dismiss first.
    onClose?.();
    await new Promise((resolve) => setTimeout(resolve, 320));
    await pay({
      payableType,
      payableId,
      expectedAmountPaisa: Math.round(amount * 100),
      onSettled,
    });
  }

  async function copyVoucher() {
    if (!voucher?.consumer_number) return;
    await Clipboard.setStringAsync(voucher.consumer_number);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const primaryLabel = processing
    ? t("payments.viewStatus")
    : awaiting
      ? t("payments.continuePayment", { amount: formatMoney(amount, "PKR") })
      : t("payments.payAmount", { amount: formatMoney(amount, "PKR") });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel={t("common.close")} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sw(14)) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <KuickpayMark size={30} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t("payments.payWithKuickpay")}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{bill?.title}</Text>
            </View>
            <Pressable onPress={onClose} disabled={busy} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
              <Feather name="x" size={sf(18)} color={KuickpayColors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {online.test_mode ? <TestModeBadge /> : null}

            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>{t("payments.amountDue")}</Text>
              <Text style={styles.amount} accessibilityRole="text">{formatMoney(amount, "PKR")}</Text>
              {bill?.subtitle ? <Text style={styles.amountMeta} numberOfLines={2}>{bill.subtitle}</Text> : null}
              {due ? (
                <View style={[styles.duePill, bill?.isPastDue && styles.duePillLate]}>
                  <Feather name="calendar" size={sf(12)} color={bill?.isPastDue ? "#B91C1C" : KuickpayColors.muted} />
                  <Text style={[styles.dueText, bill?.isPastDue && styles.dueTextLate]}>
                    {bill?.isPastDue ? t("payments.wasDue", { date: due }) : t("payments.dueOn", { date: due })}
                  </Text>
                </View>
              ) : null}
              {bill?.isPastDue && bill?.amountAfterDue ? (
                <Text style={styles.lateNote}>{t("payments.lateAmountIncluded")}</Text>
              ) : null}
            </View>

            {processing ? (
              <View style={[styles.banner, styles.bannerPending]}>
                <ActivityIndicator size="small" color="#B45309" />
                <Text style={styles.bannerText}>{t("payments.processingBanner")}</Text>
              </View>
            ) : awaiting ? (
              <View style={[styles.banner, styles.bannerInfo]}>
                <Feather name="clock" size={sf(15)} color="#1B4F8A" />
                <Text style={[styles.bannerText, { color: "#1E3A8A" }]}>{t("payments.resumeBanner")}</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t("payments.payUsing")}</Text>
              <KuickpayMethodsStrip />
              <Text style={styles.sectionHint}>{t("payments.chooseOnNextScreen")}</Text>
            </View>

            <KuickpaySecureNote />

            {voucher ? (
              <View style={styles.voucher}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.voucherLabel}>{t("payments.voucherTitle")}</Text>
                  <Text style={styles.voucherNumber} selectable>{voucher.display}</Text>
                  <Text style={styles.voucherHint}>{t("payments.voucherHint")}</Text>
                </View>
                <Pressable onPress={() => void copyVoucher()} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={t("payments.copyVoucher")}>
                  <Feather name={copied ? "check" : "copy"} size={sf(15)} color={copied ? "#047857" : "#1B4F8A"} />
                  <Text style={[styles.copyText, copied && { color: "#047857" }]}>{copied ? t("payments.copied") : t("payments.copy")}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Tap
              onPress={() => void handlePay()}
              disabled={busy || amount <= 0}
              style={styles.payBtn}
              pressedStyle={styles.payBtnPressed}
              disabledStyle={styles.disabled}
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy || amount <= 0 }}
            >
              {busy ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.payText}>{t("payments.openingKuickpay")}</Text>
                </>
              ) : (
                <>
                  <Feather name={processing ? "activity" : "lock"} size={sf(16)} color="#FFFFFF" />
                  <Text style={styles.payText}>{primaryLabel}</Text>
                </>
              )}
            </Tap>
            {awaiting && !busy ? (
              <Pressable
                onPress={async () => {
                  onClose?.();
                  await new Promise((resolve) => setTimeout(resolve, 320));
                  await resume(active);
                }}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>{t("payments.reopenCheckout")}</Text>
              </Pressable>
            ) : null}
            {onUploadProof && !processing ? (
              <Pressable onPress={onUploadProof} disabled={busy} style={styles.linkBtn}>
                <Text style={styles.linkMuted}>{t("payments.uploadProofInstead")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(24),
    borderTopRightRadius: sw(24),
    overflow: "hidden",
  },
  grabber: { alignSelf: "center", width: sw(40), height: sw(4), borderRadius: 999, backgroundColor: "#E2E8F0", marginTop: sw(8) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(18),
    paddingTop: sw(12),
    paddingBottom: sw(12),
  },
  title: { fontFamily: Fonts.bold, fontSize: sf(17), color: KuickpayColors.ink },
  subtitle: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, marginTop: sw(1) },
  closeBtn: { width: sw(34), height: sw(34), borderRadius: sw(17), alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  body: { paddingHorizontal: sw(18), paddingBottom: sw(12), gap: sw(14) },
  amountCard: {
    alignItems: "center",
    borderRadius: sw(18),
    paddingVertical: sw(20),
    paddingHorizontal: sw(16),
    backgroundColor: KuickpayColors.brandSoft,
    borderWidth: 1,
    borderColor: KuickpayColors.brandBorder,
  },
  amountLabel: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: KuickpayColors.brandDark, letterSpacing: 0.4 },
  amount: { fontFamily: Fonts.bold, fontSize: sf(34), color: KuickpayColors.ink, marginTop: sw(2) },
  amountMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, textAlign: "center", marginTop: sw(2) },
  duePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(10),
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: KuickpayColors.line,
  },
  duePillLate: { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  dueText: { fontFamily: Fonts.medium, fontSize: sf(12), color: KuickpayColors.muted },
  dueTextLate: { color: "#B91C1C" },
  lateNote: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#B91C1C", marginTop: sw(6), textAlign: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: sw(10), borderRadius: sw(14), padding: sw(12), borderWidth: 1 },
  bannerPending: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  bannerInfo: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  bannerText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(18), color: "#92400E" },
  section: { gap: sw(8) },
  sectionLabel: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: KuickpayColors.muted, letterSpacing: 0.4 },
  sectionHint: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8" },
  voucher: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderRadius: sw(14),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    padding: sw(12),
    backgroundColor: "#F8FAFC",
  },
  voucherLabel: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: KuickpayColors.ink },
  voucherNumber: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#1B4F8A", letterSpacing: 0.6, marginTop: sw(2) },
  voucherHint: { fontFamily: Fonts.regular, fontSize: sf(11), lineHeight: sf(16), color: KuickpayColors.muted, marginTop: sw(2) },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    backgroundColor: "#E8F0F7",
  },
  copyText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#1B4F8A" },
  footer: { paddingHorizontal: sw(18), paddingTop: sw(6), gap: sw(4) },
  payBtn: {
    minHeight: sw(52),
    borderRadius: sw(16),
    backgroundColor: KuickpayColors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(10),
  },
  payBtnPressed: { backgroundColor: KuickpayColors.brandDark },
  payText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  disabled: { opacity: 0.6 },
  linkBtn: { alignItems: "center", paddingVertical: sw(10) },
  linkText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#1B4F8A" },
  linkMuted: { fontFamily: Fonts.medium, fontSize: sf(13), color: KuickpayColors.muted },
});
