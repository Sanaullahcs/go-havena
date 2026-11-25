import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Fonts } from "../../constants/font";
import { HavenaColors as C } from "../../constants/color-scheme";

const DEFAULT_SOLID = C.accent.main;
const DEFAULT_LOADING = "rgba(232, 120, 46, 0.88)";

/**
 * Primary CTA for auth/onboarding screens — warm orange accent.
 */
export default function AuthSubmitButton({
  label,
  loadingLabel,
  onPress,
  enabled = true,
  loading = false,
  solidColor = DEFAULT_SOLID,
  loadingColor = DEFAULT_LOADING,
  style,
  textStyle,
}) {
  const active = enabled && !loading;
  const displayLabel = loading ? loadingLabel ?? label : label;

  let inner;
  if (loading) {
    inner = (
      <View
        style={[
          styles.button,
          { backgroundColor: loadingColor },
          styles.row,
          style,
        ]}
      >
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={[styles.buttonText, textStyle]}>{displayLabel}</Text>
      </View>
    );
  } else if (active) {
    inner = (
      <View style={[styles.button, { backgroundColor: solidColor }, style]}>
        <Text style={[styles.buttonText, textStyle]}>{label}</Text>
      </View>
    );
  } else {
    inner = (
      <View style={[styles.button, styles.buttonDisabled, style]}>
        <Text style={[styles.buttonText, textStyle]}>{label}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={active ? 0.9 : 1}
      onPress={onPress}
      disabled={!active}
      style={styles.touch}
    >
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: "100%",
    alignSelf: "stretch",
  },
  button: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: Fonts.semiBold,
    textAlign: "center",
    includeFontPadding: true,
  },
});
