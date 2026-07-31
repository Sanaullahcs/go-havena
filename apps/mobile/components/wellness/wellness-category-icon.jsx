import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { sw } from "../../utils/responsive";

/** Soft-tint Feather icon tile — fixed box, centered glyph. */
export default function WellnessCategoryIcon({
  categoryKey,
  size = sw(36),
  iconSize,
  style,
  soft = true,
}) {
  const meta = getWellnessCategoryMeta(categoryKey);
  const glyphSize = iconSize ?? Math.max(14, Math.round(size * 0.44));

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.max(8, Math.round(size * 0.28)),
          backgroundColor: soft ? meta.bg : "#FFFFFF",
          borderWidth: soft ? 0 : 1,
          borderColor: meta.border,
        },
        style,
      ]}
    >
      <Feather name={meta.icon} size={glyphSize} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
