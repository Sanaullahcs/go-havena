import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme, getPropertyHubHeroCopy } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";


export default function PropertyHubHero({
  isAdmin = false,
  onAction,
  reservationCount = 0,
}) {
  const { t } = useTranslation();
  const copy = getPropertyHubHeroCopy(isAdmin, t, { reservationCount });
  const iconName = copy.icon ?? "calendar";

  return (
    <View style={styles.cardOuter}>
      <Pressable
        onPress={() => onAction?.(copy.ctaRoute)}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${copy.title}. ${copy.subtitle}`}
      >
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Feather name={iconName} size={sf(16)} color="#0369A1" />
          </View>

          <View style={styles.copy}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {copy.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {copy.subtitle}
            </Text>
          </View>

          <View style={styles.action}>
            {reservationCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{reservationCount}</Text>
              </View>
            ) : null}
            <View style={styles.chevron}>
              <Feather name={chevronForward()} size={sf(14)} color="#0369A1" />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    width: "100%",
    backgroundColor: PropertyHubTheme.accentBlue,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(3, 105, 161, 0.2)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0369A1", offset: { width: 0, height: 1 }, opacity: 0.02, radius: 3 }),
      },
      android: { elevation: 0 },
    }),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(10),
    paddingStart: sw(14),
    paddingEnd: sw(12),
    gap: sw(10),
  },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: 1,
    borderColor: "rgba(3, 105, 161, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: sf(8),
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#0369A1",
    fontWeight: "700",
  },
  title: {
    marginTop: sw(2),
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(19),
    color: PropertyHubTheme.text,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: sw(1),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#475569",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 0,
  },
  badge: {
    minWidth: sw(20),
    height: sw(20),
    paddingHorizontal: sw(5),
    borderRadius: sw(10),
    backgroundColor: "#0284C7",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  chevron: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: 1,
    borderColor: "rgba(3, 105, 161, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
});
