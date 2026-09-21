import React from "react";
import { View, StyleSheet } from "react-native";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";

/** Tinted track with category-colored fill. */
export default function WellnessProgressBar({
  categoryKey,
  progress = 0,
  height = 5,
  style,
}) {
  const meta = getWellnessCategoryMeta(categoryKey);
  const pct = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <View
      style={[
        styles.track,
        {
          height,
          backgroundColor: meta.bg,
          borderColor: meta.border,
        },
        style,
      ]}
    >
      {pct > 0 ? (
        <View
          style={[
            styles.fill,
            {
              width: `${pct}%`,
              backgroundColor: meta.color,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
