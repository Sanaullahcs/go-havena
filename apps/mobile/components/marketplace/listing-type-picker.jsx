import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";
import { listingTypeTheme } from "../../constants/marketplace-theme";
import ThemedIconBox from "../ui/themed-icon-box";

const OPTIONS = [listingTypeTheme.item, listingTypeTheme.service];

function TypeCard({ theme, active, disabled, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[
        styles.card,
        { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.soft : "#FFFFFF" },
        active && styles.cardActive,
        disabled && styles.cardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {active ? (
        <View style={[styles.checkBadge, { backgroundColor: theme.accent }]}>
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      ) : null}

      <ThemedIconBox
        name={theme.feather}
        size="lg"
        color={theme.accent}
        backgroundColor={active ? "#FFFFFF" : theme.soft}
      />

      <Text style={[styles.cardTitle, active && { color: theme.accentDeep }]}>{theme.label}</Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        {theme.subtitle}
      </Text>
    </TouchableOpacity>
  );
}

/** Creative item vs service selector — soft tints aligned with home Sell + marketplace blue. */
export default function ListingTypePicker({ value, onChange, disabled = false }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>What would you like to post?</Text>
      <View style={styles.row}>
        {OPTIONS.map((theme) => (
          <TypeCard
            key={theme.id}
            theme={theme}
            active={value === theme.id}
            disabled={disabled}
            onPress={() => onChange(theme.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  prompt: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyLine,
    color: "#64748B",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: "flex-start",
    gap: 8,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#64748B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  cardActive: {
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  cardDisabled: {
    opacity: 0.55,
  },
  checkBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#0F172A",
    fontWeight: "700",
  },
  cardSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#64748B",
  },
});
