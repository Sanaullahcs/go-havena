import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

const STAT_ICONS = {
  "pending-reviews": "clipboard",
  "pending-bookings": "calendar",
};

const STAT_VARIANTS = {
  amenityReview: {
    pendingTitle: (t, count) => t("admin.waitingForReview", { count }),
    clearTitle: (t) => t("admin.allClear"),
    pendingSubtitle: (t) => t("services.activity.review"),
  },
  bookingRequests: {
    pendingTitle: (t, count) => t("services.bookingRequestCount", { count }),
    clearTitle: (t) => t("admin.allClear"),
    pendingSubtitle: (t) => t("services.bookingRequestsSub"),
  },
};

function StatCard({ label, value, tone = "default", iconKey, variant = "amenityReview", onPress }) {
  const { t } = useTranslation();
  const isPending = tone === "pending";
  const count = Number(value) || 0;
  const iconName = STAT_ICONS[iconKey] ?? STAT_ICONS["pending-reviews"];
  const copy = STAT_VARIANTS[variant] ?? STAT_VARIANTS.amenityReview;

  const title = isPending ? copy.pendingTitle(t, count) : copy.clearTitle(t);
  const subtitle = isPending ? copy.pendingSubtitle(t) : null;

  const card = (
    <View style={[styles.cardOuter, isPending && styles.cardOuterPending]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, isPending && styles.iconWrapPending]}>
          <Feather
            name={iconName}
            size={sf(16)}
            color={isPending ? PropertyHubTheme.pendingText : PropertyHubTheme.deepTeal}
          />
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {label}
          </Text>
          <Text
            style={[styles.title, isPending && styles.titlePending]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.trailing}>
          <View style={[styles.chevron, isPending && styles.chevronPending]}>
            <Feather
              name={chevronForward()}
              size={sf(14)}
              color={isPending ? PropertyHubTheme.pendingText : PropertyHubTheme.deepTeal}
            />
          </View>
        </View>
      </View>
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
      accessibilityLabel={`${label}. ${title}`}
    >
      {card}
    </Pressable>
  );
}

/** Admin stat cards for the Property Management hub. */
export default function PropertyHubStats({ items = [], onAction }) {
  if (!items.length) return null;

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.id} style={styles.col}>
          <StatCard
            label={item.label}
            value={item.value}
            tone={item.tone}
            iconKey={item.id}
            variant={item.variant}
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
    width: "100%",
  },
  col: {
    width: "100%",
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  cardOuter: {
    width: "100%",
    backgroundColor: PropertyHubTheme.accentSoft,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.approvalBorder,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.deepTeal,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 3,
      },
      android: { elevation: 0 },
    }),
  },
  cardOuterPending: {
    backgroundColor: PropertyHubTheme.pendingBg,
    borderColor: PropertyHubTheme.pendingBorder,
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
    borderColor: PropertyHubTheme.approvalBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconWrapPending: {
    borderColor: PropertyHubTheme.pendingBorder,
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
    color: PropertyHubTheme.deepTeal,
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
  titlePending: {
    color: PropertyHubTheme.pendingText,
  },
  subtitle: {
    marginTop: sw(1),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
  },
  trailing: {
    flexShrink: 0,
  },
  chevron: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: 1,
    borderColor: PropertyHubTheme.approvalBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronPending: {
    borderColor: PropertyHubTheme.pendingBorder,
  },
});
