import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import React, { useCallback, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import ScreenHeader from "../../../../../components/layout/screen-header";
import AmenityIcon from "../../../../../components/property/amenity-icon";
import { Fonts } from "../../../../../constants/font";
import { Colors, Layout } from "../../../../../constants/tokens";
import { sw, sf } from "../../../../../utils/responsive";
import { pageStyles } from "../../../../../constants/page-styles";
import { PropertyManagementRoutes } from "../../../../../constants/property-management-routes";
import { fetchMyBookings } from "../../../../../services/amenity-api";
import {
  getAmenityVisual,
  getAmenityStatus,
  formatLongDate,
  hasUpcomingUserBooking,
  getNextUserBookingDate,
} from "../../../../../utils/amenity-display";

export default function AllFacilities() {
  const router = useRouter();
  const {
    id,
    name,
    description,
    capacity,
    floor,
    hours,
    status,
    iconKey,
    weekendsAvailable,
    isMine,
    reviewStatus,
    userHasUpcomingBooking,
    userNextBookingDate,
  } = useLocalSearchParams();

  const [myBookings, setMyBookings] = useState([]);

  useFocusEffect(
    useCallback(() => {
      fetchMyBookings()
        .then((rows) => setMyBookings(rows ?? []))
        .catch(() => setMyBookings([]));
    }, []),
  );

  const amenityId = Number(id);
  const reservedDate =
    String(userNextBookingDate ?? "") ||
    getNextUserBookingDate(myBookings, amenityId) ||
    null;
  const alreadyBooked =
    userHasUpcomingBooking === "1" ||
    userHasUpcomingBooking === "true" ||
    hasUpcomingUserBooking(myBookings, amenityId);

  const visual = getAmenityVisual(name, iconKey || null);
  const statusMeta = getAmenityStatus(status);
  const ownedByMe = isMine === "1" || isMine === "true";
  const canBook =
    !ownedByMe &&
    !alreadyBooked &&
    reviewStatus !== "pending" &&
    reviewStatus !== "rejected" &&
    (status === "bookable" || status === "open");

  const weekendsOn =
    weekendsAvailable !== "0" &&
    weekendsAvailable !== "false" &&
    weekendsAvailable !== false;

  const infoRows = [
    floor
      ? { icon: "map-pin", tint: "#0284C7", label: "Location", value: floor }
      : null,
    hours
      ? { icon: "clock", tint: "#059669", label: "Hours", value: hours }
      : null,
    {
      icon: "calendar",
      tint: "#0D9488",
      label: "Weekends",
      value: weekendsOn ? "Available" : "Closed Sat & Sun",
    },
    capacity
      ? {
          icon: "users",
          tint: "#7C3AED",
          label: "Capacity",
          value: `${capacity} people`,
        }
      : null,
  ].filter(Boolean);

  const goToCalendar = () => {
    if (ownedByMe) {
      router.push(PropertyManagementRoutes.ADMIN_BOOKINGS);
      return;
    }
    router.push({
      pathname: PropertyManagementRoutes.RESERVATION_CALENDAR,
      params: {
        id: String(id ?? ""),
        name,
        hours,
        status: String(status ?? ""),
        weekendsAvailable: String(weekendsAvailable ?? "1"),
        isMine: ownedByMe ? "1" : "0",
      },
    });
  };

  const goToInbox = () => {
    router.push(PropertyManagementRoutes.ADMIN_BOOKINGS);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        titleAlign="center"
        title={name || "Amenity"}
        iconOnly
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, pageStyles.scrollBottom]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: visual.soft }]}>
            <AmenityIcon
              iconKey={iconKey || null}
              name={name}
              size={sf(32)}
              color={visual.tint}
            />
          </View>
          <Text style={styles.heroTitle}>{name}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusMeta.dot }]} />
            <Text style={[styles.statusText, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
          </View>
          {description ? (
            <Text style={styles.heroDesc}>{description}</Text>
          ) : null}
        </View>

        {/* Info */}
        {infoRows.length > 0 ? (
          <View style={styles.card}>
            {infoRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.infoRow, index < infoRows.length - 1 && styles.infoRowBorder]}
              >
                <View style={[styles.infoIcon, { backgroundColor: `${row.tint}14` }]}>
                  <Feather name={row.icon} size={sf(16)} color={row.tint} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Guidelines */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Good to know</Text>
          {[
            "Please arrive on time for your reservation.",
            "Respect capacity limits and other residents.",
            "Leave the space clean for the next neighbor.",
          ].map((tip, index) => (
            <View key={index} style={styles.tipRow}>
              <View style={styles.tipDot}>
                <Feather name="check" size={sf(11)} color="#FFFFFF" />
              </View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {ownedByMe ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToInbox}>
            <Feather name="inbox" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Approve requests</Text>
          </TouchableOpacity>
        ) : canBook && status === "bookable" ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToCalendar}>
            <Feather name="calendar" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Reserve a slot</Text>
          </TouchableOpacity>
        ) : canBook && status === "open" ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.primaryBtn} onPress={goToCalendar}>
            <Feather name="send" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Request access</Text>
          </TouchableOpacity>
        ) : alreadyBooked && !ownedByMe ? (
          <View style={styles.bookedBtn}>
            <Feather name="bookmark" size={sf(15)} color="#64748B" />
            <View style={styles.bookedCopy}>
              <Text style={styles.bookedTitle}>Already booked</Text>
              <Text style={styles.bookedText}>
                {reservedDate
                  ? `Your reservation is on ${formatLongDate(reservedDate)}. You can book again after that date.`
                  : "You already have an upcoming reservation for this amenity."}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.closedBtn}>
            <Feather name="lock" size={sf(15)} color={Colors.textMuted} />
            <Text style={styles.closedText}>
              {reviewStatus === "pending"
                ? "Waiting for admin approval"
                : reviewStatus === "rejected"
                  ? "Not approved for booking"
                  : "Currently closed"}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(12),
    gap: sw(14),
  },

  hero: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: sw(22),
    paddingHorizontal: sw(18),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  heroIcon: {
    width: sw(68),
    height: sw(68),
    borderRadius: sw(20),
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    marginTop: sw(14),
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(20),
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(10),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
  },
  statusDot: { width: sw(6), height: sw(6), borderRadius: sw(3) },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
  },
  heroDesc: {
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
    textAlign: "center",
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: sw(16),
    paddingVertical: sw(4),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(14),
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  infoIcon: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  infoValue: {
    marginTop: 1,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    color: Colors.textPrimary,
  },

  cardHeading: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: Colors.textPrimary,
    marginTop: sw(12),
    marginBottom: sw(4),
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    paddingVertical: sw(8),
  },
  tipDot: {
    width: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textBody,
  },

  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(20),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#F7F8FC",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: Colors.brandPrimaryDeep,
    paddingVertical: sw(15),
    borderRadius: sw(14),
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  closedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#F1F5F9",
    paddingVertical: sw(15),
    borderRadius: sw(14),
  },
  closedText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textMuted,
  },
  bookedBtn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    borderRadius: sw(14),
  },
  bookedCopy: { flex: 1, minWidth: 0 },
  bookedTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: "#334155",
  },
  bookedText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#64748B",
  },
});
