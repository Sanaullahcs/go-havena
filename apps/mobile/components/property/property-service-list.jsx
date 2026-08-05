import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

function ServiceRow({ item, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.card}>
        <PropertyServiceIcon serviceKey={item.key} size={sw(38)} iconSize={sf(16)} />
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        </View>
        <Feather name="chevron-right" size={sf(15)} color={PropertyHubTheme.caption} />
      </View>
    </Pressable>
  );
}

export default function PropertyServiceList({ services, onAction }) {
  return (
    <View style={styles.list}>
      {services.map((item, index) => (
        <View
          key={item.id}
          style={index < services.length - 1 ? styles.itemWrap : undefined}
        >
          <ServiceRow item={item} onPress={() => onAction(item.routeKey)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  itemWrap: {
    marginBottom: sw(10),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    ...(Platform.OS === "ios"
      ? {
          shadowColor: PropertyHubTheme.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
        }
      : { elevation: 1 }),
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: sw(10),
    marginRight: sw(6),
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: PropertyHubTheme.text,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(2),
  },
});
