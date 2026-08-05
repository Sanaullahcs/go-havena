import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceTheme as T } from "../../constants/marketplace-theme";
import { sf, sw } from "../../utils/responsive";

const TABS = [
  { id: "feed", label: "Feed", icon: "message-circle" },
  { id: "marketplace", label: "Marketplace", icon: "tag" },
];

export default function CommunitySegmentTabs({ value = "feed", onChange }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {TABS.map((tab) => {
          const active = value === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange?.(tab.id)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Feather
                name={tab.icon}
                size={sf(14)}
                color={active ? T.teal : T.textMuted}
              />
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: sw(20),
    paddingTop: sw(4),
    paddingBottom: sw(12),
  },
  track: {
    flexDirection: "row",
    backgroundColor: T.mint,
    borderRadius: sw(14),
    padding: sw(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(20, 184, 166, 0.2)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(10),
    borderRadius: sw(11),
  },
  tabActive: {
    backgroundColor: T.surface,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        }
      : { elevation: 2 }),
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: T.textMuted,
    fontWeight: "500",
  },
  labelActive: {
    fontFamily: Fonts.semiBold,
    color: T.navy,
    fontWeight: "600",
  },
});
