import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme, getPropertyHubHeroCopy } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { arrowForward } from "../../utils/rtl";

export default function PropertyHubHero({ isAdmin = false, onAction }) {
  const { t } = useTranslation();
  const copy = getPropertyHubHeroCopy(isAdmin, t);

  return (
    <View style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Feather
            name={isAdmin ? "briefcase" : "calendar"}
            size={sf(18)}
            color={PropertyHubTheme.text}
          />
        </View>
        <View style={styles.eyebrowPill}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        </View>
      </View>

      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      {onAction && copy.ctaRoute ? (
        <Pressable
          onPress={() => onAction(copy.ctaRoute)}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityLabel={copy.cta}
        >
          <Text style={styles.ctaText}>{copy.cta}</Text>
          <Feather name={arrowForward()} size={sf(14)} color={PropertyHubTheme.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PropertyHubTheme.text,
    borderRadius: sw(20),
    paddingVertical: sw(22),
    paddingHorizontal: sw(18),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,61,95,0.15)",
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.text,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
    }),
  },
  glow: {
    position: "absolute",
    width: sw(140),
    height: sw(140),
    borderRadius: sw(70),
    backgroundColor: "rgba(20,184,166,0.14)",
    end: -sw(30),
    top: -sw(40),
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(16),
  },
  iconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrowPill: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    backgroundColor: "rgba(209,250,245,0.14)",
    borderWidth: 1,
    borderColor: "rgba(209,250,245,0.22)",
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: PropertyHubTheme.mint,
    fontWeight: "700",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "rgba(209,250,245,0.82)",
  },
  cta: {
    marginTop: sw(18),
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: PropertyHubTheme.teal,
    paddingHorizontal: sw(16),
    paddingVertical: sw(11),
    borderRadius: sw(12),
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: PropertyHubTheme.text,
    fontWeight: "700",
  },
});
