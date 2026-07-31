import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "../../constants/font";

/**
 * Primary CTA for auth/onboarding screens — shows spinner and blocks repeat taps while loading.
 */
export default function AuthSubmitButton({
  label,
  loadingLabel,
  onPress,
  enabled = true,
  loading = false,
  variant = "gradient",
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
          variant === "solid" ? styles.buttonSolid : styles.buttonLoading,
          styles.row,
          style,
        ]}
      >
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={[styles.buttonText, textStyle]}>{displayLabel}</Text>
      </View>
    );
  } else if (active && variant === "gradient") {
    inner = (
      <LinearGradient
        colors={["rgba(0, 82, 223, 1)", "rgba(1, 121, 255, 1)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, style]}
      >
        <Text style={[styles.buttonText, textStyle]}>{label}</Text>
      </LinearGradient>
    );
  } else if (active && variant === "solid") {
    inner = (
      <View style={[styles.button, styles.buttonSolid, style]}>
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
    <TouchableOpacity activeOpacity={active ? 0.9 : 1} onPress={onPress} disabled={!active}>
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  buttonSolid: {
    backgroundColor: "#0B66E8",
  },
  buttonLoading: {
    backgroundColor: "rgba(0, 82, 223, 0.85)",
  },
  buttonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: Fonts.semiBold,
  },
});
