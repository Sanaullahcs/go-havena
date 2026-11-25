import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { createPaymentReturnUrl } from "../constants/app-linking";
import { startPayment } from "../services/payments-api";
import { formatMoney } from "../utils/money";
import { wasPaymentResultShown } from "../utils/payment-result-registry";
import { useApiAction } from "./use-api-action";

export const PAYMENT_RESULT_ROUTE = "/screens/payment-result";

/**
 * Pay Now with KuickPay. Opens the hosted checkout in an in-app browser and
 * always lands on the result screen, which asks the server for the real
 * outcome — a browser redirect alone never marks a bill paid.
 */
export function useKuickpayPay() {
  const router = useRouter();
  const { t } = useTranslation();
  const { dialog, showFailure } = useApiAction();
  const [payingKey, setPayingKey] = useState(null);
  const lockRef = useRef(false);

  const openResult = useCallback((id, { sync = false } = {}) => {
    if (!id || wasPaymentResultShown(id)) return;
    router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id, ...(sync ? { sync: "1" } : {}) } });
  }, [router]);

  const openCheckout = useCallback(async (url, paymentId) => {
    const returnUrl = createPaymentReturnUrl();
    // Plain-http LAN API (local sandbox): Custom Tabs can close instantly, so use the system browser.
    if (/^http:\/\//i.test(url)) {
      await Linking.openURL(url);
      openResult(paymentId, { sync: true });
      return;
    }

    try {
      await WebBrowser.openAuthSessionAsync(url, returnUrl, {
        preferEphemeralSession: true,
        showInRecents: true,
        createTask: false,
      });
    } catch {
      await WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true });
    }

    // Give a deep-link navigation a moment to land so we do not stack two result screens.
    setTimeout(() => openResult(paymentId, { sync: true }), 350);
  }, [openResult]);

  const pay = useCallback(async ({ payableType, payableId, expectedAmountPaisa, onSettled }) => {
    if (lockRef.current) return null;
    lockRef.current = true;
    setPayingKey(`${payableType}:${payableId}`);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const appReturnUrl = createPaymentReturnUrl();
      let result;
      try {
        result = await startPayment({ payableType, payableId, appReturnUrl, expectedAmountPaisa });
      } catch (error) {
        if (error?.code !== "amount_changed") throw error;
        const nextPaisa = Number(error?.meta?.amount_paisa ?? 0);
        const choice = await dialog.showConfirm(
          t("payments.amountChangedTitle"),
          t("payments.amountChangedBody", { amount: formatMoney(nextPaisa / 100, "PKR") }),
          { confirmLabel: t("payments.payAmount", { amount: formatMoney(nextPaisa / 100, "PKR") }) },
        );
        if (choice !== "confirm") {
          onSettled?.();
          return { outcome: "amount_changed" };
        }
        result = await startPayment({ payableType, payableId, appReturnUrl, expectedAmountPaisa: nextPaisa });
      }

      if (result?.outcome === "already_paid") {
        await dialog.showSuccess(t("payments.alreadyPaidTitle"), result.message || t("payments.alreadyPaidBody"));
        onSettled?.();
        return result;
      }
      if (result?.outcome === "processing") {
        openResult(result.payment?.id);
        return result;
      }

      const url = result?.next_action?.url;
      if (!url) {
        throw new Error(t("payments.couldNotStartBody"));
      }
      await openCheckout(url, result.payment.id);
      return result;
    } catch (error) {
      await showFailure(t("payments.couldNotStartTitle"), error);
      return null;
    } finally {
      lockRef.current = false;
      setPayingKey(null);
    }
  }, [dialog, openCheckout, openResult, showFailure, t]);

  const resume = useCallback(async (payment) => {
    if (!payment?.resume_url) return;
    await openCheckout(payment.resume_url, payment.id);
  }, [openCheckout]);

  const isPaying = useCallback(
    (payableType, payableId) => payingKey === `${payableType}:${payableId}`,
    [payingKey],
  );

  return { pay, resume, isPaying, busy: payingKey !== null };
}
