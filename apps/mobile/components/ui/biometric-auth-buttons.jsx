import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export default function BiometricAuthButtons({
  onFingerprint,
  onFaceId,
  disabled = false,
  showFingerprint = true,
  showFaceId = true,
}) {
  const { t } = useTranslation();
  if (!showFingerprint && !showFaceId) return null;

  const faceLabel =
    Platform.OS === "ios" ? t("biometric.signInFaceId") : t("biometric.signInFaceUnlock");
  const fingerLabel =
    Platform.OS === "ios" ? t("biometric.signInTouchId") : t("biometric.signInFingerprint");

  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {showFingerprint ? (
        <Pressable
          onPress={onFingerprint}
          disabled={disabled}
          accessibilityLabel={fingerLabel}
          style={({ pressed }) => [styles.btn, pressed && !disabled && styles.pressed]}
        >
          <View style={[styles.iconWrap, styles.fingerWrap]}>
            <Ionicons name="finger-print" size={28} color="#0A2A43" />
          </View>
        </Pressable>
      ) : null}
      {showFaceId ? (
        <Pressable
          onPress={onFaceId}
          disabled={disabled}
          accessibilityLabel={faceLabel}
          style={({ pressed }) => [styles.btn, pressed && !disabled && styles.pressed]}
        >
          <View style={[styles.iconWrap, styles.faceWrap]}>
            <Ionicons name="scan" size={28} color="#10B981" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  btn: {
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  fingerWrap: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  faceWrap: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
});
