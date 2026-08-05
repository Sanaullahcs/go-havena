import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme, getPropertyHubHeroCopy } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

export default function PropertyHubHero({ isAdmin = false }) {
  const copy = getPropertyHubHeroCopy(isAdmin);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Feather name="grid" size={sf(18)} color={PropertyHubTheme.teal} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    marginBottom: sw(16),
    ...(Platform.OS === "ios"
      ? {
          shadowColor: PropertyHubTheme.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        }
      : { elevation: 1 }),
  },
  iconWrap: {
    width: sw(42),
    height: sw(42),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(12),
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "600",
    color: PropertyHubTheme.text,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(2),
  },
});
