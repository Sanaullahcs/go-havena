import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme, getPropertyServiceMeta } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const ICON_SIZE = sw(36);

export default function PropertyQuickTile({ serviceKey, title, onPress, width }) {
  const meta = getPropertyServiceMeta(serviceKey);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        width != null ? { width } : null,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.stack}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={sf(16)} color={meta.color} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    paddingTop: sw(18),
    paddingBottom: sw(8),
    paddingHorizontal: sw(6),
    minWidth: 0,
    width: "100%",
  },
  pressed: {
    opacity: 0.86,
  },
  stack: {
    width: "100%",
    alignItems: "center",
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(16),
    fontWeight: "600",
    color: PropertyHubTheme.text,
    marginTop: sw(8),
    textAlign: "center",
    width: "100%",
    includeFontPadding: true,
  },
});
