import React from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";

const RADIUS = sw(12);

export default function HomeSectionCard({
  style,
  contentStyle,
  children,
  shadowOpacity = 0.04,
  shadowRadius = 4,
  ...pressableProps
}) {
  return (
    <Pressable
      style={[
        styles.shell,
        rnShadow({
          color: T.navy,
          offset: { width: 0, height: 1 },
          opacity: shadowOpacity,
          radius: shadowRadius,
        }),
        style,
      ]}
      {...pressableProps}
    >
      <View style={[styles.surface, contentStyle]}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: RADIUS,
    backgroundColor: Platform.OS === "android" ? "transparent" : T.white,
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
