import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getCachedUser, subscribeSessionUser } from "../../../services/auth-session";
import { isCommunityAdmin } from "../../../services/community-access";
import { setNearbyPlaceDraft } from "../../../services/nearby-place-draft";
import { sf, sw } from "../../../utils/responsive";
import { useNow } from "../../../hooks/use-now";
import EssentialSuggestionRow from "../../../components/discover/essential-suggestion-row";
import { setPlaceSuggestionDraft } from "../../../services/place-suggestion-draft";

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

const ESSENTIAL_ION_ICONS = {
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

function capitalize(value) {
  return String(value || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const now = useNow();
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
  const [sessionUser, setSessionUser] = useState(() => getCachedUser());
  const creatingPlace = isCommunityAdmin(sessionUser);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_DISCOVER_RADIUS_METERS);
  const [resultsRadius, setResultsRadius] = useState(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sort, setSort] = useState("nearest");
  const [sortOpen, setSortOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [essentialsLoading, setEssentialsLoading] = useState(true);
  const requestRef = useRef(0);
  const bundleRef = useRef(null);
  bundleRef.current = bundle;
  useEffect(() => subscribeSessionUser(setSessionUser), []);

  const radiusLabel = formatDiscoverRadius(radiusMeters);
  const nearbyPending = resultsRadius !== radiusMeters;

  const load = useCallback(async (silent) => {
    const ticket = ++requestRef.current;
    const selectedRadius = radiusMeters;
    if (!silent) {
      setLoading(true);
      setEssentialsLoading(true);
    }
    setLoadingMore(true);
    setError("");
    const emptyEssentials = { sections: [], suggestions: [], categories: [] };
    void fetchEssentials({ radiusMeters: selectedRadius, includePlaces: false })
      .then((guide) => {
        if (ticket !== requestRef.current) return;
        setEssentials(guide || emptyEssentials);
      })
      .catch(() => {
        if (ticket === requestRef.current) setEssentials(emptyEssentials);
      })
      .finally(() => {
        if (ticket === requestRef.current) setEssentialsLoading(false);
      });
    try {
      const places = await fetchNearbyPlacesBundle({
        force: silent,
        radiusMeters: selectedRadius,
        seedBundle: bundleRef.current,
        onPage: (partial, { done }) => {
          if (ticket !== requestRef.current) return;
          setBundle(partial);
          setResultsRadius(selectedRadius);
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

  const mapCenter = useMemo(() => {
    const pick = (latitude, longitude) => {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { latitude: lat, longitude: lng };
    };

    const fromBundle = bundle?.hasCoordinates ? pick(bundle.latitude, bundle.longitude) : null;
    if (fromBundle) return fromBundle;

    const fromEssentials = essentials?.hasCoordinates
      ? pick(essentials.latitude, essentials.longitude)
      : null;
    if (fromEssentials) return fromEssentials;

    const pinned = shownPlaces.find(
      (place) => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)),
    );
    return pinned ? pick(pinned.latitude, pinned.longitude) : null;
  }, [bundle, essentials, shownPlaces]);

  function openPlace(place) {
    setNearbyPlaceDraft(place);
    router.push({ pathname: "/screens/nearby-place-detail", params: { id: place.id } });
  }

  function openSuggestion(item) {
    setPlaceSuggestionDraft(item);
    router.push({ pathname: "/screens/discover-suggestion-detail", params: { id: String(item.id) } });
  }

  function openAllSuggestions() {
    router.push("/screens/discover-suggestions");
  }

  const previewSuggestions = useMemo(
    () => (essentials?.suggestions || []).slice(0, 2),
    [essentials?.suggestions],
  );

  const sectionCopy = {
    health: { title: t("topBar.essentialHealth"), sub: t("topBar.essentialHealthListSub") },
    burial: { title: t("topBar.essentialBurial"), sub: t("topBar.essentialBurialListSub") },
    parking: { title: t("topBar.essentialParking"), sub: t("topBar.essentialParkingListSub") },
    clubs: { title: t("topBar.essentialClubs"), sub: t("topBar.essentialClubsListSub") },
    food: { title: t("topBar.essentialFood"), sub: t("topBar.essentialFoodListSub") },
  };

  const essentialSections = useMemo(() => {
    const withEntries = (essentials?.sections || []).filter(
      (section) => (section.entries || []).length > 0,
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return withEntries;
    return withEntries.filter((section) => {
      const title = listingCategoryLabel(section.key, t, section.label).toLowerCase();
      const sub = (sectionCopy[section.key]?.sub || t("topBar.localListingsOnly")).toLowerCase();
      return title.includes(needle) || sub.includes(needle);
    });
  }, [essentials, query, t]);

  const essentialsSearchActive = tab === "essentials" && query.trim().length > 0;
  const essentialsShowEmpty = tab === "essentials" && !essentialsLoading && essentialSections.length === 0;
  const essentialsTrulyEmpty = essentialsShowEmpty && !essentialsSearchActive;
  const suggestionItems = essentials?.suggestions || [];
  const hasSuggestions = suggestionItems.length > 0;

  return (
    <View style={styles.screen}>
      <InternalScreenHeader title={t("topBar.discoverTitle")} subtitle={t("topBar.discoverScreenSub")} compact dense />
      <View style={styles.controls}>
        <SearchInput
          placeholder={tab === "essentials" ? t("topBar.discoverSearchEssentials") : t("topBar.discoverSearch")}
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
        {tab === "nearby" ? (
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
            <View style={styles.suggestClip}>
              <Pressable
                style={styles.suggest}
                android_ripple={{ color: "rgba(13, 148, 136, 0.16)", borderless: false, foreground: true }}
                onPress={() => setSuggestOpen(true)}
                accessibilityRole="button"
              >
                <Feather name="plus" size={sf(15)} color={T.deepTeal} />
                <Text style={styles.suggestText} numberOfLines={1}>
                  {creatingPlace ? t("topBar.createPlaceAction") : t("topBar.suggestPlaceAction")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.suggestEssentialsRow}
            android_ripple={{ color: "rgba(13, 148, 136, 0.14)", borderless: false, foreground: true }}
            onPress={() => setSuggestOpen(true)}
            accessibilityRole="button"
          >
            <Feather name="plus" size={sf(16)} color={T.deepTeal} />
            <Text style={styles.suggestEssentialsRowText}>
              {creatingPlace ? t("topBar.createPlaceAction") : t("topBar.suggestServiceAction")}
            </Text>
          </Pressable>
        )}
      </View>

      {tab === "nearby" && nearbyPending ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : tab === "nearby" && loading && !bundle ? (
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
              {mapCenter ? (
                <View style={styles.mapWrap}>
                  <NearbyMap
                    latitude={mapCenter.latitude}
                    longitude={mapCenter.longitude}
                    places={shownPlaces}
                  />
                  <Pressable style={styles.expand} onPress={() => setMapOpen(true)} accessibilityRole="button">
                    <Feather name="maximize-2" size={sf(13)} color="#334155" />
                    <Text style={styles.expandText}>{t("topBar.discoverExpandMap")}</Text>
                  </Pressable>
                </View>
              ) : loading || loadingMore ? (
                <View style={[styles.mapWrap, styles.mapSkeleton]}>
                  <ActivityIndicator color={T.teal} />
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
              {!essentialsTrulyEmpty ? (
                <View style={styles.resourcesHeader}>
                  <Text style={styles.resourcesTitle}>{t("topBar.communityResources")}</Text>
                  <Text style={styles.resourcesSub}>{t("topBar.communityResourcesSub")}</Text>
                </View>
              ) : null}
              {essentialsLoading && essentialSections.length === 0 ? (
                <View style={styles.essentialsEmptyCard}>
                  <ActivityIndicator color={T.teal} />
                  <Text style={styles.loadingMoreText}>{t("topBar.discoverLoadingEssentials")}</Text>
                </View>
              ) : essentialsTrulyEmpty ? (
                <View style={styles.essentialsEmptyCard}>
                  <View style={styles.essentialsEmptyIcon}>
                    <Ionicons name="layers-outline" size={sf(28)} color={T.deepTeal} />
                  </View>
                  <Text style={styles.essentialsEmptyTitle}>{t("topBar.essentialsEmptyTitle")}</Text>
                  <Text style={styles.essentialsEmptyBody}>{t("topBar.essentialsEmptyBody")}</Text>
                  <Pressable
                    style={styles.essentialsEmptyBtn}
                    onPress={() => setSuggestOpen(true)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.essentialsEmptyBtnText}>
                      {creatingPlace ? t("topBar.createPlaceAction") : t("topBar.suggestServiceAction")}
                    </Text>
                  </Pressable>
                </View>
              ) : essentialsShowEmpty ? (
                <View style={styles.essentialsEmptyCard}>
                  <Text style={styles.essentialsEmptyBody}>{t("common.noResults")}</Text>
                </View>
              ) : (
                <View style={styles.resourcesList}>
                  {essentialSections.map((section, index) => {
                    const count = (section.entries || []).length;
                    const copy = sectionCopy[section.key];
                    return (
                      <Pressable
                        key={section.key}
                        style={[
                          styles.resourceRow,
                          index < essentialSections.length - 1 && styles.resourceRowDivider,
                        ]}
                        android_ripple={{ color: "#F1F5F9" }}
                        onPress={() => router.push({
                          pathname: "/screens/discover-essential",
                          params: { section: section.key },
                        })}
                      >
                        <View style={styles.resourceIcon}>
                          <Ionicons
                            name={ESSENTIAL_ION_ICONS[section.key] || "grid-outline"}
                            size={sf(22)}
                            color={T.deepTeal}
                          />
                        </View>
                        <View style={styles.rowCopy}>
                          <Text style={styles.resourceName} numberOfLines={1}>
                            {copy?.title || listingCategoryLabel(section.key, t, section.label)}
                          </Text>
                          <Text style={styles.resourceMeta} numberOfLines={2}>
                            {copy?.sub || t("topBar.localListingsOnly")}
                          </Text>
                        </View>
                        <View style={styles.resourceEnd}>
                          <Text style={styles.resourceCount}>{count}</Text>
                          <Feather name="chevron-right" size={sf(18)} color="#C5CDD6" />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {creatingPlace ? null : hasSuggestions ? (
                <>
                  <View style={[styles.sectionHead, styles.suggestionsHead]}>
                    <Text style={styles.resourcesTitle}>{t("topBar.yourSuggestions")}</Text>
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      onPress={openAllSuggestions}
                    >
                      <Text style={styles.viewAllLink}>{t("topBar.viewAllSuggestions")}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.resourcesList}>
                    {previewSuggestions.map((item, index) => (
                      <EssentialSuggestionRow
                        key={item.id}
                        item={item}
                        t={t}
                        now={now}
                        divider={index < previewSuggestions.length - 1}
                        onPress={() => openSuggestion(item)}
                      />
                    ))}
                  </View>
                  <View style={styles.suggestionsNote}>
                    <Feather name="info" size={sf(14)} color="#94A3B8" />
                    <Text style={styles.suggestionsNoteText}>{t("topBar.suggestionsApprovalNote")}</Text>
                  </View>
                </>
              ) : null}
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
          {mapCenter ? (
            <NearbyMap
              latitude={mapCenter.latitude}
              longitude={mapCenter.longitude}
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
        creating={creatingPlace}
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
  segmentTextOn: { fontFamily: Fonts.medium, color: "#fff" },
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
  suggestEssentials: {
    borderWidth: 0,
    backgroundColor: "#E8F8F6",
  },
  suggestEssentialsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: sw(44),
    paddingHorizontal: sw(16),
    borderRadius: 999,
    backgroundColor: "#E8F8F6",
    overflow: "hidden",
  },
  suggestEssentialsRowText: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.deepTeal,
    textAlign: "center",
  },
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
  catLabelOn: { color: T.deepTeal, fontFamily: Fonts.medium },
  mapWrap: { borderRadius: sw(16), overflow: "hidden" },
  mapSkeleton: {
    height: sw(196),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7EEF2",
  },
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
  sectionTitle: { fontFamily: Fonts.semiBold, fontSize: sf(18), color: "#0B1220", letterSpacing: -0.2 },
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
  rowName: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#0B1220" },
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
  essentialsEmptyCard: {
    alignItems: "center",
    paddingHorizontal: sw(20),
    paddingVertical: sw(28),
    marginBottom: sw(8),
    borderRadius: sw(16),
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
  },
  essentialsEmptyIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(16),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(14),
  },
  essentialsEmptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(17),
    color: "#0B1220",
    textAlign: "center",
  },
  essentialsEmptyBody: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(20),
    color: "#6B7280",
    textAlign: "center",
  },
  essentialsEmptyBtn: {
    marginTop: sw(18),
    minHeight: sw(42),
    paddingHorizontal: sw(20),
    borderRadius: 999,
    backgroundColor: T.deepTeal,
    alignItems: "center",
    justifyContent: "center",
  },
  essentialsEmptyBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.white,
  },
  loadingMore: { marginTop: sw(16), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingMoreText: { fontFamily: Fonts.medium, fontSize: sf(13), color: T.gray },
  resourcesHeader: { marginTop: sw(4), marginBottom: sw(12) },
  resourcesTitle: { fontFamily: Fonts.semiBold, fontSize: sf(18), color: "#0B1220", letterSpacing: -0.2 },
  resourcesSub: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(13), color: "#9CA3AF", lineHeight: sf(18) },
  resourcesList: {
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
    overflow: "hidden",
    marginBottom: sw(8),
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    backgroundColor: T.white,
  },
  resourceRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F4" },
  resourceIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceName: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#0B1220" },
  resourceMeta: { marginTop: 3, fontFamily: Fonts.regular, fontSize: sf(12), color: "#9CA3AF", lineHeight: sf(16) },
  resourceEnd: { flexDirection: "row", alignItems: "center", gap: 2 },
  resourceCount: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#6B7280", minWidth: sw(16), textAlign: "right" },
  suggestionsHead: { marginTop: sw(22), marginBottom: sw(10) },
  viewAllLink: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.deepTeal },
  suggestionsNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: sw(12),
    paddingHorizontal: 2,
  },
  suggestionsNoteText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: "#94A3B8", lineHeight: sf(17) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
