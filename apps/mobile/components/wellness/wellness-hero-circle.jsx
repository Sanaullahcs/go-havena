import React from "react";
import { StyleSheet, View } from "react-native";
import { sw } from "../../utils/responsive";
import WellnessCoverImage from "./wellness-cover-image";

/** Diameter that fits inside the program hero band with even inset. */
export const WELLNESS_HERO_CIRCLE = sw(100);

/** Inset from the hero card end — close to the edge, still fully inside. */
export const WELLNESS_HERO_CIRCLE_END = sw(8);

/** Circular photo only — uploaded image or bundled fallback, no wash disk. */
export default function WellnessHeroCircle({
  source,
  fallback,
  size = WELLNESS_HERO_CIRCLE,
  style,
}) {
  const dim = size;
  const radius = dim / 2;

  return (
    <View
      collapsable={false}
      style={[
        styles.circle,
        {
          width: dim,
          height: dim,
          borderRadius: radius,
        },
        style,
      ]}
    >
      <WellnessCoverImage
        source={source}
        fallback={fallback}
        resizeMode="cover"
        style={{ width: dim, height: dim, borderRadius: radius }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: "hidden",
    backgroundColor: "transparent",
    flexShrink: 0,
  },
});
