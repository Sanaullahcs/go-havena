import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  LOCATION_RADIUS_MILES,
  THIS_COMMUNITY_RADIUS,
  categoryIcon,
  formatMilesLabel,
  radiusChipIcon,
  walkingMinutes,
} from "../../constants/location-radius";
import { fetchBusinesses } from "../../services/businesses-api";
import SearchInput from "./search-input";
import CrispImage from "./crisp-image";
import { sf, sw } from "../../utils/responsive";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { callPlace, openPlaceDirections, telUrl } from "../../utils/open-place-actions";

const PREVIEW_MILES = 10;
const ALL_CATEGORY = "all";

function matchesCategory(business, category) {
  if (category === ALL_CATEGORY) return true;
  return String(business.category || "").toLowerCase() === category.toLowerCase();
}

function RadiusChip({ miles, label, count, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Feather
        name={radiusChipIcon(miles)}
        size={sf(13)}
        color={active ? T.white : T.navy}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count != null ? (
        <View style={[styles.chipCount, active && styles.chipCountActive]}>
          <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

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

function BusinessRow({ business, t, onPress, selected }) {
  const miles = Number(business.distanceMiles);
  const outside = !business.isLocal && Number.isFinite(miles) && miles > 0;
  const walk = walkingMinutes(miles);
  const distance = outside
    ? t("topBar.milesAway", { distance: formatMilesLabel(miles).replace(" mi", "") })
    : null;
  const walkLabel = outside && walk ? t("topBar.minWalk", { count: walk }) : null;
  const meta = [business.category, outside ? business.communityName : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={() => onPress(business)}
      activeOpacity={0.88}
    >
      <View style={styles.thumbWrap}>
        {business.imageUrl ? (
          <CrispImage source={business.imageUrl} style={styles.thumb} />
        ) : (
          <View style={styles.thumbFallback}>
            <Feather name={categoryIcon(business.category)} size={sf(14)} color={T.white} />
          </View>
        )}
      </View>
      <View style={styles.resultCopy}>
        <View style={styles.resultTitleRow}>
          <Text style={styles.resultName} numberOfLines={1}>
            {business.name}
          </Text>
          {outside ? (
            <View style={styles.outsidePill}>
              <Text style={styles.outsidePillText}>{t("topBar.outsidePill")}</Text>
            </View>
          ) : (
            <View style={styles.insidePill}>
              <Text style={styles.insidePillText}>{t("topBar.homePill")}</Text>
            </View>
          )}
        </View>
        {meta ? (
          <Text style={styles.resultMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {distance ? (
          <Text style={styles.resultWalk} numberOfLines={1}>
            {walkLabel ? `${distance} · ${walkLabel}` : distance}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={sf(16)} color={T.border} />
    </TouchableOpacity>
  );
}

function PlaceActions({ business, t, showError }) {
  const canCall = Boolean(telUrl(business.phone));
  const address = business.address || business.communityName || "";

  const onCall = async () => {
    try {
      await callPlace(business.phone);
    } catch (err) {
      await showError(
        t("topBar.unableToCall"),
        err?.code === "no-phone" ? t("topBar.noPhoneListed") : t("deals.callingNotSupported"),
      );
    }
  };

  const onDirections = async () => {
    try {
      await openPlaceDirections(business);
    } catch {
      await showError(t("topBar.unableToOpenMaps"), t("topBar.noMapLocation"));
    }
  };

  return (
    <View style={styles.actions}>
      <Text style={styles.actionsName} numberOfLines={1}>
        {business.name}
      </Text>
      {address ? (
        <Text style={styles.actionsAddress} numberOfLines={2}>
          {address}
        </Text>
      ) : null}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, !canCall && styles.actionBtnDisabled]}
          onPress={onCall}
          activeOpacity={0.85}
          disabled={!canCall}
        >
          <Feather name="phone" size={sf(15)} color={canCall ? T.white : T.gray} />
          <Text style={[styles.actionBtnText, !canCall && styles.actionBtnTextDisabled]}>
            {t("topBar.call")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={onDirections}
          activeOpacity={0.85}
        >
          <Feather name="navigation" size={sf(15)} color={T.navy} />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
            {t("topBar.directions")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function LocationPickerSheet({
  visible,
  onClose,
  communityName,
  radiusMiles,
  onSelectRadius,
  onSelectBusiness,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.94);
  const [draftRadius, setDraftRadius] = useState(radiusMiles ?? THIS_COMMUNITY_RADIUS);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const { showError } = useAppDialog();

  useEffect(() => {
    if (visible) {
      setDraftRadius(radiusMiles ?? THIS_COMMUNITY_RADIUS);
      setQuery("");
      setCategory(ALL_CATEGORY);
      setSelected(null);
    }
  }, [visible, radiusMiles]);

  const loadResults = useCallback(async (search) => {
    setLoading(true);
    try {
      const res = await fetchBusinesses({
        search,
        radiusMiles: PREVIEW_MILES,
        perPage: 40,
      });
      const rows = [...(res.businesses ?? [])].sort((a, b) => {
        if (Boolean(a.isLocal) !== Boolean(b.isLocal)) return a.isLocal ? -1 : 1;
        return (Number(a.distanceMiles) || 0) - (Number(b.distanceMiles) || 0);
      });
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const handle = setTimeout(() => loadResults(query), query ? 220 : 0);
    return () => clearTimeout(handle);
  }, [visible, query, loadResults]);

  const searched = useMemo(
    () => results.filter((row) => matchesCategory(row, category)),
    [results, category],
  );

  const localRows = useMemo(
    () => searched.filter((row) => row.isLocal),
    [searched],
  );

  const outsideRows = useMemo(() => {
    const nearby = searched.filter((row) => !row.isLocal);
    if (draftRadius <= THIS_COMMUNITY_RADIUS) return nearby.slice(0, 6);
    return nearby.filter((row) => Number(row.distanceMiles) <= draftRadius + 0.08);
  }, [searched, draftRadius]);

  const chipCounts = useMemo(() => {
    const local = results.filter((row) => row.isLocal).length;
    const counts = { [THIS_COMMUNITY_RADIUS]: local };
    for (const miles of LOCATION_RADIUS_MILES) {
      counts[miles] =
        local +
        results.filter((row) => !row.isLocal && Number(row.distanceMiles) <= miles + 0.08).length;
    }
    return counts;
  }, [results]);

  const categories = useMemo(() => {
    const unique = [];
    for (const row of results) {
      const label = String(row.category || "").trim();
      if (label && !unique.includes(label)) unique.push(label);
    }
    return unique;
  }, [results]);

  const chips = useMemo(
    () => [
      { miles: THIS_COMMUNITY_RADIUS, label: t("topBar.thisCommunity") },
      ...LOCATION_RADIUS_MILES.map((miles) => ({
        miles,
        label: t("topBar.compactMiles", { count: miles }),
      })),
    ],
    [t],
  );

  const applyRadius = (miles) => {
    setDraftRadius(miles);
    onSelectRadius?.(miles);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker} numberOfLines={1}>
                {communityName}
              </Text>
              <Text style={styles.title}>{t("topBar.discoverTitle")}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Feather name="x" size={sf(18)} color={T.gray} />
            </TouchableOpacity>
          </View>

          <SearchInput
            placeholder={t("topBar.searchPlaceholder")}
            value={query}
            onChangeText={setQuery}
          />

          <View style={styles.filters}>
            <Text style={styles.sectionLabel}>{t("topBar.distance")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {chips.map((chip) => (
                <RadiusChip
                  key={String(chip.miles)}
                  miles={chip.miles}
                  label={chip.label}
                  count={chipCounts[chip.miles]}
                  active={draftRadius === chip.miles}
                  onPress={() => applyRadius(chip.miles)}
                />
              ))}
            </ScrollView>

            {categories.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.chipScroll, styles.catRow]}
                contentContainerStyle={styles.chipRow}
              >
                <CategoryChip
                  label={t("topBar.allCategories")}
                  active={category === ALL_CATEGORY}
                  onPress={() => setCategory(ALL_CATEGORY)}
                />
                {categories.map((item) => (
                  <CategoryChip
                    key={item}
                    label={item}
                    active={category === item}
                    onPress={() => setCategory(item)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={T.teal} />
            </View>
          ) : localRows.length === 0 && outsideRows.length === 0 ? (
            <Text style={styles.empty}>{t("topBar.noNearby")}</Text>
          ) : (
            <ScrollView
              style={styles.results}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {[...localRows, ...outsideRows].map((business) => (
                <BusinessRow
                  key={`${business.isLocal ? "local" : "out"}-${business.id}`}
                  business={business}
                  t={t}
                  selected={selected?.id === business.id}
                  onPress={(item) => {
                    setSelected(item);
                    onSelectBusiness?.(item);
                  }}
                />
              ))}
            </ScrollView>
          )}

          {selected ? (
            <PlaceActions business={selected} t={t} showError={showError} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: T.white,
    borderTopLeftRadius: sw(22),
    borderTopRightRadius: sw(22),
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
  },
  handle: {
    alignSelf: "center",
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: sw(10),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    marginBottom: sw(12),
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
  catRow: {
    marginTop: sw(10),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexGrow: 0,
    flexShrink: 0,
    height: sw(36),
    marginEnd: sw(8),
    paddingHorizontal: sw(12),
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  chipActive: {
    backgroundColor: T.teal,
    borderColor: T.teal,
  },
  chipText: {
    marginStart: sw(6),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: T.navy,
    includeFontPadding: false,
  },
  chipTextActive: {
    color: T.white,
  },
  chipCount: {
    minWidth: sw(18),
    height: sw(18),
    marginStart: sw(6),
    borderRadius: sw(9),
    paddingHorizontal: sw(5),
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCountActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  chipCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: T.gray,
    includeFontPadding: false,
  },
  chipCountTextActive: {
    color: T.white,
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
  loader: {
    flex: 1,
    paddingVertical: sw(28),
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.gray,
    paddingVertical: sw(16),
  },
  results: {
    flex: 1,
    minHeight: 0,
    marginTop: sw(10),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  resultRowSelected: {
    backgroundColor: "#F0FDFA",
    marginHorizontal: -sw(8),
    paddingHorizontal: sw(8),
    borderRadius: sw(12),
    borderBottomColor: "transparent",
  },
  thumbWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    overflow: "hidden",
    backgroundColor: T.navy,
    flexShrink: 0,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  resultName: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(19),
    color: T.navy,
  },
  outsidePill: {
    flexShrink: 0,
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
  },
  outsidePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#C2410C",
    textTransform: "uppercase",
  },
  insidePill: {
    flexShrink: 0,
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  insidePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: T.deepTeal,
  },
  resultMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
  },
  resultWalk: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.deepTeal,
  },
  actions: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: sw(8),
    paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
  },
  actionsName: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: T.navy,
  },
  actionsAddress: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
  },
  actionRow: {
    flexDirection: "row",
    gap: sw(8),
    marginTop: sw(10),
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: T.teal,
  },
  actionBtnSecondary: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: T.border,
  },
  actionBtnDisabled: {
    backgroundColor: "#F1F5F9",
  },
  actionBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: T.white,
  },
  actionBtnTextSecondary: {
    color: T.navy,
  },
  actionBtnTextDisabled: {
    color: T.gray,
  },
});
