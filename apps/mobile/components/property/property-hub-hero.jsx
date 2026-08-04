import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Building2 } from "lucide-react-native";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import {
  PropertyHubTheme,
  getPropertyHubHeroCopy,
} from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

/** Intro banner with role-aware copy. */
export default function PropertyHubHero({ isAdmin = false }) {
  const copy = getPropertyHubHeroCopy(isAdmin);

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.iconRing}>
          <View style={styles.iconWrap}>
            <Building2 size={sf(20)} color={Colors.brandPrimaryDeep} strokeWidth={1.8} />
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E8ECF2",
    marginBottom: sw(20),
    overflow: "hidden",
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
  accent: {
    width: sw(4),
    alignSelf: "stretch",
    backgroundColor: Colors.brandPrimaryDeep,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
  },
  iconRing: {
    width: sw(46),
    height: sw(46),
    borderRadius: sw(14),
    backgroundColor: "#F0F6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(12),
  },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(11),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(1),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(4),
  },
});
