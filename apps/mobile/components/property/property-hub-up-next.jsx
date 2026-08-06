import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

const TONE = {
  success: {
    badgeBg: PropertyHubTheme.successBg,
    badgeColor: PropertyHubTheme.successText,
    accent: PropertyHubTheme.teal,
    chipBg: PropertyHubTheme.mint,
    chipColor: PropertyHubTheme.deepTeal,
    ctaBg: PropertyHubTheme.teal,
    icon: "check-circle",
  },
  pending: {
    badgeBg: PropertyHubTheme.pendingBg,
    badgeColor: PropertyHubTheme.pendingText,
    accent: "#F59E0B",
    chipBg: PropertyHubTheme.pendingBg,
    chipColor: PropertyHubTheme.pendingText,
    ctaBg: "#D97706",
    icon: "clock",
  },
  danger: {
    badgeBg: PropertyHubTheme.dangerBg,
    badgeColor: PropertyHubTheme.dangerText,
    accent: "#EF4444",
    chipBg: PropertyHubTheme.dangerBg,
    chipColor: PropertyHubTheme.dangerText,
    ctaBg: "#DC2626",
    icon: "x-circle",
  },
  approval: {
    badgeBg: PropertyHubTheme.mint,
    badgeColor: PropertyHubTheme.deepTeal,
    accent: PropertyHubTheme.teal,
    chipBg: PropertyHubTheme.mint,
    chipColor: PropertyHubTheme.deepTeal,
    ctaBg: PropertyHubTheme.teal,
    icon: "inbox",
  },
};

function UpNextCard({
  eyebrow,
  title,
  meta,
  note,
  badge,
  tone = "success",
  serviceKey = "bookings",
  onPress,
  actionLabel = "View",
}) {
  const palette = TONE[tone] ?? TONE.success;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.card}>
        <View style={[styles.accent, { backgroundColor: palette.accent }]} />
        <View style={styles.body}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>

          <View style={styles.headerRow}>
            <PropertyServiceIcon serviceKey={serviceKey} size={sw(44)} iconSize={sf(18)} />
            <View style={styles.lead}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {note ? (
                <Text style={styles.note} numberOfLines={1}>
                  {note}
                </Text>
              ) : null}
            </View>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: palette.badgeBg }]}>
                <Feather name={palette.icon} size={sf(10)} color={palette.badgeColor} />
                <Text style={[styles.badgeText, { color: palette.badgeColor }]}>{badge}</Text>
              </View>
            ) : null}
          </View>

          {meta ? (
            <View style={[styles.scheduleChip, { backgroundColor: palette.chipBg }]}>
              <Feather name="calendar" size={sf(11)} color={palette.chipColor} />
              <Text style={[styles.scheduleText, { color: palette.chipColor }]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          ) : null}

          <View style={[styles.cta, { backgroundColor: palette.ctaBg }]}>
            <Text style={styles.ctaText}>{actionLabel}</Text>
            <Feather name="arrow-right" size={sf(12)} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyUpNext({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Browse amenities"
    >
      <View style={styles.emptyCard}>
        <View style={styles.emptyAccent} />
        <View style={styles.emptyBody}>
          <View style={styles.emptyHeader}>
            <View style={styles.emptyIconOuter}>
              <View style={styles.emptyIconInner}>
                <Feather name="calendar" size={sf(18)} color={PropertyHubTheme.teal} />
              </View>
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyEyebrow}>Up next</Text>
              <Text style={styles.emptyTitle}>Nothing booked yet</Text>
              <Text style={styles.emptyHint}>
                Browse amenities and reserve your next visit
              </Text>
            </View>
          </View>
          <View style={styles.emptyCta}>
            <Text style={styles.emptyCtaText}>Browse amenities</Text>
            <Feather name="arrow-right" size={sf(12)} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Compact “what’s next” strip — replaces duplicate booking shortcuts + reservation sections. */
export default function PropertyHubUpNext({
  nextReservation,
  myReservationCount = 0,
  approveRequestCount = 0,
  onAction,
}) {
  if (nextReservation) {
    return (
      <UpNextCard
        eyebrow="Up next"
        title={nextReservation.title}
        meta={nextReservation.meta}
        note={nextReservation.note}
        badge={nextReservation.badge}
        tone={nextReservation.type}
        serviceKey={nextReservation.key ?? "bookings"}
        actionLabel={myReservationCount > 1 ? `View all (${myReservationCount})` : "View booking"}
        onPress={() => onAction("MY_BOOKING")}
      />
    );
  }

  if (approveRequestCount > 0) {
    return (
      <UpNextCard
        eyebrow="Needs your OK"
        title={`${approveRequestCount} approval request${approveRequestCount === 1 ? "" : "s"}`}
        note="Someone wants to book your amenity"
        badge="Review"
        tone="approval"
        serviceKey="approvals"
        actionLabel="Open inbox"
        onPress={() => onAction("ADMIN_BOOKINGS")}
      />
    );
  }

  return <EmptyUpNext onPress={() => onAction("AMENITY")} />;
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: PropertyHubTheme.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  pressed: { opacity: 0.92 },
  card: {
    flexDirection: "row",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...cardShadow,
  },
  accent: { width: sw(4), alignSelf: "stretch" },
  body: { flex: 1, paddingVertical: sw(14), paddingHorizontal: sw(14) },
  eyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "600",
    color: PropertyHubTheme.teal,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: sw(10),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  lead: {
    flex: 1,
    minWidth: 0,
    marginLeft: sw(10),
    marginRight: sw(8),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  note: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "500",
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: sw(999),
    paddingVertical: sw(5),
    paddingHorizontal: sw(8),
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.pendingBorder,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    marginLeft: sw(4),
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  scheduleChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(12),
    paddingVertical: sw(7),
    paddingHorizontal: sw(10),
    borderRadius: sw(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.iconBorder,
    gap: sw(6),
  },
  scheduleText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "600",
    flexShrink: 1,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(12),
    paddingVertical: sw(9),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
    gap: sw(6),
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyCard: {
    flexDirection: "row",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...cardShadow,
  },
  emptyAccent: {
    width: sw(4),
    alignSelf: "stretch",
    backgroundColor: PropertyHubTheme.teal,
  },
  emptyBody: {
    flex: 1,
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
  },
  emptyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  emptyIconOuter: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(13),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emptyIconInner: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.iconBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: sw(12),
  },
  emptyEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "600",
    color: PropertyHubTheme.teal,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  emptyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(4),
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(14),
    paddingVertical: sw(9),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.teal,
    gap: sw(6),
  },
  emptyCtaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
