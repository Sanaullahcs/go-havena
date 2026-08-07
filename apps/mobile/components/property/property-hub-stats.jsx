import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import ApprovalQueueIcon from "./approval-queue-icon";
import { sf, sw } from "../../utils/responsive";

const STAT_ICON_KEYS = {
  "pending-reviews": "amenityReview",
  "pending-bookings": "bookingRequest",
};

function StatCard({ label, value, tone = "default", iconKey, onPress }) {
  const valueColor =
    tone === "pending"
      ? PropertyHubTheme.pendingText
      : tone === "success"
        ? PropertyHubTheme.successText
        : PropertyHubTheme.text;

  const card = (
    <View style={styles.card}>
      <ApprovalQueueIcon iconKey={iconKey} size={sw(40)} iconSize={sf(17)} />
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
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
            iconKey={item.iconKey ?? STAT_ICON_KEYS[item.id] ?? "bookingRequest"}
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
    marginEnd: sw(12),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    padding: sw(14),
    minHeight: sw(110),
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.text,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  value: {
    fontFamily: Fonts.bold,
    fontSize: sf(24),
    lineHeight: sf(28),
    fontWeight: "700",
    marginTop: sw(12),
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(4),
  },
});
