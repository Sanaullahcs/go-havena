import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import ScreenHeader from "../../../../components/layout/screen-header";
import AmenityIcon from "../../../../components/property/amenity-icon";
import { Fonts } from "../../../../constants/font";
import { Colors, Layout } from "../../../../constants/tokens";
import { sw, sf } from "../../../../utils/responsive";
import { pageStyles } from "../../../../constants/page-styles";
import {
  PropertyManagementRoutes,
  amenityFacilityParams,
} from "../../../../constants/property-management-routes";
import { fetchAmenities, fetchMyBookings } from "../../../../services/amenity-api";
import {
  getAmenityVisual,
  getAmenityStatus,
  enrichAmenityBookingState,
  formatLongDate,
} from "../../../../utils/amenity-display";

function AmenityCard({ amenity, onPress, alreadyBooked = false }) {
  const visual = getAmenityVisual(amenity.name, amenity.icon_key);
  const status = getAmenityStatus(amenity.status);
  const reviewPending = amenity.review_status === "pending";
  const reviewRejected = amenity.review_status === "rejected";
  const pill = alreadyBooked
    ? { bg: "#F1F5F9", dot: "#64748B", color: "#475569", label: "Already Booked" }
    : reviewPending
      ? { bg: "#FEF3C7", dot: "#F59E0B", color: "#B45309", label: "Pending review" }
      : reviewRejected
        ? { bg: "#FEF2F2", dot: "#EF4444", color: "#B91C1C", label: "Rejected" }
        : amenity.is_mine
          ? { bg: "#D1FAF5", dot: "#0A2A43", color: "#0A2A43", label: "Yours" }
          : { bg: status.bg, dot: status.dot, color: status.color, label: status.label };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, alreadyBooked && styles.cardReserved]}
      onPress={onPress}
    >
      <View style={[styles.iconTile, { backgroundColor: visual.soft }]}>
        <AmenityIcon
          iconKey={amenity.icon_key}
          name={amenity.name}
          size={sf(22)}
          color={visual.tint}
        />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {amenity.name}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: pill.dot }]} />
            <Text style={[styles.statusText, { color: pill.color }]} numberOfLines={1}>
              {pill.label}
            </Text>
          </View>
        </View>

        {alreadyBooked && amenity.user_next_booking_date ? (
          <Text style={styles.reservedHint} numberOfLines={1}>
            Reserved for {formatLongDate(amenity.user_next_booking_date)}
          </Text>
        ) : amenity.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {amenity.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {amenity.capacity ? (
            <View style={styles.metaItem}>
              <Feather name="users" size={sf(12)} color={Colors.textMuted} />
              <Text style={styles.metaText}>Up to {amenity.capacity}</Text>
            </View>
          ) : null}
          {amenity.floor ? (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={sf(12)} color={Colors.textMuted} />
              <Text style={styles.metaText}>{amenity.floor}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Feather name="chevron-right" size={sf(18)} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

export default function Amenity() {
  const router = useRouter();
  const [amenities, setAmenities] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [amenityData, bookings] = await Promise.all([
        fetchAmenities().catch(() => []),
        fetchMyBookings().catch(() => []),
      ]);
      setAmenities(amenityData ?? []);
      setMyBookings(bookings ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const { mine, openAccess, bookable, alreadyBooked, others } = useMemo(() => {
    const enriched = amenities.map((a) => enrichAmenityBookingState(a, myBookings));
    const mineOnes = enriched.filter((a) => a.is_mine);
    const notMine = enriched.filter((a) => !a.is_mine && a.review_status !== "pending");
    const reserved = notMine.filter(
      (a) => a.user_has_upcoming_booking && (a.status === "open" || a.status === "bookable"),
    );
    const available = notMine.filter(
      (a) =>
        !a.user_has_upcoming_booking && (a.status === "open" || a.status === "bookable"),
    );
    return {
      mine: mineOnes,
      openAccess: available.filter((a) => a.status === "open"),
      bookable: available.filter((a) => a.status === "bookable"),
      alreadyBooked: reserved,
      others: notMine,
    };
  }, [amenities, myBookings]);

  const openDetail = (amenity) => {
    router.push({
      pathname: PropertyManagementRoutes.ALL_FACILITIES,
      params: amenityFacilityParams(amenity),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        titleAlign="center"
        title="Amenities"
        subtitle={loading ? " " : `${amenities.length} facilities available`}
        iconOnly
      />

      {loading ? (
        <ActivityIndicator color={Colors.brandPrimary} style={{ marginTop: sw(40) }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, pageStyles.scrollBottom]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brandPrimary}
            />
          }
        >
          {amenities.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="home" size={sf(28)} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No facilities yet</Text>
              <Text style={styles.emptyText}>
                Your community admin hasn't published amenities. Check back soon, or contact the management office.
              </Text>
            </View>
          ) : (
            <>
              {mine.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Your Amenities</Text>
                  <Text style={styles.sectionHint}>
                    You manage booking requests for these. You can’t book your own.
                  </Text>
                  <View style={styles.list}>
                    {mine.map((amenity) => (
                      <AmenityCard
                        key={amenity.id}
                        amenity={amenity}
                        onPress={() => openDetail(amenity)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {alreadyBooked.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Already booked</Text>
                  <Text style={styles.sectionHint}>
                    These return to the booking list after your reservation date passes.
                  </Text>
                  <View style={styles.list}>
                    {alreadyBooked.map((amenity) => (
                      <AmenityCard
                        key={amenity.id}
                        amenity={amenity}
                        alreadyBooked
                        onPress={() => openDetail(amenity)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {bookable.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Timed slots</Text>
                  <View style={styles.list}>
                    {bookable.map((amenity) => (
                      <AmenityCard
                        key={amenity.id}
                        amenity={amenity}
                        onPress={() => openDetail(amenity)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {openAccess.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <View style={styles.liveDot} />
                    <Text style={styles.sectionTitle}>Open availability</Text>
                  </View>
                  <View style={styles.list}>
                    {openAccess.map((amenity) => (
                      <AmenityCard
                        key={amenity.id}
                        amenity={amenity}
                        onPress={() => openDetail(amenity)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {others.filter((a) => a.status === "closed").length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Closed</Text>
                  <View style={styles.list}>
                    {others
                      .filter((a) => a.status === "closed")
                      .map((amenity) => (
                        <AmenityCard
                          key={amenity.id}
                          amenity={amenity}
                          onPress={() => openDetail(amenity)}
                        />
                      ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(12),
    gap: sw(18),
  },

  section: { gap: sw(12) },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  liveDot: {
    width: sw(8),
    height: sw(8),
    borderRadius: sw(4),
    backgroundColor: "#10B981",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(16),
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionHint: {
    marginTop: sw(4),
    marginBottom: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
    lineHeight: sf(17),
  },
  list: { gap: sw(10) },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: sw(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardReserved: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  iconTile: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    flexShrink: 0,
  },
  statusDot: { width: sw(6), height: sw(6), borderRadius: sw(3) },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(10),
  },
  cardDesc: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
  reservedHint: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#64748B",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: sw(8),
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: sw(5) },
  metaText: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textMuted,
  },

  empty: {
    alignItems: "center",
    paddingVertical: sw(40),
    paddingHorizontal: sw(16),
    gap: sw(10),
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  emptyIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(16),
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(2),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: sf(19),
  },
});
