import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import SearchInput from "../../../components/ui/search-input";
import NearbyMap from "../../../components/discover/nearby-map";
import SuggestPlaceSheet from "../../../components/discover/suggest-place-sheet";
import { HomeTheme as T } from "../../../constants/home-theme";
import { Fonts } from "../../../constants/font";
import { formatPlaceDistance } from "../../../constants/location-radius";
import { communityUsesMiles } from "../../../utils/community-language";
import { fetchEssentials } from "../../../services/community-directory-api";
import { listingCategoryLabel } from "../../../components/discover/category-picker";
import { setNearbyPlaceDraft } from "../../../services/nearby-place-draft";
import { getCachedUser, subscribeSessionUser } from "../../../services/auth-session";
import { currentCommunityId, isCommunityAdmin, membershipForCommunity } from "../../../services/community-access";
import { sf, sw } from "../../../utils/responsive";

const SECTION_ICONS = {
  health: "pulse-outline",
  burial: "flower-outline",
  parking: "car-outline",
  clubs: "people-outline",
  food: "restaurant-outline",
  restaurants: "restaurant-outline",
  shopping: "bag-handle-outline",
  hospitals: "medical-outline",
  pharmacies: "medkit-outline",
};

function entryAsPlace(entry, sectionKey) {
  const latitude = entry.latitude ?? null;
  const longitude = entry.longitude ?? null;
  return {
    id: `essential-${entry.id}`,
    name: entry.title,
    category: sectionKey,
    address: entry.address || null,
    phone: entry.phone || null,
    description: entry.description || entry.body || null,
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
    distanceMeters: Number(entry.distance_meters ?? 0),
    verified: Boolean(entry.verified),
    source: "community",
    isCommunityEssential: true,
  };
}

export default function DiscoverEssentialScreen() {
  const { section } = useLocalSearchParams();
  const sectionKey = String(Array.isArray(section) ? section[0] : section || "health");
  const { t } = useTranslation();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState(() => getCachedUser());
  const creatingPlace = isCommunityAdmin(sessionUser);
  const activeCommunity = membershipForCommunity(sessionUser, currentCommunityId(sessionUser))?.community;
  const useMiles = communityUsesMiles(activeCommunity, sessionUser);

  React.useEffect(() => subscribeSessionUser(setSessionUser), []);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchEssentials({ includePlaces: false })
      .then(setPayload)
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    void reload();
  }, [reload]));

  const current = useMemo(
    () => (payload?.sections || []).find((item) => item.key === sectionKey) || { entries: [], label: "" },
    [payload, sectionKey],
  );

  const title = listingCategoryLabel(sectionKey, t, current.label);

  const entries = useMemo(() => {
    const rows = current.entries || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((entry) => {
      const hay = [entry.title, entry.description, entry.body, entry.address, entry.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [current.entries, query]);

  const mapPlaces = useMemo(
    () => entries.map((entry) => entryAsPlace(entry, sectionKey)),
    [entries, sectionKey],
  );

  const hasMap = Boolean(
    payload?.hasCoordinates && payload?.latitude != null && payload?.longitude != null,
  );

  const serviceCountLabel = t("topBar.essentialServicesCount", { count: entries.length });

  function openEntry(entry) {
    const place = entryAsPlace(entry, sectionKey);
    setNearbyPlaceDraft(place);
    router.push({
      pathname: "/screens/nearby-place-detail",
      params: {
        id: place.id,
        ...(place.latitude != null && place.longitude != null
          ? { lat: String(place.latitude), lng: String(place.longitude) }
          : {}),
      },
    });
  }

  return (
    <View style={styles.screen}>
      <InternalScreenHeader
        title={title}
        subtitle={t("topBar.essentialSectionApprovedSub")}
        compact
        dense
      />
      <View style={styles.controls}>
        <SearchInput
          placeholder={t("topBar.essentialSectionSearch", { section: title })}
          value={query}
          onChangeText={setQuery}
          imeSync={false}
          containerStyle={styles.search}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {hasMap ? (
            <View style={styles.mapWrap}>
              <NearbyMap
                latitude={payload.latitude}
                longitude={payload.longitude}
                places={mapPlaces}
              />
              <Pressable
                style={styles.mapExpand}
                onPress={() => setMapOpen(true)}
                accessibilityRole="button"
              >
                <Feather name="map" size={sf(13)} color="#334155" />
                <Text style={styles.mapExpandText}>{t("topBar.essentialMapView")}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.listHead}>
            <Text style={styles.listTitle}>{t("topBar.essentialListingsTitle")}</Text>
            <Text style={styles.listCount}>{serviceCountLabel}</Text>
          </View>

          {entries.length === 0 ? (
            <Text style={styles.empty}>{t("services.essentialServicesEmpty")}</Text>
          ) : (
            <View style={styles.listCard}>
              {entries.map((entry, index) => {
                const distance = formatPlaceDistance(entry.distance_meters, useMiles);
                return (
                  <Pressable
                    key={entry.id}
                    style={[styles.row, index < entries.length - 1 && styles.rowDivider]}
                    android_ripple={{ color: "#F1F5F9" }}
                    onPress={() => openEntry(entry)}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons
                        name={SECTION_ICONS[sectionKey] || "location-outline"}
                        size={sf(22)}
                        color={T.deepTeal}
                      />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName} numberOfLines={1}>{entry.title}</Text>
                      {entry.address ? (
                        <Text style={styles.rowMeta} numberOfLines={2}>{entry.address}</Text>
                      ) : (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {t("topBar.essentialListingArea", {
                            category: listingCategoryLabel(sectionKey, t, current.label),
                          })}
                        </Text>
                      )}
                      {entry.phone ? (
                        <View style={styles.detailLine}>
                          <Feather name="phone" size={sf(12)} color={T.deepTeal} />
                          <Text style={styles.detailPhone} numberOfLines={1}>{entry.phone}</Text>
                        </View>
                      ) : null}
                      {entry.description || entry.body ? (
                        <Text style={styles.detailNote} numberOfLines={2}>
                          {entry.description || entry.body}
                        </Text>
                      ) : null}
                      {distance ? (
                        <Text style={styles.rowDistance}>
                          {t("topBar.approxDistanceAway", { distance })}
                        </Text>
                      ) : null}
                      {entry.verified ? (
                        <View style={styles.badge}>
                          <Feather name="check-circle" size={sf(12)} color={T.deepTeal} />
                          <Text style={styles.badgeText}>{t("topBar.communityApprovedBadge")}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={sf(18)} color="#C5CDD6" style={styles.rowChevron} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            style={styles.suggestBtn}
            onPress={() => setSuggestOpen(true)}
            accessibilityRole="button"
          >
            <Feather name="plus" size={sf(16)} color={T.deepTeal} />
            <Text style={styles.suggestBtnText}>
              {creatingPlace
                ? t("topBar.createPlaceAction")
                : t("topBar.suggestEssentialForSection", { section: title })}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <View style={styles.mapScreen}>
          <View style={styles.mapBar}>
            <Text style={styles.mapBarTitle}>{title}</Text>
            <Pressable onPress={() => setMapOpen(false)} hitSlop={10} style={styles.mapClose}>
              <Feather name="x" size={sf(18)} color="#334155" />
            </Pressable>
          </View>
          {hasMap ? (
            <NearbyMap
              latitude={payload.latitude}
              longitude={payload.longitude}
              places={mapPlaces}
              height={windowHeight - sw(88)}
            />
          ) : null}
        </View>
      </Modal>

      <SuggestPlaceSheet
        visible={suggestOpen}
        mode="suggest"
        creating={creatingPlace}
        defaultCategory={sectionKey}
        onClose={() => setSuggestOpen(false)}
        onSubmitted={() => reload()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  controls: { paddingHorizontal: sw(16), paddingTop: sw(4), paddingBottom: sw(10), gap: sw(10) },
  search: {
    height: sw(48),
    borderRadius: sw(16),
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    paddingHorizontal: sw(16),
  },
  scroll: { paddingHorizontal: sw(16), paddingBottom: sw(40) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapWrap: { borderRadius: sw(16), overflow: "hidden", marginBottom: sw(16) },
  mapExpand: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapExpandText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#334155" },
  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  listTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: "#0B1220" },
  listCount: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#9CA3AF" },
  listCard: {
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
    overflow: "hidden",
    marginBottom: sw(16),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F4" },
  rowIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowChevron: { marginTop: 2 },
  rowName: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0B1220" },
  rowMeta: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#6B7280" },
  detailLine: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 },
  detailPhone: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: T.deepTeal },
  detailNote: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#64748B" },
  rowDistance: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), color: "#6B7280" },
  badge: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.35)",
    backgroundColor: "#F0FDFA",
  },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: T.deepTeal },
  empty: {
    marginVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: T.gray,
    textAlign: "center",
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: sw(48),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: T.deepTeal,
    backgroundColor: T.white,
  },
  suggestBtnText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: T.deepTeal },
  mapScreen: { flex: 1, backgroundColor: "#fff" },
  mapBar: {
    minHeight: sw(56),
    paddingHorizontal: sw(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapBarTitle: { fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  mapClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
});
