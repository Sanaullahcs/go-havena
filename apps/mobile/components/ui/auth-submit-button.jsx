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

const DEFAULT_SOLID = C.primary.main;
const DEFAULT_LOADING = "rgba(20, 184, 166, 0.88)";

/**
 * Primary CTA for auth/onboarding screens — solid Havena teal, no gradients.
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
