import React from "react";
import { View, StyleSheet } from "react-native";
import { ScreenBrand } from "../../constants/screen-brand";

/** Step indicator for phone → OTP auth flows (navy primary on login/signup). */
export default function AuthStepDots({ current = 1, total = 2, inline = false }) {
  return (
    <View
      style={[styles.row, inline && styles.rowInline]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}
    >
      {Array.from({ length: total }).map((_, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;

        return (
          <View
            key={step}
            style={[
              styles.dot,
              active && styles.dotActive,
              done && styles.dotDone,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 28,
  },
  rowInline: {
    justifyContent: "flex-end",
    marginBottom: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(10, 42, 67, 0.16)",
  },
  dotActive: {
    width: 24,
    backgroundColor: ScreenBrand.primary,
  },
  dotDone: {
    backgroundColor: ScreenBrand.deepTeal,
  },
});
