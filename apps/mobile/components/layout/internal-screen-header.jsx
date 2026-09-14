import React from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import ScreenHeader from "./screen-header";
import { sw } from "../../utils/responsive";

/** Compact header for stack/internal screens -- always shows back chevron. */
export default function InternalScreenHeader({ title, subtitle, onBack, right, compact = false, dense = false }) {
  const router = useRouter();

  return (
    <ScreenHeader
      layout={subtitle ? "stacked" : "inline"}
      title={title}
      subtitle={subtitle}
      onBack={onBack ?? (() => router.back())}
      right={right}
      iconOnly
      padded
      compact={compact}
      dense={dense}
    />
  );
}

export const internalContent = {
  gutter: { paddingHorizontal: sw(18) },
  scroll: { paddingBottom: sw(32) },
  sectionGap: { marginTop: sw(16) },
};
