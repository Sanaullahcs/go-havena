import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import SearchInput from "../../../components/ui/search-input";
import PlaceCategoryIcon from "../../../components/ui/place-category-icon";
import NearbyMap from "../../../components/discover/nearby-map";
import SuggestPlaceSheet from "../../../components/discover/suggest-place-sheet";
import { HomeTheme as T } from "../../../constants/home-theme";
import { Fonts } from "../../../constants/font";
import { formatKmLabel } from "../../../constants/location-radius";
import {
  DEFAULT_DISCOVER_RADIUS_METERS,
  DISCOVER_RADIUS_OPTIONS,
  fetchNearbyPlacesBundle,
  formatDiscoverRadius,
  mergeNearbyPlaces,
  NEARBY_PLACE_CATEGORIES,
} from "../../../services/nearby-places-api";
import { listingCategoryLabel } from "../../../components/discover/category-picker";
import { fetchEssentials } from "../../../services/community-directory-api";
import { setNearbyPlaceDraft } from "../../../services/nearby-place-draft";
import { sf, sw } from "../../../utils/responsive";

const CHIP_ICONS = {
  all: "grid-outline",
  restaurants: "restaurant-outline",
  cafes: "cafe-outline",
  pharmacies: "medkit-outline",
  hospitals: "business-outline",
  gyms: "barbell-outline",
  gas_stations: "car-outline",
  parking: "car-sport-outline",
  clubs: "people-outline",
  shopping: "bag-handle-outline",
};

const SECTION_ICONS = {
  health: "activity",
  burial: "minus-circle",
  parking: "square",
  clubs: "users",
  food: "coffee",
  restaurants: "coffee",
  shopping: "shopping-bag",
  hospitals: "plus",
  pharmacies: "plus",
};

function capitalize(value) {
  return String(value || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function statusLabel(status, t) {
  if (status === "approved") return t("topBar.suggestionApproved");
  if (status === "rejected") return t("topBar.suggestionRejected");
  return t("topBar.suggestionPending");
}

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState("nearby");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [bundle, setBundle] = useState(null);
  const [essentials, setEssentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_DISCOVER_RADIUS_METERS);
  const [resultsRadius, setResultsRadius] = useState(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sort, setSort] = useState("nearest");
  const [sortOpen, setSortOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);
  const bundleRef = useRef(null);
  bundleRef.current = bundle;
  const radiusLabel = formatDiscoverRadius(radiusMeters);
  const nearbyPending = resultsRadius !== radiusMeters;

  const load = useCallback(async (silent) => {
    const ticket = ++requestRef.current;
    const selectedRadius = radiusMeters;
    if (!silent) setLoading(true);
    setLoadingMore(true);
    setError("");
    const guidePromise = fetchEssentials({ radiusMeters: selectedRadius, includePlaces: false }).catch(() => null);
    try {
      const places = await fetchNearbyPlacesBundle({
        force: silent,
        radiusMeters: selectedRadius,
        seedBundle: bundleRef.current,
        onPage: (partial, { done }) => {
          if (ticket !== requestRef.current) return;
          setBundle(partial);
          setResultsRadius(selectedRadius);
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(!done);
        },
      }).catch((err) => {
        if (ticket === requestRef.current) setError(err?.message || t("topBar.nearbyLoadFailed"));
        return null;
      });
      if (ticket !== requestRef.current) return;
      if (places?.overpassFailed && mergeNearbyPlaces(places.byCategory).length === 0) {
        setError(t("topBar.nearbyLoadFailed"));
      }
      const guide = await guidePromise;
      if (ticket === requestRef.current && guide) setEssentials(guide);
    } finally {
      if (ticket === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [t, radiusMeters]);

  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  const places = useMemo(() => {
    const rows = category === "all"
      ? mergeNearbyPlaces(bundle?.byCategory || {})
      : (bundle?.byCategory?.[category] || []);
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((place) => [place.name, place.address, place.phone].join(" ").toLowerCase().includes(needle));
  }, [bundle, category, query]);

  const shownPlaces = useMemo(() => {
    const rows = [...places];
    if (sort === "name") {
      rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      rows.sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
    }
    return rows;
  }, [places, sort]);

  function openPlace(place) {
    setNearbyPlaceDraft(place);
    router.push({ pathname: "/screens/nearby-place-detail", params: { id: place.id } });
  }

  const sectionCopy = {
    health: { title: t("topBar.essentialHealth"), sub: t("topBar.essentialHealthSub") },
    burial: { title: t("topBar.essentialBurial"), sub: t("topBar.essentialBurialSub") },
    parking: { title: t("topBar.essentialParking"), sub: t("topBar.essentialParkingSub") },
    clubs: { title: t("topBar.essentialClubs"), sub: t("topBar.essentialClubsSub") },
    food: { title: t("topBar.essentialFood"), sub: t("topBar.essentialFoodSub") },
  };

  return (
    <View style={styles.screen}>
      <InternalScreenHeader title={t("topBar.discoverTitle")} subtitle={t("topBar.discoverScreenSub")} compact dense />
      <View style={styles.controls}>
        <SearchInput
          placeholder={t("topBar.discoverSearch")}
          value={query}
          onChangeText={setQuery}
          imeSync={false}
          containerStyle={styles.search}
          placeholderTextColor="#9CA3AF"
        />
        <View style={styles.segment}>
          {["nearby", "essentials"].map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[styles.segmentItem, active && styles.segmentItemOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextOn]} numberOfLines={1}>
                  {key === "nearby" ? t("topBar.tabNearby") : t("topBar.tabEssentials")}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.toolbar}>
          <Pressable
            style={styles.radius}
            android_ripple={{ color: "rgba(15, 23, 42, 0.06)", borderless: false }}
            onPress={() => setRadiusOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("topBar.discoverRadiusTitle")}
          >
            <Text style={styles.radiusText} numberOfLines={1}>
              {t("topBar.discoverRadiusWithin", { distance: radiusLabel })}
            </Text>
            <Feather name="chevron-down" size={sf(15)} color="#6B7280" />
          </Pressable>
          {tab === "nearby" ? (
            <View style={styles.suggestClip}>
              <Pressable
                style={styles.suggest}
                android_ripple={{ color: "rgba(13, 148, 136, 0.16)", borderless: false, foreground: true }}
                onPress={() => setSuggestOpen(true)}
                accessibilityRole="button"
              >
                <Feather name="plus" size={sf(15)} color={T.deepTeal} />
                <Text style={styles.suggestText} numberOfLines={1}>{t("topBar.suggestPlaceAction")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {nearbyPending ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : loading && !bundle && !essentials ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={T.teal} onRefresh={() => { setRefreshing(true); void load(true); }} />}
          keyboardShouldPersistTaps="handled"
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {tab === "nearby" ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
                {["all", ...NEARBY_PLACE_CATEGORIES].map((key) => {
                  const active = category === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setCategory(key)}
                      style={styles.cat}
                      android_ripple={null}
                    >
                      <View style={[styles.catIcon, active && styles.catIconOn]}>
                        <Ionicons
                          name={CHIP_ICONS[key] || "location-outline"}
                          size={sf(22)}
                          color={active ? T.deepTeal : "#6B7280"}
                        />
                      </View>
                      <Text style={[styles.catLabel, active && styles.catLabelOn]} numberOfLines={2}>
                        {key === "all" ? t("topBar.categoryAll") : t(`topBar.category${capitalize(key)}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {bundle?.hasCoordinates ? (
                <View style={styles.mapWrap}>
                  <NearbyMap latitude={bundle.latitude} longitude={bundle.longitude} places={shownPlaces} />
                  <Pressable style={styles.expand} onPress={() => setMapOpen(true)} accessibilityRole="button">
                    <Feather name="maximize-2" size={sf(13)} color="#334155" />
                    <Text style={styles.expandText}>{t("topBar.discoverExpandMap")}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.empty}>{t("topBar.noCommunityPin")}</Text>
              )}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t("topBar.aroundYou")}</Text>
                <Pressable style={styles.sortPill} onPress={() => setSortOpen(true)} accessibilityRole="button">
                  <Text style={styles.sortText}>
                    {sort === "name" ? t("topBar.discoverSortName") : t("topBar.discoverSortNearest")}
                  </Text>
                  <Feather name="chevron-down" size={sf(14)} color="#475569" />
                </Pressable>
              </View>
              {shownPlaces.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Feather name="map" size={sf(20)} color="#94A3B8" />
                  <Text style={styles.empty}>{t("topBar.noBusinessesInCategory")}</Text>
                </View>
              ) : (
                <View style={styles.list}>
                  {shownPlaces.map((place, index) => (
                    <Pressable
                      key={place.id}
                      style={[styles.row, index < shownPlaces.length - 1 && styles.rowDivider]}
                      android_ripple={{ color: "#F1F5F9" }}
                      onPress={() => openPlace(place)}
                    >
                      <PlaceCategoryIcon category={place.category} />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {place.address || t(`topBar.category${capitalize(place.category)}`, { defaultValue: place.category })}
                        </Text>
                      </View>
                      <View style={styles.rowEnd}>
                        {place.distanceMeters ? (
                          <Text style={styles.distance}>{formatKmLabel(place.distanceMeters)}</Text>
                        ) : null}
                        <Feather name="chevron-right" size={sf(16)} color="#C5CDD6" />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              {loadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator color={T.teal} size="small" />
                  <Text style={styles.loadingMoreText}>{t("topBar.discoverLoadingMore")}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {(essentials?.sections || []).map((section) => {
                const sectionEntries = section.entries || [];
                return (
                <Pressable
                  key={section.key}
                  style={styles.essential}
                  onPress={() => router.push({
                    pathname: "/screens/discover-essential",
                    params: { section: section.key },
                  })}
                >
                  <View style={styles.essentialIcon}>
                    <Feather name={SECTION_ICONS[section.key] || "map-pin"} size={sf(16)} color={T.navy} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName}>{listingCategoryLabel(section.key, t, section.label)}</Text>
                    <Text style={styles.rowMeta}>{sectionCopy[section.key]?.sub || t("topBar.localListingsOnly")}</Text>
                    {sectionEntries.slice(0, 3).map((entry) => (
                      <Text key={entry.id} style={styles.essentialPlace} numberOfLines={1}>
                        {entry.title}{entry.distance_meters ? ` · ${formatKmLabel(entry.distance_meters)}` : ""}
                      </Text>
                    ))}
                    {sectionEntries.length > 3 ? (
                      <Text style={styles.essentialPlace}>
                        {t("topBar.essentialMorePlaces", { count: sectionEntries.length })}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
                </Pressable>
                );
              })}
              {loadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator color={T.teal} size="small" />
                  <Text style={styles.loadingMoreText}>{t("topBar.discoverLoadingMore")}</Text>
                </View>
              ) : null}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t("topBar.yourSuggestions")}</Text>
              </View>
              {(essentials?.suggestions || []).length === 0 ? (
                <Text style={styles.empty}>{t("topBar.noSuggestions")}</Text>
              ) : essentials.suggestions.map((item) => (
                <View key={item.id} style={styles.suggestion}>
                  <Text style={styles.rowName}>{item.name || t("topBar.reportUpdate")}</Text>
                  <Text style={styles.rowMeta}>{statusLabel(item.status, t)}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
      <Modal visible={radiusOpen} transparent animationType="slide" onRequestClose={() => setRadiusOpen(false)}>
        <View style={styles.radiusBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRadiusOpen(false)} />
          <View style={styles.radiusSheet}>
            <View style={styles.grabber} />
            <View style={styles.radiusHead}>
              <View style={styles.radiusCopy}>
                <Text style={styles.radiusTitle}>{t("topBar.discoverRadiusTitle")}</Text>
                <Text style={styles.radiusSub}>{t("topBar.discoverRadiusSub")}</Text>
              </View>
              <Pressable
                onPress={() => setRadiusOpen(false)}
                hitSlop={10}
                style={styles.radiusClose}
                accessibilityRole="button"
                accessibilityLabel={t("common.close", { defaultValue: "Close" })}
              >
                <Feather name="x" size={sf(18)} color="#64748B" />
              </Pressable>
            </View>
            <View style={styles.radiusGrid}>
              {DISCOVER_RADIUS_OPTIONS.map((meters) => {
                const selected = meters === radiusMeters;
                return (
                  <Pressable
                    key={meters}
                    style={[styles.radiusChip, selected && styles.radiusChipOn]}
                    android_ripple={{ color: T.mint }}
                    onPress={() => {
                      setRadiusOpen(false);
                      if (meters !== radiusMeters) setRadiusMeters(meters);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.radiusChipText, selected && styles.radiusChipTextOn]}>
                      {formatDiscoverRadius(meters)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <View style={styles.mapScreen}>
          <View style={styles.mapBar}>
            <Text style={styles.mapBarTitle}>{t("topBar.aroundYou")}</Text>
            <Pressable onPress={() => setMapOpen(false)} hitSlop={10} style={styles.radiusClose} accessibilityRole="button">
              <Feather name="x" size={sf(18)} color="#334155" />
            </Pressable>
          </View>
          {bundle?.hasCoordinates ? (
            <NearbyMap
              latitude={bundle.latitude}
              longitude={bundle.longitude}
              places={shownPlaces}
              height={windowHeight - sw(88)}
            />
          ) : null}
        </View>
      </Modal>
      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.radiusBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} />
          <View style={styles.sortSheet}>
            <View style={styles.grabber} />
            <Text style={styles.sortTitle}>{t("topBar.discoverSortTitle")}</Text>
            {[
              ["nearest", t("topBar.discoverSortNearest"), "navigation"],
              ["name", t("topBar.discoverSortName"), "type"],
            ].map(([key, label, icon]) => {
              const selected = sort === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.sortOption, selected && styles.sortOptionOn]}
                  android_ripple={{ color: "rgba(13, 148, 136, 0.12)" }}
                  onPress={() => { setSort(key); setSortOpen(false); }}
                >
                  <View style={[styles.sortIcon, selected && styles.sortIconOn]}>
                    <Feather name={icon} size={sf(15)} color={selected ? T.deepTeal : "#64748B"} />
                  </View>
                  <Text style={[styles.sortOptionText, selected && styles.sortOptionTextOn]}>{label}</Text>
                  {selected ? <Feather name="check" size={sf(16)} color={T.deepTeal} /> : <View style={styles.sortCheck} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <SuggestPlaceSheet
        visible={suggestOpen}
        mode="suggest"
        onClose={() => setSuggestOpen(false)}
        onSubmitted={() => load(true)}
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
  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: sw(18),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: "#E8ECF0",
  },
  segmentItem: {
    flex: 1,
    minHeight: sw(42),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  segmentItemOn: { backgroundColor: T.deepTeal },
  segmentText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#6B7280" },
  segmentTextOn: { fontFamily: Fonts.semiBold, color: "#fff" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  radius: {
    overflow: "hidden",
    minHeight: sw(38),
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  radiusText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#111827" },
  suggestClip: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: T.white,
  },
  suggest: {
    overflow: "hidden",
    minHeight: sw(38),
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: T.deepTeal,
    backgroundColor: T.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  suggestText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.deepTeal },
  radiusBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" },
  radiusSheet: {
    backgroundColor: T.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: sw(20),
    paddingTop: 10,
    paddingBottom: sw(28),
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", marginBottom: 14 },
  radiusHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  radiusCopy: { flex: 1 },
  radiusTitle: { fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  radiusSub: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  radiusClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  radiusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radiusChip: {
    width: "23%",
    flexGrow: 1,
    overflow: "hidden",
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  radiusChipOn: { backgroundColor: T.deepTeal, borderColor: T.deepTeal },
  radiusChipText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  radiusChipTextOn: { fontFamily: Fonts.semiBold, color: "#fff" },
  scroll: { paddingHorizontal: sw(16), paddingBottom: sw(40) },
  cats: { gap: sw(4), paddingTop: sw(8), paddingBottom: sw(14), paddingRight: sw(12) },
  cat: { width: sw(78), alignItems: "center", backgroundColor: "transparent", paddingVertical: 4 },
  catIcon: {
    width: sw(46),
    height: sw(46),
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  catIconOn: { backgroundColor: "#D1FAF5" },
  catLabel: { marginTop: 6, minHeight: sf(28), fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(14), color: "#6B7280", textAlign: "center" },
  catLabelOn: { color: T.deepTeal, fontFamily: Fonts.semiBold },
  mapWrap: { borderRadius: sw(16), overflow: "hidden" },
  expand: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  expandText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#334155" },
  mapScreen: { flex: 1, backgroundColor: "#fff" },
  mapBar: {
    minHeight: sw(56),
    paddingHorizontal: sw(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapBarTitle: { fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  sectionHead: { marginTop: sw(18), marginBottom: sw(8), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: sf(22), color: "#0B1220", letterSpacing: -0.3 },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: T.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  sortText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#334155" },
  sortSheet: {
    backgroundColor: T.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: sw(16),
    paddingTop: 10,
    paddingBottom: sw(28),
  },
  sortTitle: { marginBottom: 12, fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  sortOption: {
    minHeight: 52,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
  },
  sortOptionOn: { backgroundColor: "#E6F7F4", borderColor: "#99F6E4" },
  sortIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  sortIconOn: { backgroundColor: "#CCFBF1" },
  sortCheck: { width: 16 },
  sortOptionText: { fontFamily: Fonts.medium, fontSize: sf(15), color: "#0F172A" },
  sortOptionTextOn: { fontFamily: Fonts.semiBold, color: T.deepTeal },
  list: { backgroundColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F4" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 2 },
  rowName: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0B1220" },
  rowMeta: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), color: "#9CA3AF" },
  distance: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#6B7280" },
  emptyCard: {
    alignItems: "center",
    gap: 4,
    paddingVertical: sw(24),
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#DCE5EC",
    backgroundColor: T.white,
  },
  empty: { marginTop: 8, fontFamily: Fonts.regular, fontSize: sf(13), color: T.gray, textAlign: "center" },
  error: { color: "#B91C1C", fontFamily: Fonts.medium, marginBottom: 8 },
  loadingMore: { marginTop: sw(16), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingMoreText: { fontFamily: Fonts.medium, fontSize: sf(13), color: T.gray },
  essential: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.white, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 10 },
  essentialIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.mint, alignItems: "center", justifyContent: "center" },
  essentialPlace: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), color: "#334155" },
  suggestion: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
