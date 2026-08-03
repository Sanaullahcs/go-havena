import React from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { sw } from "../../utils/responsive";

const RADIUS = sw(12);

/**
 * Home carousel card shell — iOS gets a light shadow; Android uses border only
 * (elevation + borderRadius causes dark corner smudges on Android).
 */
export default function HomeSectionCard({
  style,
  contentStyle,
  children,
  shadowOpacity = 0.04,
  shadowRadius = 4,
  ...pressableProps
}) {
  const iosShadow =
    Platform.OS === "ios" ? { shadowOpacity, shadowRadius } : null;

  return (
    <Pressable
      style={[styles.shell, iosShadow, style]}
      {...pressableProps}
    >
      <View style={[styles.surface, contentStyle]}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: RADIUS,
    ...(Platform.OS === "android"
      ? { backgroundColor: "transparent", elevation: 0 }
      : {
          backgroundColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
        }),
  },
  surface: {
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6ECEC",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    flex: 1,
    alignSelf: "stretch",
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
});
