import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";
import { chevronForward } from "../../utils/rtl";

function BookingTile({ icon, title, hint, count, showCount = true, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.card}>
        <View style={styles.top}>
          <View style={styles.iconWrap}>
            <Feather name={icon} size={sf(16)} color={PropertyHubTheme.text} />
          </View>
          {showCount && Number(count) > 0 ? (
            <View style={styles.countBubble}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          ) : (
            <Feather name={chevronForward()} size={sf(14)} color={PropertyHubTheme.caption} />
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.hint} numberOfLines={2}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PropertyHubBookingShortcuts({
  myReservationCount = 0,
  approveRequestCount = 0,
  onAction,
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={[styles.col, styles.colGap]}>
        <BookingTile
          icon="bookmark"
          title={t("property.myReservations")}
          hint={
            myReservationCount > 0
              ? t("property.upcomingCount", { count: myReservationCount })
              : t("property.amenitiesYouBooked")
          }
          showCount={false}
          onPress={() => onAction("MY_BOOKING")}
        />
      </View>
      <View style={styles.col}>
        <BookingTile
          icon="inbox"
          title={t("property.bookingRequests")}
          hint={t("property.forYourListedServices")}
          count={approveRequestCount}
          onPress={() => onAction("ADMIN_BOOKINGS")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    width: "100%",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  colGap: {
    marginEnd: sw(10),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    padding: sw(12),
    minHeight: sw(100),
    ...(Platform.OS === "ios"
      ? {
          ...rnShadow({ color: PropertyHubTheme.text, offset: { width: 0, height: 2 }, opacity: 0.04, radius: 6 }),
        }
      : { elevation: 1 }),
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "600",
    color: PropertyHubTheme.text,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  countBubble: {
    minWidth: sw(22),
    height: sw(22),
    paddingHorizontal: sw(6),
    borderRadius: sw(11),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
