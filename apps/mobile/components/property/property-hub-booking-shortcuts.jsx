import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

function BookingTile({
  icon,
  iconBg,
  iconColor,
  title,
  hint,
  count,
  showCount = true,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.card}>
        <View style={styles.top}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Feather name={icon} size={sf(16)} color={iconColor} />
          </View>
          {showCount && Number(count) > 0 ? (
            <View style={[styles.countBubble, { backgroundColor: iconColor }]}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          ) : (
            <Feather name="chevron-right" size={sf(15)} color="#CBD5E1" />
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.hint} numberOfLines={2}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

/** Side-by-side booking cards — same card chrome as Quick actions. */
export default function PropertyHubBookingShortcuts({
  approveRequestCount = 0,
  onAction,
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.col, styles.colGap]}>
        <BookingTile
          icon="calendar"
          iconBg="#EFF6FF"
          iconColor={Colors.brandPrimaryDeep}
          title="My Reservations"
          hint="Places you booked"
          showCount={false}
          onPress={() => onAction("MY_BOOKING")}
        />
      </View>
      <View style={styles.col}>
        <BookingTile
          icon="inbox"
          iconBg="#ECFDF5"
          iconColor="#059669"
          title="Approve Requests"
          hint="For your amenities"
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
    marginRight: sw(12),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E8ECF2",
    padding: sw(12),
    minHeight: sw(112),
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
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  countBubble: {
    minWidth: sw(22),
    height: sw(22),
    paddingHorizontal: sw(6),
    borderRadius: sw(11),
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
