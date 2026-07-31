import React from "react";
import { View, StyleSheet } from "react-native";
import {
  Building2,
  CalendarDays,
  ShieldCheck,
  FileStack,
  BookmarkCheck,
} from "lucide-react-native";
import { getPropertyServiceMeta } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const LUCIDE = {
  Building2,
  CalendarDays,
  ShieldCheck,
  FileStack,
  BookmarkCheck,
};

/** Soft-tint Lucide icon tile — fixed box, centered glyph (matches ListRow sizing). */
export default function PropertyServiceIcon({
  serviceKey,
  size = sw(36),
  iconSize = sf(16),
  style,
}) {
  const meta = getPropertyServiceMeta(serviceKey);
  const Icon = LUCIDE[meta.lucide] || Building2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: sw(10),
          backgroundColor: meta.bg,
        },
        style,
      ]}
    >
      <Icon size={iconSize} color={meta.color} strokeWidth={1.75} />
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
