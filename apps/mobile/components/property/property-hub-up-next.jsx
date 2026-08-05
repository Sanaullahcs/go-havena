import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

const TONE = {
  success: { badgeBg: "#ECFDF5", badgeColor: "#047857", accent: PropertyHubTheme.teal },
  pending: { badgeBg: "#FFFBEB", badgeColor: "#B45309", accent: "#F59E0B" },
  danger: { badgeBg: "#FEF2F2", badgeColor: "#B91C1C", accent: "#EF4444" },
  approval: { badgeBg: PropertyHubTheme.mint, badgeColor: PropertyHubTheme.text, accent: PropertyHubTheme.teal },
};

function UpNextCard({ eyebrow, title, meta, badge, tone = "success", onPress, actionLabel = "View" }) {
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
          <View style={styles.mainRow}>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {meta ? (
                <View style={styles.metaRow}>
                  <Feather name="calendar" size={sf(10)} color={PropertyHubTheme.textMuted} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
              ) : null}
            </View>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: palette.badgeBg }]}>
                <Text style={[styles.badgeText, { color: palette.badgeColor }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Feather name="arrow-right" size={sf(12)} color={PropertyHubTheme.teal} />
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
      style={({ pressed }) => [styles.emptyPressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Browse amenities"
    >
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Feather name="calendar" size={sf(16)} color={PropertyHubTheme.teal} />
        </View>
        <View style={styles.emptyCopy}>
          <Text style={styles.emptyTitle}>Nothing booked yet</Text>
          <Text style={styles.emptyHint}>Tap to browse amenities and reserve a spot</Text>
        </View>
        <Feather name="chevron-right" size={sf(16)} color={PropertyHubTheme.caption} />
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
        badge={nextReservation.badge}
        tone={nextReservation.type}
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
        meta="Someone wants to book your amenity"
        badge="Review"
        tone="approval"
        actionLabel="Open inbox"
        onPress={() => onAction("ADMIN_BOOKINGS")}
      />
    );
  }

  return <EmptyUpNext onPress={() => onAction("AMENITY")} />;
}

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  pressed: { opacity: 0.9 },
  card: {
    flexDirection: "row",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: PropertyHubTheme.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        }
      : { elevation: 2 }),
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
    marginBottom: sw(6),
  },
  mainRow: { flexDirection: "row", alignItems: "flex-start" },
  copy: { flex: 1, minWidth: 0, marginRight: sw(8) },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: sw(4) },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginLeft: sw(4),
    flex: 1,
  },
  badge: {
    borderRadius: sw(999),
    paddingVertical: sw(4),
    paddingHorizontal: sw(8),
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(10),
    alignSelf: "flex-start",
  },
  actionText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.teal,
    fontWeight: "600",
    marginRight: sw(4),
  },
  emptyPressable: { width: "100%" },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(20, 184, 166, 0.22)",
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
  },
  emptyIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(12),
  },
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "600",
    color: PropertyHubTheme.text,
  },
  emptyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(2),
  },
});
