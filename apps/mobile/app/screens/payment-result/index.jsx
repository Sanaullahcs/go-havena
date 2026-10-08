import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import BillerLogo from "../../../components/payments/biller-logo";
import ReceiptCard from "../../../components/payments/receipt-card";
import { KuickpayColors, KuickpayMark, TestModeBadge } from "../../../components/payments/kuickpay-brand";
import { Fonts } from "../../../constants/font";
import { useApiAction } from "../../../hooks/use-api-action";
import { useKuickpayPay } from "../../../hooks/use-kuickpay-pay";
import { cancelPayment, fetchPayment } from "../../../services/payments-api";
import { markPaymentResultShown } from "../../../utils/payment-result-registry";
import { sf, sw } from "../../../utils/responsive";

const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 8000;
const FAST_WINDOW_MS = 90_000;

const TONES = {
  success: { color: "#047857", bg: "#ECFDF5", ring: "#A7F3D0", icon: "check" },
  pending: { color: "#B45309", bg: "#FFFBEB", ring: "#FDE68A", icon: "clock" },
  danger: { color: "#B91C1C", bg: "#FEF2F2", ring: "#FECACA", icon: "x" },
  muted: { color: "#475569", bg: "#F1F5F9", ring: "#E2E8F0", icon: "slash" },
};

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReceiptRow({ label, value, copyable, onCopy }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueWrap}>
        <Text style={styles.rowValue} selectable numberOfLines={2}>{value}</Text>
        {copyable ? (
          <Pressable onPress={() => onCopy(value)} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
            <Feather name="copy" size={sf(13)} color="#1B4F8A" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function PaymentResultScreen() {
  const { id, sync } = useLocalSearchParams();
  const paymentId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { t } = useTranslation();
  const { dialog, showFailure } = useApiAction();
  const { resume } = useKuickpayPay();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const [sharing, setSharing] = useState(false);
  const receiptRef = useRef(null);
  const [anim] = useState(() => ({ scale: new Animated.Value(0.6), opacity: new Animated.Value(0) }));

  useEffect(() => { markPaymentResultShown(paymentId); }, [paymentId]);

  // Poll the server until the payment is final: fast at first, then gently.
  useEffect(() => {
    if (!paymentId) return undefined;
    let alive = true;
    let timer = null;
    const started = Date.now();

    async function tick(forceSync) {
      try {
        const next = await fetchPayment(paymentId, { sync: forceSync });
        if (!alive) return;
        setPayment(next);
        setError(null);
        if (next?.is_final) return;
      } catch (err) {
        if (!alive) return;
        setError(err);
      }
      const delay = Date.now() - started < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
      timer = setTimeout(() => void tick(true), delay);
    }

    void tick(sync === "1" || pollRound > 0);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      clearTimeout(timer);
      void tick(true);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, [paymentId, pollRound, sync]);

  const tone = TONES[payment?.tone] ?? TONES.pending;
  const status = payment?.status;
  const isProcessing = status === "processing";
  const isAwaiting = status === "awaiting_payment";
  const loaded = payment !== null;

  useEffect(() => {
    if (!loaded) return;
    Animated.parallel([
      Animated.spring(anim.scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(anim.opacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [anim, loaded]);

  useEffect(() => {
    if (status === "succeeded") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [status]);

  async function copy(value) {
    await Clipboard.setStringAsync(String(value));
    void Haptics.selectionAsync().catch(() => {});
  }

  async function checkAgain() {
    setChecking(true);
    try {
      setPayment(await fetchPayment(paymentId, { sync: true }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setChecking(false);
      setPollRound((round) => round + 1);
    }
  }

  async function handleCancel() {
    const choice = await dialog.showConfirm(t("payments.cancelTitle"), t("payments.cancelBody"), {
      confirmLabel: t("payments.cancelConfirm"),
      cancelLabel: t("payments.keepPaying"),
      destructive: true,
    });
    if (choice !== "confirm") return;
    setCancelling(true);
    try {
      setPayment(await cancelPayment(paymentId));
    } catch (err) {
      await showFailure(t("payments.cancelTitle"), err);
    } finally {
      setCancelling(false);
    }
  }

  async function shareReceipt() {
    const receipt = payment?.receipt;
    if (!receipt || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(receiptRef, { format: "png", quality: 1, result: "tmpfile", width: 1080 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: t("payments.receiptShareTitle"),
        });
        return;
      }
    } catch {
      // Fall back to a text receipt when the image cannot be produced.
    } finally {
      setSharing(false);
    }
    const lines = [
      t("payments.receiptShareTitle"),
      `${payment.formatted_amount} · ${payment.title}`,
      receipt.paid_to ? `${t("payments.paidTo")}: ${receipt.paid_to}` : null,
      `${t("payments.reference")}: ${receipt.reference}`,
      receipt.transaction_id ? `${t("payments.transactionId")}: ${receipt.transaction_id}` : null,
      receipt.paid_at ? `${t("payments.paidOn")}: ${formatDateTime(receipt.paid_at)}` : null,
      `${t("payments.method")}: ${receipt.method_label}`,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // The share sheet reports its own errors.
    }
  }

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/services");
  }

  if (!payment && !error) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
        <InternalScreenHeader title={t("payments.resultTitle")} />
        <View style={styles.centered}>
          <ActivityIndicator color={KuickpayColors.brand} size="large" />
          <Text style={styles.loadingText}>{t("payments.confirming")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!payment && error) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
        <InternalScreenHeader title={t("payments.resultTitle")} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={sf(28)} color={KuickpayColors.muted} />
          <Text style={styles.loadingText}>{t("payments.couldNotLoad")}</Text>
          <Pressable onPress={() => void checkAgain()} style={[styles.primaryBtn, { alignSelf: "stretch", marginHorizontal: sw(24) }]}>
            <Text style={styles.primaryText}>{t("payments.checkAgain")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const receipt = payment.receipt;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <InternalScreenHeader title={t("payments.resultTitle")} onBack={done} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.hero, { opacity: anim.opacity, transform: [{ scale: anim.scale }] }]}>
          <View style={[styles.badgeRing, { backgroundColor: tone.bg, borderColor: tone.ring }]}>
            {isProcessing || isAwaiting ? (
              <ActivityIndicator color={tone.color} size="large" />
            ) : (
              <Feather name={tone.icon} size={sf(34)} color={tone.color} />
            )}
          </View>
          <Text style={styles.statusTitle} accessibilityRole="header">{payment.status_label}</Text>
          <Text style={styles.message}>{payment.message}</Text>
          <Text style={styles.amount}>{payment.formatted_amount}</Text>
          <Text style={styles.billTitle} numberOfLines={2}>{payment.title}</Text>
          {payment.test_mode ? <View style={{ marginTop: sw(10) }}><TestModeBadge /></View> : null}
        </Animated.View>

        <View style={styles.receipt}>
          <View style={styles.receiptHead}>
            <KuickpayMark size={22} />
            <Text style={styles.receiptHeadText}>
              {receipt ? t("payments.receipt") : t("payments.paymentDetails")}
            </Text>
          </View>
          <View style={styles.perforation} />
          {payment.biller ? (
            <View style={styles.payee}>
              <BillerLogo biller={payment.biller} size={40} />
              <View style={styles.payeeBody}>
                <Text style={styles.payeeLabel}>{receipt ? t("payments.paidTo") : t("payments.payingTo")}</Text>
                <Text style={styles.payeeName} numberOfLines={2}>{payment.biller.name}</Text>
              </View>
            </View>
          ) : (
            <ReceiptRow label={t("payments.paidTo")} value={receipt?.paid_to} />
          )}
          <ReceiptRow label={t("payments.bill")} value={payment.subtitle || payment.title} />
          <ReceiptRow label={t("payments.method")} value={receipt?.method_label || payment.method_label || t("payments.kuickpay")} />
          <ReceiptRow label={t("payments.reference")} value={payment.reference} copyable onCopy={copy} />
          <ReceiptRow label={t("payments.transactionId")} value={receipt?.transaction_id} copyable onCopy={copy} />
          <ReceiptRow label={t("payments.paidOn")} value={formatDateTime(receipt?.paid_at)} />
          <ReceiptRow label={t("payments.startedOn")} value={!receipt ? formatDateTime(payment.created_at) : null} />
        </View>

        {isProcessing ? (
          <View style={styles.note}>
            <Feather name="alert-circle" size={sf(15)} color="#B45309" />
            <Text style={styles.noteText}>{t("payments.doNotPayAgain")}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {status === "succeeded" ? (
          <>
            <Pressable onPress={done} style={styles.primaryBtn}><Text style={styles.primaryText}>{t("payments.done")}</Text></Pressable>
            <Pressable onPress={() => void shareReceipt()} disabled={sharing} style={styles.secondaryBtn} accessibilityRole="button">
              {sharing ? (
                <ActivityIndicator color="#1B4F8A" />
              ) : (
                <>
                  <Feather name="share-2" size={sf(15)} color="#1B4F8A" />
                  <Text style={styles.secondaryText}>{t("payments.shareReceipt")}</Text>
                </>
              )}
            </Pressable>
          </>
        ) : isAwaiting ? (
          <>
            {payment.can_resume ? (
              <Pressable onPress={() => void resume(payment)} style={[styles.primaryBtn, { backgroundColor: KuickpayColors.brand }]}>
                <Text style={styles.primaryText}>{t("payments.continuePayment", { amount: payment.formatted_amount })}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => void handleCancel()} disabled={cancelling} style={styles.secondaryBtn}>
              {cancelling ? <ActivityIndicator color="#1B4F8A" /> : <Text style={styles.secondaryText}>{t("payments.cancelPayment")}</Text>}
            </Pressable>
          </>
        ) : isProcessing ? (
          <>
            <Pressable onPress={() => void checkAgain()} disabled={checking} style={styles.primaryBtn}>
              {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t("payments.checkAgain")}</Text>}
            </Pressable>
            <Pressable onPress={done} style={styles.secondaryBtn}><Text style={styles.secondaryText}>{t("payments.backToBills")}</Text></Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={done} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{status === "refund_pending" || status === "refunded" ? t("payments.backToBills") : t("payments.tryAgain")}</Text>
            </Pressable>
          </>
        )}
      </View>

      {receipt ? (
        <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ReceiptCard ref={receiptRef} payment={payment} t={t} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FB" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(12), padding: sw(24) },
  loadingText: { fontFamily: Fonts.medium, fontSize: sf(14), color: KuickpayColors.muted, textAlign: "center" },
  content: { padding: sw(16), paddingBottom: sw(24), gap: sw(14) },
  hero: { alignItems: "center", paddingTop: sw(12), paddingHorizontal: sw(8) },
  badgeRing: {
    width: sw(84),
    height: sw(84),
    borderRadius: sw(42),
    borderWidth: sw(6),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(14),
  },
  statusTitle: { fontFamily: Fonts.bold, fontSize: sf(20), color: KuickpayColors.ink, textAlign: "center" },
  message: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(20), color: KuickpayColors.muted, textAlign: "center", marginTop: sw(6) },
  amount: { fontFamily: Fonts.bold, fontSize: sf(32), color: KuickpayColors.ink, marginTop: sw(14) },
  billTitle: { fontFamily: Fonts.medium, fontSize: sf(13), color: KuickpayColors.muted, textAlign: "center", marginTop: sw(2) },
  receipt: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    paddingHorizontal: sw(16),
    paddingBottom: sw(6),
  },
  receiptHead: { flexDirection: "row", alignItems: "center", gap: sw(8), paddingVertical: sw(14) },
  receiptHeadText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: KuickpayColors.ink },
  perforation: { borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", marginBottom: sw(4) },
  row: { flexDirection: "row", justifyContent: "space-between", gap: sw(12), paddingVertical: sw(10) },
  rowLabel: { fontFamily: Fonts.regular, fontSize: sf(13), color: KuickpayColors.muted, flexShrink: 0 },
  rowValueWrap: { flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: sw(8) },
  rowValue: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(13), color: KuickpayColors.ink, textAlign: "right" },
  note: {
    flexDirection: "row",
    gap: sw(10),
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: sw(14),
    padding: sw(12),
  },
  noteText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(18), color: "#92400E" },
  footer: { paddingHorizontal: sw(16), paddingTop: sw(8), paddingBottom: sw(10), gap: sw(10), backgroundColor: "#F4F6FB" },
  primaryBtn: {
    minHeight: sw(50),
    borderRadius: sw(14),
    backgroundColor: "#1B4F8A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(16),
  },
  primaryText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  secondaryBtn: {
    minHeight: sw(48),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(27,79,138,0.18)",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  secondaryText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#1B4F8A" },
  offscreen: { position: "absolute", top: 0, left: -10000 },
  payee: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(12),
    marginBottom: sw(4),
    borderRadius: sw(14),
    backgroundColor: "#F8FAFC",
  },
  payeeBody: { flex: 1 },
  payeeLabel: { fontFamily: Fonts.regular, fontSize: sf(11.5), color: KuickpayColors.muted },
  payeeName: { fontFamily: Fonts.bold, fontSize: sf(14), color: KuickpayColors.ink, marginTop: sw(1) },
});
