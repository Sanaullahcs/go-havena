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
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, usePathname } from "expo-router";
import ScreenHeader from "../../../../components/layout/screen-header";
import AmenityIcon from "../../../../components/property/amenity-icon";
import { Fonts } from "../../../../constants/font";
import { Colors, Layout } from "../../../../constants/tokens";
import { sw, sf } from "../../../../utils/responsive";
import { pageStyles } from "../../../../constants/page-styles";
import {
  amenityFacilityParams,
  amenityFlowRoutes,
} from "../../../../constants/property-management-routes";
import { fetchAmenities, fetchMyBookings } from "../../../../services/amenity-api";
import { getApiErrorMessage, isNetworkLikeError } from "../../../../utils/api-error-core";
import {
  getAmenityVisual,
  getAmenityStatus,
  enrichAmenityBookingState,
  amenityMatchesSearch,
  formatLongDate,
} from "../../../../utils/amenity-display";
import SearchInput from "../../../../components/ui/search-input";
import { chevronForward } from "../../../../utils/rtl";
import { localizedField } from "../../../../i18n";
import { rnShadow } from "../../../../utils/shadow";

const FILTERS = [
  { key: "all", labelKey: "propertyMgmt.allFilter" },
  { key: "bookable", labelKey: "propertyMgmt.timedSlots" },
  { key: "open", labelKey: "propertyMgmt.freeAvailability" },
  { key: "closed", labelKey: "propertyMgmt.closed" },
  { key: "mine", labelKey: "propertyMgmt.yourAmenities" },
  { key: "bookings", labelKey: "propertyMgmt.yourBookings" },
];

function AmenityCard({ amenity, onPress, alreadyBooked = false }) {
  const { t, i18n } = useTranslation();
  const name = localizedField(amenity, "name");
  const visual = getAmenityVisual(amenity.name, amenity.icon_key);
  const status = getAmenityStatus(amenity.status);
  const reviewPending = amenity.review_status === "pending";
  const reviewRejected = amenity.review_status === "rejected";
  const pill = alreadyBooked
    ? { bg: "#F1F5F9", dot: "#64748B", color: "#475569", label: t("propertyMgmt.alreadyBooked") }
    : reviewPending
      ? { bg: "#FEF3C7", dot: "#F59E0B", color: "#B45309", label: t("propertyMgmt.pendingReview") }
      : reviewRejected
        ? { bg: "#FEF2F2", dot: "#EF4444", color: "#B91C1C", label: t("propertyMgmt.rejected") }
        : amenity.is_mine
          ? { bg: "#D1FAF5", dot: "#1B4F8A", color: "#1B4F8A", label: t("propertyMgmt.yours") }
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
          name={name}
          size={sf(22)}
          color={visual.tint}
        />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {name}
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
            {t("propertyMgmt.reservedFor", { date: formatLongDate(amenity.user_next_booking_date) })}
          </Text>
        ) : amenity.description ? (
          <>
            <Text style={styles.cardDesc} numberOfLines={2}>
              {amenity.description}
            </Text>
</>
        ) : null}

        <View style={styles.metaRow}>
          {amenity.capacity ? (
            <View style={styles.metaItem}>
              <Feather name="users" size={sf(12)} color={Colors.textMuted} />
              <Text style={styles.metaText}>{t("propertyMgmt.upTo", { capacity: amenity.capacity })}</Text>
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

      <Feather name={chevronForward()} size={sf(18)} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

export default function Amenity() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [amenities, setAmenities] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const amenityData = await fetchAmenities();
      setAmenities(amenityData ?? []);
      setLoadError(null);
      try {
        const bookings = await fetchMyBookings();
        setMyBookings(bookings ?? []);
      } catch {
        setMyBookings([]);
      }
    } catch (error) {
      setAmenities([]);
      setMyBookings([]);
      setLoadError(
        isNetworkLikeError(error)
          ? { kind: "offline" }
          : { kind: "failed", message: getApiErrorMessage(error) },
      );
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

  const visibleAmenities = useMemo(
    () => amenities.filter((amenity) => amenityMatchesSearch(amenity, search)),
    [amenities, search],
  );

  const enriched = useMemo(
    () => visibleAmenities.map((a) => enrichAmenityBookingState(a, myBookings)),
    [visibleAmenities, myBookings],
  );

  const { mine, openAccess, bookable, alreadyBooked, closed } = useMemo(() => {
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
      closed: notMine.filter((a) => a.status === "closed"),
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    if (filter === "bookable") return enriched.filter((a) => a.status === "bookable");
    if (filter === "open") return enriched.filter((a) => a.status === "open");
    if (filter === "closed") return enriched.filter((a) => a.status === "closed");
    if (filter === "mine") return enriched.filter((a) => a.is_mine);
    if (filter === "bookings") {
      return enriched.filter((a) => a.user_has_upcoming_booking && !a.is_mine);
    }
    return enriched;
  }, [enriched, filter]);

  const visibleCount = filter === "all" ? visibleAmenities.length : filtered.length;

  const openDetail = (amenity) => {
    router.push({
      pathname: amenityFlowRoutes(pathname).allFacilities,
      params: amenityFacilityParams(amenity),
    });
  };

  const renderCards = (items, { markBooked = false } = {}) => (
    <View style={styles.list}>
      {items.map((amenity) => (
        <AmenityCard
          key={amenity.id}
          amenity={amenity}
          alreadyBooked={markBooked || (Boolean(amenity.user_has_upcoming_booking) && !amenity.is_mine)}
          onPress={() => openDetail(amenity)}
        />
      ))}
    </View>
  );

  const allEmpty =
    mine.length === 0 &&
    alreadyBooked.length === 0 &&
    bookable.length === 0 &&
    openAccess.length === 0 &&
    closed.length === 0;
  const listEmpty =
    amenities.length === 0 ||
    (search.trim() && enriched.length === 0) ||
    (filter !== "all" && filtered.length === 0) ||
    (filter === "all" && allEmpty);
  const emptyTitle =
    amenities.length === 0 ? t("propertyMgmt.noFacilities") : t("propertyMgmt.noFilterFacilities");
  const emptyText =
    amenities.length === 0
      ? t("propertyMgmt.noFacilitiesDesc")
      : t("propertyMgmt.noFilterFacilitiesDesc");

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        titleAlign="center"
        title={t("propertyMgmt.amenityTitle")}
        subtitle={
          loading || loadError ? " " : t("propertyMgmt.facilitiesAvailable", { count: visibleCount })
        }
        iconOnly
      />

      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
          style={styles.filterScroll}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.85}
                onPress={() => setFilter(item.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.labelKey)}
              >
                <Text
                  style={[styles.filterChipText, active && styles.filterChipTextActive]}
                  numberOfLines={1}
                >
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brandPrimary} style={{ marginTop: sw(40) }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, pageStyles.scrollBottom]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brandPrimary}
            />
          }
        >
          {amenities.length > 0 ? (
            <SearchInput
              placeholder={t("propertyMgmt.searchAmenities")}
              value={search}
              onChangeText={setSearch}
            />
          ) : null}

          {loadError ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather
                  name={loadError.kind === "offline" ? "wifi-off" : "alert-circle"}
                  size={sf(28)}
                  color="#94A3B8"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {loadError.kind === "offline"
                  ? t("propertyMgmt.offlineTitle")
                  : t("propertyMgmt.loadFailed")}
              </Text>
              <Text style={styles.emptyText}>
                {loadError.kind === "offline"
                  ? t("propertyMgmt.offlineBody")
                  : loadError.message}
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                activeOpacity={0.85}
                onPress={() => load(false)}
                accessibilityRole="button"
                accessibilityLabel={t("propertyMgmt.retry")}
              >
                <Text style={styles.retryText}>{t("propertyMgmt.retry")}</Text>
              </TouchableOpacity>
            </View>
          ) : listEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="home" size={sf(28)} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>
                {search.trim() && enriched.length === 0
                  ? t("propertyMgmt.noAmenitiesMatch")
                  : emptyTitle}
              </Text>
              {search.trim() && enriched.length === 0 ? null : (
                <Text style={styles.emptyText}>{emptyText}</Text>
              )}
            </View>
          ) : filter !== "all" ? (
            renderCards(filtered, { markBooked: filter === "bookings" })
          ) : (
            <>
              {mine.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t("propertyMgmt.yourAmenities")}</Text>
                  <Text style={styles.sectionHint}>
                    {t("propertyMgmt.manageBookingHint")}
                  </Text>
                  {renderCards(mine)}
                </View>
              ) : null}

              {alreadyBooked.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t("propertyMgmt.yourBookings")}</Text>
                  <Text style={styles.sectionHint}>
                    {t("propertyMgmt.alreadyBookedHint")}
                  </Text>
                  {renderCards(alreadyBooked, { markBooked: true })}
                </View>
              ) : null}

              {bookable.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t("propertyMgmt.timedSlots")}</Text>
                  {renderCards(bookable)}
                </View>
              ) : null}

              {openAccess.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <View style={styles.liveDot} />
                    <Text style={styles.sectionTitle}>{t("propertyMgmt.freeAvailability")}</Text>
                  </View>
                  {renderCards(openAccess)}
                </View>
              ) : null}

              {closed.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t("propertyMgmt.closed")}</Text>
                  {renderCards(closed)}
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
  toolbar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: sw(12),
    gap: sw(8),
    minHeight: sw(56),
  },
  filterChip: {
    backgroundColor: "#F1F5F9",
    height: sw(36),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  filterChipActive: { backgroundColor: "#1B4F8A" },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: "#4A5565",
    fontWeight: "500",
  },
  filterChipTextActive: {
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    fontWeight: "700",
  },
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
    ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
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
  retryBtn: {
    marginTop: sw(6),
    backgroundColor: Colors.brandPrimary,
    borderRadius: 999,
    paddingHorizontal: sw(18),
    paddingVertical: sw(10),
  },
  retryText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(13),
    color: "#FFFFFF",
  },
});
