import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  formatKmLabel,
  walkingMinutesFromMeters,
} from "../../constants/location-radius";
import {
  fetchNearbyPlacesBundle,
  mergeNearbyPlaces,
  NEARBY_FILTER_CATEGORIES,
  NEARBY_PLACE_CATEGORIES,
} from "../../services/nearby-places-api";
import PlaceCategoryIcon from "./place-category-icon";
import NearbyPlaceDetails from "./nearby-place-details";
import SearchInput from "./search-input";
import { sf, sw } from "../../utils/responsive";

const WINDOW_HEIGHT = Dimensions.get("window").height;
const TOP_GAP = Math.round(WINDOW_HEIGHT * 0.06);
const DETAIL_SLIDE_MS = 280;

function CategoryChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.catChip, active && styles.catChipActive]}
    >
      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlaceRow({ place, t, onPress }) {
  const distance = formatKmLabel(place.distanceMeters);
  const walk = walkingMinutesFromMeters(place.distanceMeters);
  const walkLabel = walk ? t("topBar.minWalk", { count: walk }) : null;
  const categoryLabel = t(`topBar.category${capitalize(place.category)}`, {
    defaultValue: place.category || "",
  });

  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onPress(place)} activeOpacity={0.88}>
      <PlaceCategoryIcon category={place.category} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultName} numberOfLines={1}>
          {place.name}
        </Text>
        {place.address ? (
          <Text style={styles.resultMeta} numberOfLines={1}>
            {place.address}
          </Text>
        ) : (
          <Text style={styles.resultMeta} numberOfLines={1}>
            {categoryLabel}
          </Text>
        )}
        {place.phone ? (
          <Text style={styles.resultPhone} numberOfLines={1}>
            {place.phone}
          </Text>
        ) : null}
        {distance ? (
          <Text style={styles.resultWalk} numberOfLines={1}>
            {walkLabel
              ? `${t("topBar.kmAway", { distance })} · ${walkLabel}`
              : t("topBar.kmAway", { distance })}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={sf(16)} color={T.border} style={styles.rowChevron} />
    </TouchableOpacity>
  );
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function placeSearchText(place) {
  return [
    place?.name,
    place?.address,
    place?.category,
    place?.cuisine,
    place?.brand,
    place?.operator,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .toLowerCase();
}

export default function LocationPickerSheet({
  visible,
  onClose,
  communityName,
  communityId,
  freshOpen = true,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const requestId = useRef(0);
  const slide = useRef(new Animated.Value(WINDOW_HEIGHT)).current;
  const closingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [sheetHeight, setSheetHeight] = useState(WINDOW_HEIGHT - TOP_GAP);
  const [groups, setGroups] = useState(() =>
    Object.fromEntries(NEARBY_PLACE_CATEGORIES.map((key) => [key, []])),
  );
  const [hasCoordinates, setHasCoordinates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastCommunityId = useRef(communityId);

  useEffect(() => {
    if (!visible) {
      slide.stopAnimation();
      closingRef.current = false;
      setSelectedPlace(null);
      return;
    }
    if (freshOpen) {
      setQuery("");
      setCategory("all");
      closingRef.current = false;
      setSelectedPlace(null);
    }
  }, [visible, freshOpen, slide]);

  const loadResults = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetchNearbyPlacesBundle({
        force: true,
        communityId,
      });
      if (id !== requestId.current) return;
      setGroups(res.byCategory ?? {});
      setHasCoordinates(res.hasCoordinates);
      setLoadError(Boolean(res.overpassFailed));
      setLoaded(true);
    } catch {
      if (id !== requestId.current) return;
      setGroups(Object.fromEntries(NEARBY_PLACE_CATEGORIES.map((key) => [key, []])));
      setHasCoordinates(true);
      setLoadError(true);
      setLoaded(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (lastCommunityId.current === communityId) return;
    lastCommunityId.current = communityId;
    setGroups(Object.fromEntries(NEARBY_PLACE_CATEGORIES.map((key) => [key, []])));
    setLoaded(false);
    setLoadError(false);
    setSelectedPlace(null);
  }, [communityId]);

  useEffect(() => {
    if (!visible) return;
    void loadResults();
  }, [visible, loadResults, communityId]);

  const results = category === "all" ? mergeNearbyPlaces(groups) : (groups[category] ?? []);

  const searched = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return results;
    return results.filter((row) => placeSearchText(row).includes(term));
  }, [results, query]);

  const openPlace = (place) => {
    if (!place?.id) return;
    Keyboard.dismiss();
    closingRef.current = false;
    slide.stopAnimation();
    slide.setValue(sheetHeight);
    setSelectedPlace(place);
    Animated.timing(slide, {
      toValue: 0,
      duration: DETAIL_SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeDetails = () => {
    if (!selectedPlace || closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    slide.stopAnimation();
    Animated.timing(slide, {
      toValue: sheetHeight,
      duration: DETAIL_SLIDE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      closingRef.current = false;
      if (finished) setSelectedPlace(null);
    });
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    slide.stopAnimation();
    slide.setValue(sheetHeight);
    closingRef.current = false;
    setSelectedPlace(null);
    onClose?.();
  };

  const emptyMessage = loadError
    ? t("topBar.nearbyLoadFailed")
    : !hasCoordinates
      ? t("topBar.noCommunityPin")
      : query.trim()
        ? t("topBar.noSearchMatches")
        : t("topBar.noBusinessesInCategory");

  const showInitialLoader = loading && !loaded;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={selectedPlace ? closeDetails : closeSheet}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            Keyboard.dismiss();
            if (selectedPlace) closeDetails();
            else closeSheet();
          }}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            if (next > 0 && next !== sheetHeight) setSheetHeight(next);
          }}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker} numberOfLines={1}>
                {communityName}
              </Text>
              <Text style={styles.title}>{t("topBar.discoverTitle")}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={closeSheet} hitSlop={10}>
              <Feather name="x" size={sf(18)} color={T.gray} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <SearchInput
              placeholder={t("topBar.searchPlaceholder")}
              value={query}
              onChangeText={setQuery}
              imeSync={false}
            />
          </View>

          <View style={styles.filters}>
            <Text style={styles.sectionLabel}>{t("topBar.categories")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              {NEARBY_FILTER_CATEGORIES.map((item) => (
                <CategoryChip
                  key={item}
                  label={t(`topBar.category${capitalize(item)}`)}
                  active={category === item}
                  onPress={() => setCategory(item)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={styles.resultsWrap}>
            {showInitialLoader ? (
              <View style={styles.loader}>
                <ActivityIndicator color={T.teal} />
              </View>
            ) : searched.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Feather name={loadError ? "wifi-off" : "map-pin"} size={sf(22)} color={T.border} />
                <Text style={styles.empty}>{emptyMessage}</Text>
                {loadError ? (
                  <TouchableOpacity style={styles.retryBtn} onPress={() => void loadResults()}>
                    <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <ScrollView
                style={styles.results}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                {searched.map((place, index) => (
                  <PlaceRow
                    key={`${place.id}-${index}`}
                    place={place}
                    t={t}
                    onPress={openPlace}
                  />
                ))}
              </ScrollView>
            )}
            {loading && loaded ? (
              <View style={styles.refreshBadge} pointerEvents="none">
                <ActivityIndicator color={T.teal} size="small" />
              </View>
            ) : null}
          </View>

          {selectedPlace ? (
            <Animated.View
              pointerEvents="auto"
              style={[
                styles.detailSheet,
                { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY: slide }] },
              ]}
            >
              <View style={styles.handle} />
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text style={styles.kicker} numberOfLines={1}>
                    {t("topBar.placeDetail")}
                  </Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {selectedPlace.name}
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={closeDetails} hitSlop={10}>
                  <Feather name="x" size={sf(18)} color={T.gray} />
                </TouchableOpacity>
              </View>
              <View style={styles.detailBody}>
                <NearbyPlaceDetails place={selectedPlace} />
              </View>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    overflow: "hidden",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    marginTop: TOP_GAP,
    backgroundColor: T.white,
    borderTopLeftRadius: sw(22),
    borderTopRightRadius: sw(22),
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
    overflow: "hidden",
  },
  detailSheet: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: T.white,
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
    zIndex: 4,
    elevation: 8,
  },
  detailBody: {
    flex: 1,
    minHeight: 0,
  },
  handle: {
    alignSelf: "center",
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: sw(10),
    flexGrow: 0,
    flexShrink: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    marginBottom: sw(12),
    flexGrow: 0,
    flexShrink: 0,
  },
  searchWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.deepTeal,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    marginTop: sw(2),
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: T.navy,
  },
  closeBtn: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  filters: {
    flexGrow: 0,
    flexShrink: 0,
  },
  sectionLabel: {
    marginTop: sw(14),
    marginBottom: sw(8),
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 0,
    paddingEnd: sw(8),
  },
  catChip: {
    alignSelf: "center",
    flexGrow: 0,
    flexShrink: 0,
    height: sw(32),
    marginEnd: sw(8),
    paddingHorizontal: sw(12),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  catChipActive: {
    backgroundColor: T.navy,
    borderColor: T.navy,
  },
  catChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.navy,
    includeFontPadding: false,
  },
  catChipTextActive: {
    color: T.white,
  },
  resultsWrap: {
    flex: 1,
    minHeight: 0,
    marginTop: sw(10),
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(16),
    gap: sw(10),
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.gray,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: sw(4),
    backgroundColor: T.teal,
    borderRadius: 999,
    paddingHorizontal: sw(16),
    paddingVertical: sw(8),
  },
  retryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.white,
  },
  results: {
    flex: 1,
  },
  refreshBadge: {
    position: "absolute",
    top: sw(8),
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: sw(6),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    paddingVertical: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  rowChevron: {
    marginTop: sw(4),
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(19),
    color: T.navy,
  },
  resultMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
  },
  resultPhone: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.navy,
  },
  resultWalk: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.deepTeal,
  },
});
