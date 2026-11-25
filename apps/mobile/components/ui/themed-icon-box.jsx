import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";

const SIZES = {
  xs: { box: sw(28), radius: sw(8), icon: sf(12) },
  sm: { box: sw(32), radius: sw(10), icon: sf(13) },
  md: { box: sw(38), radius: sw(11), icon: sf(15) },
  lg: { box: sw(44), radius: sw(12), icon: sf(18) },
};

/** Profile-style icon tile — soft fill, rounded square, brand Feather glyph. */
export default function ThemedIconBox({
  name,
  size = "md",
  color = Colors.brandPrimaryDeep,
  backgroundColor = "#D1FAF5",
  style,
}) {
  const dim = SIZES[size] ?? SIZES.md;

  return (
    <View
      style={[
        styles.box,
        {
          width: dim.box,
          height: dim.box,
          borderRadius: dim.radius,
          backgroundColor,
        },
        style,
      ]}
    >
      <Feather name={name} size={dim.icon} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
