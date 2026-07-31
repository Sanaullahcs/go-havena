import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function BiometricAuthButtons({
  onFingerprint,
  onFaceId,
  disabled = false,
  showFingerprint = true,
  showFaceId = true,
}) {
  if (!showFingerprint && !showFaceId) return null;

  const faceLabel =
    Platform.OS === "ios" ? "Sign in with Face ID" : "Sign in with face unlock";
  const fingerLabel =
    Platform.OS === "ios" ? "Sign in with Touch ID" : "Sign in with fingerprint";

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
            <Ionicons name="finger-print" size={28} color="#0052DF" />
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
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  faceWrap: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
});
