import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";

/**
 * Shown once when the user hits the OTP resend cap (4th resend → 15-minute lock).
 * Message updates every second from the parent countdown.
 */
export default function OtpResendLimitDialog({
  visible = false,
  countdownLabel = "15:00",
  onClose,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!visible) return undefined;
    if (!countdownLabel || countdownLabel === "00:00") {
      onClose?.();
    }
    return undefined;
  }, [visible, countdownLabel, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>{t("auth.tooManyCodeRequests")}</Text>
          <Text style={styles.body}>
            {t("auth.otpResendLockLivePrefix")}{" "}
            <Text style={styles.timer}>{countdownLabel}</Text>
            {"."}
          </Text>
          <Text style={styles.hint}>{t("auth.otpResendLockLiveHint")}</Text>
          <Pressable style={styles.button} onPress={onClose} accessibilityRole="button">
            <Text style={styles.buttonText}>{t("common.ok")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: sw(28),
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: sw(18),
    paddingHorizontal: sw(20),
    paddingTop: sw(22),
    paddingBottom: sw(16),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: "#0F172A",
    marginBottom: sw(10),
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(21),
    color: "#475569",
  },
  timer: {
    fontFamily: Fonts.bold,
    color: T.deepTeal,
  },
  hint: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#94A3B8",
  },
  button: {
    marginTop: sw(18),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFF",
  },
});
