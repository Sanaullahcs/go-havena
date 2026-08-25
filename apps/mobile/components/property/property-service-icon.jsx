import React from "react";
import { View, StyleSheet } from "react-native";
import {
  Building2,
  CalendarDays,
  ShieldCheck,
  FileStack,
  BookmarkCheck,
  LifeBuoy,
  Bell,
  Store,
  Tag,
  CirclePlus,
  Pencil,
} from "lucide-react-native";
import { getPropertyServiceMeta } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const LUCIDE = {
  Building2,
  CalendarDays,
  ShieldCheck,
  FileStack,
  BookmarkCheck,
  LifeBuoy,
  Bell,
  Store,
  Tag,
  CirclePlus,
  Pencil,
  PenLine: Pencil,
};

/** Soft-tint Lucide icon tile — fixed box, centered glyph (matches ListRow sizing). */
export default function PropertyServiceIcon({
  serviceKey,
  size = sw(36),
  iconSize = sf(16),
  inverted = false,
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
          backgroundColor: inverted ? "rgba(255,255,255,0.16)" : meta.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: inverted ? "rgba(255,255,255,0.24)" : meta.border,
        },
        style,
      ]}
    >
      <Icon
        size={iconSize}
        color={inverted ? "#FFFFFF" : meta.color}
        strokeWidth={2}
      />
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
