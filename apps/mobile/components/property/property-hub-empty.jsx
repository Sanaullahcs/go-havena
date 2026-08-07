import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { arrowForward } from "../../utils/rtl";

const ACCENTS = {
  blue: {
    solid: Colors.brandPrimaryDeep,
    ring: "#D1FAF5",
    border: "rgba(20, 184, 166, 0.28)",
  },
  green: {
    solid: "#059669",
    ring: "#ECFDF5",
    border: "#A7F3D0",
  },
};

function EmptyShell({
  icon,
  title,
  subtitle,
  cta,
  routeKey,
  onAction,
  tone = "blue",
  hints,
}) {
  const palette = ACCENTS[tone] ?? ACCENTS.blue;

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: palette.solid }]} />
      <View style={styles.body}>
        <View style={[styles.iconRing, { backgroundColor: palette.ring }]}>
          <View style={[styles.iconWrap, { borderColor: palette.border }]}>
            <Feather name={icon} size={sf(18)} color={palette.solid} />
          </View>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {hints?.length ? (
          <View style={styles.hints}>
            {hints.map((hint) => (
              <View key={hint} style={styles.hintChip}>
                <Feather name="check" size={sf(10)} color="#059669" />
                <Text style={styles.hintText}>{hint}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => onAction(routeKey)}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: palette.solid },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{cta}</Text>
          <Feather name={arrowForward()} size={sf(12)} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

/** Friendly empty state when there is no recent activity yet. */
export default function PropertyHubEmpty({ isAdmin, onAction, variant = "default" }) {
  const { t } = useTranslation();

  if (variant === "reservations-only") {
    return (
      <EmptyShell
        icon="calendar"
        title={t("property.emptyReservationsTitle")}
        subtitle={t("property.emptyReservationsSub")}
        cta={t("property.browseAmenities")}
        routeKey="AMENITY"
        onAction={onAction}
        tone="blue"
      />
    );
  }

  if (isAdmin) {
    return (
      <EmptyShell
        icon="check-circle"
        title={t("property.emptyAdminTitle")}
        subtitle={t("property.emptyAdminSub")}
        cta={t("property.manageAmenities")}
        routeKey="ADMIN_AMENITIES"
        onAction={onAction}
        tone="green"
        hints={[t("property.hintAmenityReviews"), t("property.hintBookingRequests")]}
      />
    );
  }

  return (
    <EmptyShell
      icon="compass"
      title={t("property.emptyExploreTitle")}
      subtitle={t("property.emptyExploreSub")}
      cta={t("property.browseAmenities")}
      routeKey="AMENITY"
      onAction={onAction}
      tone="blue"
    />
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
  },
  body: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sw(20),
    paddingHorizontal: sw(16),
  },
  iconRing: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(16),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  iconWrap: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(19),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    textAlign: "center",
    marginTop: sw(5),
    marginBottom: sw(12),
    maxWidth: sw(260),
  },
  hints: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: sw(14),
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: sw(20),
    paddingVertical: sw(5),
    paddingHorizontal: sw(8),
    marginHorizontal: sw(3),
    marginBottom: sw(5),
  },
  hintText: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: "#047857",
    marginStart: sw(4),
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(10),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#FFFFFF",
    marginEnd: sw(5),
  },
  pressed: {
    opacity: 0.9,
  },
});
