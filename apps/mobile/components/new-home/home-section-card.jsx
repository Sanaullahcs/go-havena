import React from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw } from "../../utils/responsive";

const RADIUS = sw(12);

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
          backgroundColor: T.white,
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 1 },
        }),
  },
  surface: {
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    backgroundColor: T.white,
    overflow: "hidden",
    flex: 1,
    alignSelf: "stretch",
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
});
