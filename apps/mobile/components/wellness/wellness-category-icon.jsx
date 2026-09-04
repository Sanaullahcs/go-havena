import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { getWellnessVisual } from "../../constants/wellness-visuals";
import { sw } from "../../utils/responsive";
import WellnessCoverImage from "./wellness-cover-image";

/** Soft-tint Feather icon tile — uploaded photo when available. */
export default function WellnessCategoryIcon({
  categoryKey,
  imageUrl,
  size = sw(36),
  iconSize,
  style,
  soft = true,
}) {
  const meta = getWellnessCategoryMeta(categoryKey);
  const visual = getWellnessVisual(categoryKey, imageUrl);
  const glyphSize = iconSize ?? Math.max(14, Math.round(size * 0.44));
  const radius = Math.max(8, Math.round(size * 0.28));
  const showPhoto = Boolean(imageUrl);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: soft ? meta.bg : "#FFFFFF",
          borderWidth: soft ? 0 : 1,
          borderColor: meta.border,
        },
        style,
      ]}
    >
      {showPhoto ? (
        <WellnessCoverImage
          source={visual.image}
          fallback={visual.fallbackImage}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <Feather name={meta.icon} size={glyphSize} color={meta.color} />
      )}
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
