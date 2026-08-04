import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const ICONS = {
  "pending-reviews": "layers",
  "pending-bookings": "inbox",
  "approve-requests": "inbox",
  "my-reservations": "calendar",
};

function StatCard({ label, value, tone = "default", icon, onPress }) {
  const palette =
    tone === "pending"
      ? {
          value: PropertyHubTheme.pendingText,
          iconBg: "#FEF3C7",
          iconColor: "#B45309",
        }
      : tone === "success"
        ? {
            value: PropertyHubTheme.successText,
            iconBg: "#DCFCE7",
            iconColor: "#15803D",
          }
        : {
            value: Colors.brandPrimaryDeep,
            iconBg: "#D1FAF5",
            iconColor: Colors.brandPrimaryDeep,
          };

  const card = (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
        <Feather name={icon} size={sf(15)} color={palette.iconColor} />
      </View>
      <Text style={[styles.value, { color: palette.value }]}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return card;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {card}
    </Pressable>
  );
}

/** Two-column stat cards for the Property Management hub (admin view). */
export default function PropertyHubStats({ items = [], onAction }) {
  if (!items.length) return null;

  return (
    <View style={styles.grid}>
      {items.map((item, index) => (
        <View
          key={item.id}
          style={[styles.col, index < items.length - 1 && styles.colGap]}
        >
          <StatCard
            label={item.label}
            value={item.value}
            tone={item.tone}
            icon={ICONS[item.id] ?? "activity"}
            onPress={
              item.routeKey && onAction ? () => onAction(item.routeKey) : undefined
            }
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    width: "100%",
    alignItems: "stretch",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  colGap: {
    marginRight: sw(12),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E8ECF2",
    padding: sw(12),
    minHeight: sw(104),
    ...Platform.select({
      ios: {
        shadowColor: "#101828",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  iconWrap: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  value: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    lineHeight: sf(26),
    fontWeight: "700",
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
});
