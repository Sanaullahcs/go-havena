import React from "react";
import { View, StyleSheet } from "react-native";
import { CalendarClock, ClipboardCheck } from "lucide-react-native";
import { getApprovalQueueIconMeta } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const LUCIDE = {
  CalendarClock,
  ClipboardCheck,
};

/** Themed icon tile for admin stat cards and approval queue items. */
export default function ApprovalQueueIcon({
  iconKey,
  size = sw(40),
  iconSize = sf(17),
  style,
}) {
  const meta = getApprovalQueueIconMeta(iconKey);
  const Icon = LUCIDE[meta.lucide] || CalendarClock;
  const innerSize = size - sw(8);

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: sw(12),
          backgroundColor: meta.ring,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: sw(9),
            backgroundColor: meta.bg,
            borderColor: meta.border,
          },
        ]}
      >
        <Icon size={iconSize} color={meta.color} strokeWidth={2.25} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  inner: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
