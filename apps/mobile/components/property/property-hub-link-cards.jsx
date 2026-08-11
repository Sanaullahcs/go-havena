import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme, getPropertyServiceMeta } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

function LinkCard({ item, onPress }) {
  const meta = getPropertyServiceMeta(item.key);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[styles.card, { borderColor: meta.border }]}>
        <View style={styles.row}>
          <PropertyServiceIcon serviceKey={item.key} size={sw(40)} iconSize={sf(17)} />

          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>

          <View style={[styles.chevronWell, { borderColor: meta.border }]}>
            <Feather name={chevronForward()} size={sf(14)} color={meta.color} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Full-width stacked link cards for hub sections (e.g. Rules & documents). */
export default function PropertyHubLinkCards({ items = [], onAction }) {
  if (!items.length) return null;

  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={item.id} style={index < items.length - 1 && styles.itemGap}>
          <LinkCard item={item} onPress={() => onAction?.(item.routeKey)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  itemGap: {
    marginBottom: sw(10),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 3,
      },
      android: { elevation: 0 },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(12),
    paddingStart: sw(14),
    paddingEnd: sw(12),
    gap: sw(12),
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: PropertyHubTheme.text,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
  },
  chevronWell: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.screenBg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
