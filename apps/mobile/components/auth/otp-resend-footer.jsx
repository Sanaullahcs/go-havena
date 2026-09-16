import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

export default function OtpResendFooter({
  canResend,
  countdownLabel,
  lockType,
  resending = false,
  resendNotice = false,
  busy = false,
  onResend,
  mutedStyle,
  textStyle,
}) {
  const { t } = useTranslation();

  if (lockType === "security") {
    return (
      <Text style={[layout.footerNote, textStyle]}>
        {t("auth.otpVerifyLockedIn")}{" "}
        <Text style={layout.resendHighlight}>{countdownLabel}</Text>
      </Text>
    );
  }

  if (lockType === "resend_limit") {
    return (
      <Text style={[layout.footerNote, textStyle]}>
        {t("auth.resendAvailableIn")}{" "}
        <Text style={layout.resendHighlight}>{countdownLabel}</Text>
      </Text>
    );
  }

  if (resendNotice) {
    return (
      <Text style={[layout.footerNote, layout.resendSuccess, textStyle]}>
        {t("auth.newCodeSent")}
      </Text>
    );
  }

  if (canResend) {
    return (
      <TouchableOpacity onPress={onResend} disabled={busy || resending}>
        <Text style={[layout.footerNote, layout.resendHighlight, (busy || resending) && mutedStyle]}>
          {resending ? t("auth.resending") : t("auth.resendCode")}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <Text style={[layout.footerNote, textStyle]}>
      {t("auth.resendAvailableIn") + " "}
      <Text style={layout.resendHighlight}>{countdownLabel}</Text>
    </Text>
  );
}
