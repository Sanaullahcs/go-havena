import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";
import { MarketplaceTheme as M } from "../../constants/marketplace-theme";
import { sw, sf } from "../../utils/responsive";

export const LISTING_SCOPE_FILTERS = [
  { id: "all", icon: "layers-outline", label: "Active" },
  { id: "mine", icon: "person-outline", label: "Mine" },
  { id: "saved", icon: "heart-outline", label: "Saved" },
];

export const LISTING_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "item", label: "Items for Sale" },
  { id: "service", label: "Services" },
];

const DEFAULTS = {
  filterMode: "all",
  typeFilter: "all",
  selectedCategory: "All",
  viewMode: "grid",
};

function SectionLabel({ title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function OptionPill({ label, active, onPress, icon, count }) {
  return (
    <TouchableOpacity
      style={[styles.optionPill, active && styles.optionPillActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={active ? M.teal : M.textMuted} />
      ) : null}
      <Text style={[styles.optionPillText, active && styles.optionPillTextActive]}>{label}</Text>
      {count != null ? (
        <View style={[styles.countBadge, active && styles.countBadgeActive]}>
          <Text style={[styles.countBadgeText, active && styles.countBadgeTextActive]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function FilterSheetBody({
  initialFilters,
  categories,
  filterCounts,
  onApply,
  onClose,
  insets,
  isWide,
  sheetMaxWidth,
}) {
  const [draft, setDraft] = useState(initialFilters);

  const activeDraftCount = useMemo(() => {
    let count = 0;
    if (draft.filterMode !== DEFAULTS.filterMode) count += 1;
    if (draft.typeFilter !== DEFAULTS.typeFilter) count += 1;
    if (draft.selectedCategory !== DEFAULTS.selectedCategory) count += 1;
    if (draft.viewMode !== DEFAULTS.viewMode) count += 1;
    return count;
  }, [draft]);

  const handleReset = () => setDraft(DEFAULTS);

  const handleApply = () => {
    onApply?.(draft);
    onClose?.();
  };

  return (
    <View
      style={[
        styles.sheet,
        isWide && {
          maxWidth: sheetMaxWidth,
          width: sheetMaxWidth,
          borderRadius: sw(20),
          marginBottom: Math.max(insets.bottom, 16),
        },
        !isWide && { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      {!isWide ? <View style={styles.handle} /> : null}

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Filters</Text>
          <Text style={styles.headerSubtitle}>Refine listings by scope, type, and category</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color={M.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel title="Listing scope" subtitle="Choose whose listings you want to browse" />
        <View style={styles.optionGrid}>
          {LISTING_SCOPE_FILTERS.map((tab) => (
            <OptionPill
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              count={filterCounts[tab.id] ?? 0}
              active={draft.filterMode === tab.id}
              onPress={() => setDraft((prev) => ({ ...prev, filterMode: tab.id }))}
            />
          ))}
        </View>

        <SectionLabel title="Listing type" subtitle="Items for sale or services offered" />
        <View style={styles.segmentRow}>
          {LISTING_TYPE_FILTERS.map((tab, index) => {
            const active = draft.typeFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.segmentBtn,
                  active && styles.segmentBtnActive,
                  index > 0 && styles.segmentDivider,
                ]}
                onPress={() => setDraft((prev) => ({ ...prev, typeFilter: tab.id }))}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionLabel title="Category" subtitle="Filter by listing category" />
        <View style={styles.chipWrap}>
          {categories.map((item) => {
            const active = draft.selectedCategory === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, selectedCategory: item }))}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionLabel title="View layout" />
        <View style={styles.viewRow}>
          <TouchableOpacity
            style={[styles.viewBtn, draft.viewMode === "grid" && styles.viewBtnActive]}
            onPress={() => setDraft((prev) => ({ ...prev, viewMode: "grid" }))}
            activeOpacity={0.85}
          >
            <Ionicons
              name="grid"
              size={18}
              color={draft.viewMode === "grid" ? M.teal : M.caption}
            />
            <Text style={[styles.viewBtnText, draft.viewMode === "grid" && styles.viewBtnTextActive]}>
              Grid
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, draft.viewMode === "list" && styles.viewBtnActive]}
            onPress={() => setDraft((prev) => ({ ...prev, viewMode: "list" }))}
            activeOpacity={0.85}
          >
            <Ionicons
              name="list"
              size={18}
              color={draft.viewMode === "list" ? M.teal : M.caption}
            />
            <Text style={[styles.viewBtnText, draft.viewMode === "list" && styles.viewBtnTextActive]}>
              List
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.85}>
          <Text style={styles.resetBtnText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.9}>
          <Text style={styles.applyBtnText}>
            {activeDraftCount > 0 ? `Apply (${activeDraftCount})` : "Apply filters"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CommunityListingsFilterSheet({
  visible,
  remountKey = 0,
  onClose,
  filterMode,
  typeFilter,
  selectedCategory,
  viewMode,
  categories = [],
  filterCounts = {},
  onApply,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const sheetMaxWidth = Math.min(width - 32, 560);

  const initialFilters = useMemo(
    () => ({
      filterMode: filterMode ?? DEFAULTS.filterMode,
      typeFilter: typeFilter ?? DEFAULTS.typeFilter,
      selectedCategory: selectedCategory ?? DEFAULTS.selectedCategory,
      viewMode: viewMode ?? DEFAULTS.viewMode,
    }),
    [filterMode, selectedCategory, typeFilter, viewMode],
  );

  const sheetKey = `${remountKey}-${[
    initialFilters.filterMode,
    initialFilters.typeFilter,
    initialFilters.selectedCategory,
    initialFilters.viewMode,
  ].join("-")}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, isWide && styles.overlayWide]}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />

        {visible ? (
          <FilterSheetBody
            key={sheetKey}
            initialFilters={initialFilters}
            categories={categories}
            filterCounts={filterCounts}
            onApply={onApply}
            onClose={onClose}
            insets={insets}
            isWide={isWide}
            sheetMaxWidth={sheetMaxWidth}
          />
        ) : null}
      </View>
    </Modal>
  );
}

export function countActiveListingFilters({
  filterMode = "all",
  typeFilter = "all",
  selectedCategory = "All",
  viewMode = "grid",
}) {
  let count = 0;
  if (filterMode !== "all") count += 1;
  if (typeFilter !== "all") count += 1;
  if (selectedCategory !== "All") count += 1;
  if (viewMode !== "grid") count += 1;
  return count;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayWide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(16),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  sheet: {
    backgroundColor: M.surface,
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    maxHeight: "88%",
    overflow: "hidden",
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: sw(36),
    height: 4,
    borderRadius: 999,
    backgroundColor: M.border,
    marginTop: sw(8),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: sw(20),
    paddingTop: sw(14),
    paddingBottom: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: M.border,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: sw(12),
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: M.text,
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: M.textMuted,
  },
  closeBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: M.screenBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: sw(20),
    paddingTop: sw(16),
    paddingBottom: sw(8),
    gap: sw(8),
  },
  sectionHead: {
    marginTop: sw(8),
    marginBottom: sw(8),
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: M.text,
    fontWeight: "600",
  },
  sectionSubtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: M.caption,
  },
  optionGrid: {
    gap: sw(8),
    marginBottom: sw(4),
  },
  optionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  optionPillActive: {
    backgroundColor: M.mint,
    borderColor: M.accentBorder,
  },
  optionPillText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "600",
  },
  optionPillTextActive: {
    color: M.navy,
    fontFamily: Fonts.semiBold,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: sw(22),
    height: sw(22),
    borderRadius: 999,
    paddingHorizontal: sw(6),
    backgroundColor: M.border,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeActive: {
    backgroundColor: M.surface,
  },
  countBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: M.textMuted,
    fontWeight: "700",
  },
  countBadgeTextActive: {
    color: M.teal,
  },
  segmentRow: {
    flexDirection: "row",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: M.border,
    backgroundColor: M.screenBg,
    overflow: "hidden",
    marginBottom: sw(4),
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(11),
    paddingHorizontal: sw(6),
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: M.border,
  },
  segmentBtnActive: {
    backgroundColor: M.surface,
  },
  segmentText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: M.textMuted,
    fontWeight: "600",
    textAlign: "center",
  },
  segmentTextActive: {
    color: M.teal,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginBottom: sw(4),
  },
  chip: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: 999,
    backgroundColor: M.mint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  chipActive: {
    backgroundColor: M.teal,
    borderColor: M.navy,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  viewRow: {
    flexDirection: "row",
    gap: sw(10),
    marginBottom: sw(4),
  },
  viewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  viewBtnActive: {
    backgroundColor: M.mint,
    borderColor: M.accentBorder,
  },
  viewBtnText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "600",
  },
  viewBtnTextActive: {
    color: M.navy,
    fontFamily: Fonts.semiBold,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(20),
    paddingTop: sw(12),
    paddingBottom: sw(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: M.border,
    backgroundColor: M.surface,
  },
  resetBtn: {
    flex: 1,
    minHeight: sw(46),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  resetBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: MarketplaceType.body,
    color: M.text,
    fontWeight: "600",
  },
  applyBtn: {
    flex: 1.4,
    minHeight: sw(46),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: M.navy,
  },
  applyBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
