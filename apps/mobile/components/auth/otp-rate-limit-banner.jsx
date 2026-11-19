import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { resolveOtpRateLimitMessage } from "../../utils/otp-rate-limit";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export default function OtpRateLimitBanner({
  visible = false,
  secondsLeft = 0,
  lockType = null,
  code = null,
}) {
  const { t } = useTranslation();

  if (!visible || secondsLeft <= 0) {
    return null;
  }

  const message = resolveOtpRateLimitMessage(t, { lockType, secondsLeft, code });

  return (
    <View style={styles.wrap} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "rgba(254, 242, 242, 0.95)",
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    marginBottom: sw(14),
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#DC2626",
  },
});
