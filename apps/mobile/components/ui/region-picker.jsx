import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { groupRegionsByGeography } from "../../services/regions-api";

/**
 * Plain object so the text-metrics patch cannot add lineHeight.
 * iOS top-aligns and clips TextInput text when lineHeight or vertical
 * padding is set. The 48px row centers this intrinsic line with the icons.
 */
const searchFieldStyle = {
  flex: 1,
  alignSelf: "center",
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  fontFamily: Fonts.regular,
  fontSize: 14,
  color: "#101828",
  textAlignVertical: "center",
  includeFontPadding: Platform.OS === "android",
};

const EMPTY_SECTIONS = [{
  key: "empty",
  title: "",
  subtitle: "",
  billingExempt: false,
  data: [],
}];

function sameRegions(left = [], right = []) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.id !== b?.id || a?.title !== b?.title) return false;
  }
  return true;
}

function RegionPicker({
  visible,
  regions = [],
  selectedId,
  loading = false,
  emptyText,
  onSelect,
  onClose,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((region) => {
      const haystack = [
        region.title,
        region.area,
        region.state,
        region.stateName,
        region.countryName,
        region.countryCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, regions]);

  const sections = useMemo(() => {
    const grouped = groupRegionsByGeography(filtered).flatMap((country) =>
      country.states.map((state) => ({
        key: `${country.countryCode || country.countryName}-${state.stateName}`,
        title: state.stateName,
        subtitle: country.countryName,
        billingExempt: country.billingExempt,
        data: state.regions,
      })),
    );
    // SectionList crashes or collapses the sheet on iOS when sections is [].
    return grouped.length > 0 ? grouped : EMPTY_SECTIONS;
  }, [filtered]);

  const resolvedEmptyText = emptyText || t("region.noRegionsMatch");
  const noMatches = query.trim().length > 0 && filtered.length === 0;

  const handleClose = () => {
    onClose?.();
  };

  const handleSelect = (region) => {
    onSelect?.(region);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>{t("region.selectRegion")}</Text>
              <Text style={styles.subtitle}>
                {t("region.chooseAreaSubtitle")}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#344054" />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <LocaleTextInput
              style={searchFieldStyle}
              placeholder={t("region.searchRegions")}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              allowFontScaling={false}
              scrollEnabled={false}
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
              underlineColorAndroid="transparent"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#14B8A6" />
              <Text style={styles.loadingText}>{t("region.loadingRegions")}</Text>
            </View>
          ) : (
            <View style={styles.results}>
            <SectionList
              sections={sections}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              automaticallyAdjustKeyboardInsets={false}
              style={styles.list}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => section.title ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionCountry}>{section.subtitle}</Text>
                  <Text style={styles.sectionState}>{section.title}</Text>
                  {section.billingExempt ? (
                    <Text style={styles.sectionBadge}>{t("region.noBillingRequired", "No subscription required")}</Text>
                  ) : null}
                </View>
              ) : null}
              renderItem={({ item }) => {
                const selected = item.id === selectedId;
                const location = [item.area, item.stateName || item.state].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="location-outline" size={18} color={selected ? "#14B8A6" : "#667085"} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.regionName, selected && styles.regionNameSelected]}>
                        {item.title}
                      </Text>
                      {location ? (
                        <Text style={styles.regionMeta}>{location}</Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#14B8A6" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#C6CBD3" />
                    )}
                  </Pressable>
                );
              }}
            />
            {noMatches ? (
              <View style={styles.emptyOverlay} pointerEvents="none">
                <Text style={styles.emptyText}>{resolvedEmptyText}</Text>
              </View>
            ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(RegionPicker, (prev, next) => (
  prev.visible === next.visible
  && prev.selectedId === next.selectedId
  && prev.loading === next.loading
  && sameRegions(prev.regions, next.regions)
));

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    zIndex: 1,
    height: "82%",
    maxHeight: "82%",
    backgroundColor: "#FFFFFF",
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: "#101828",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 0,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
    lineHeight: 18,
  },
  searchRow: {
    marginTop: 16,
    marginBottom: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF1F5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  results: {
    flex: 1,
    marginTop: 4,
  },
  list: {
    flex: 1,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: "#FFFFFF",
  },
  sectionCountry: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#14B8A6",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionState: {
    marginTop: 2,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#101828",
  },
  sectionBadge: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#667085",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowSelected: {
    backgroundColor: "#F8FAFF",
    borderRadius: 12,
    borderBottomColor: "transparent",
    paddingHorizontal: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  regionName: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: "#101828",
  },
  regionNameSelected: {
    color: "#14B8A6",
  },
  regionMeta: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#667085",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    paddingTop: 36,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
    textAlign: "center",
  },
});
