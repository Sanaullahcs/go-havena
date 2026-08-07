import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";
import { chevronForward, arrowForward } from "../../utils/rtl";

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
            <Feather name={arrowForward()} size={sf(12)} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyUpNext({ onPress }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t("services.browseAmenities")}
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
              <Text style={styles.emptyTitle}>{t("services.nothingBookedYet")}</Text>
              <Text style={styles.emptyHint}>
                {t("services.browseAndReserve")}
              </Text>
            </View>
          </View>
          <View style={styles.emptyCta}>
            <Text style={styles.emptyCtaText}>{t("services.browseAmenities")}</Text>
            <Feather name={arrowForward()} size={sf(12)} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MyReservationsCard({ count = 0, onPress }) {
  const { t } = useTranslation();
  const hasBookings = Number(count) > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t("services.myReservations")}
    >
      <View style={styles.reservationCard}>
        <View style={styles.reservationIconWrap}>
          <Feather name="bookmark" size={sf(18)} color={PropertyHubTheme.deepTeal} />
        </View>
        <View style={styles.reservationCopy}>
          <Text style={styles.reservationTitle}>{t("services.myReservations")}</Text>
          <Text style={styles.reservationHint} numberOfLines={1}>
            {hasBookings
              ? t("services.upcomingBookingCount", { count })
              : t("services.viewManageBookings")}
          </Text>
        </View>
        {hasBookings ? (
          <View style={styles.reservationCount}>
            <Text style={styles.reservationCountText}>{count}</Text>
          </View>
        ) : null}
        <Feather name={chevronForward()} size={sf(18)} color={PropertyHubTheme.textMuted} />
      </View>
    </Pressable>
  );
}

/** Compact “what’s next” strip + always-visible My Reservations card. */
export default function PropertyHubUpNext({
  nextReservation,
  myReservationCount = 0,
  approveRequestCount = 0,
  loading = false,
  onAction,
}) {
  const { t } = useTranslation();
  let primary = <EmptyUpNext onPress={() => onAction("AMENITY")} />;

  if (loading && !nextReservation) {
    primary = (
      <View style={styles.loadingCard}>
        <Text style={styles.loadingText}>{t("services.checkingSchedule")}</Text>
      </View>
    );
  } else if (nextReservation) {
    primary = (
      <UpNextCard
        title={nextReservation.title}
        meta={nextReservation.meta}
        note={nextReservation.note}
        badge={nextReservation.badge}
        tone={nextReservation.type}
        serviceKey={nextReservation.key ?? "bookings"}
        actionLabel={myReservationCount > 1 ? t("services.viewAllCount", { count: myReservationCount }) : t("services.viewBooking")}
        onPress={() => onAction("MY_BOOKING")}
      />
    );
  } else if (approveRequestCount > 0) {
    primary = (
      <UpNextCard
        title={t("services.bookingRequestCount", { count: approveRequestCount })}
        note={t("services.wantsToBook")}
        badge={t("services.reviewBadge")}
        tone="approval"
        serviceKey="approvals"
        actionLabel={t("services.openInbox")}
        onPress={() => onAction("ADMIN_BOOKINGS")}
      />
    );
  }

  return (
    <View style={styles.stack}>
      {primary}
      <MyReservationsCard
        count={myReservationCount}
        onPress={() => onAction("MY_BOOKING")}
      />
    </View>
  );
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
  stack: {
    gap: sw(12),
  },
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  lead: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(10),
    marginEnd: sw(8),
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
    marginStart: sw(4),
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
    marginStart: sw(12),
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
  reservationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    gap: sw(12),
    ...cardShadow,
  },
  reservationIconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(13),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reservationCopy: {
    flex: 1,
    minWidth: 0,
  },
  reservationTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(19),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  reservationHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11.5),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(2),
  },
  reservationCount: {
    minWidth: sw(24),
    height: sw(24),
    paddingHorizontal: sw(7),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  reservationCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  loadingCard: {
    minHeight: sw(88),
    borderRadius: sw(16),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(22),
    paddingHorizontal: sw(16),
    ...cardShadow,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    textAlign: "center",
  },
});
