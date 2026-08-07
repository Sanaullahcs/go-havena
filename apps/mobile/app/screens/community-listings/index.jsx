import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import BackButton from "../../../components/ui/back-button";
import { HeaderShell } from "../../../components/layout/header-chrome";
import { Fonts } from "../../../constants/font";
import { MarketplaceType } from "../../../constants/marketplace-type";
import { getCurrentRole } from "../../../constants/role-session";
import { getUser } from "../../../services/auth-session";
import { fetchListings, toggleSaveListing } from "../../../services/listings-api";
import ListingGridCard from "../../../components/marketplace/listing-grid-card";
import CommunityListingsFilterSheet, {
  countActiveListingFilters,
} from "../../../components/marketplace/community-listings-filter-sheet";
import {
  MarketplaceRoutes,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { MarketplaceTheme } from "../../../constants/marketplace-theme";
import { useTranslation } from "react-i18next";

const M = MarketplaceTheme;
const H_PADDING = 20;
const CARD_GAP = 12;
const SCROLL_COLLAPSE_THRESHOLD = 14;

export default function CommunityListingsScreen({ embedded = false }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident" ? roleParam : getCurrentRole();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [userId, setUserId] = useState(null);
  const [myCount, setMyCount] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSession, setFilterSession] = useState(0);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchBodyHeight, setSearchBodyHeight] = useState(null);
  const searchExpandAnim = useRef(new Animated.Value(0)).current;
  const searchBodyHeightRef = useRef(0);
  const searchExpandedRef = useRef(false);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const keyboardOpenRef = useRef(false);
  const listViewportHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);
  const searchCollapseHeightRef = useRef(52);

  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const contentMaxWidth = Math.min(windowWidth, isWide ? 720 : windowWidth);
  const cardWidth = Math.floor((Math.min(windowWidth, contentMaxWidth) - H_PADDING * 2 - CARD_GAP) / 2);

  const loadWithTerm = useCallback(async (term, mode = filterMode, type = typeFilter, { background = false } = {}) => {
    if (background) {
      setSearching(true);
    } else {
      setLoading(true);
    }
    try {
      const user = await getUser();
      if (user) {
        setUserId(user.id);
      }
      const res = await fetchListings({
        ...(term ? { search: term } : {}),
        ...(mode === "mine" ? { mine: true } : {}),
        ...(type === "item" ? { type: "for_sale" } : {}),
        ...(type === "service" ? { type: "service" } : {}),
      });
      setListings(res.data ?? []);
      if (typeof res.meta?.my_count === "number") {
        setMyCount(res.meta.my_count);
      }
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
      setSearching(false);
      setRefreshing(false);
    }
  }, [filterMode, typeFilter]);

  const load = useCallback(async () => {
    await loadWithTerm(search.trim(), filterMode);
  }, [loadWithTerm, search, filterMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const categories = useMemo(() => {
    const fromData = Array.from(
      new Set(listings.map((l) => l.category).filter(Boolean)),
    ).sort();
    if (fromData.length) return [t("common.all"), ...fromData];
    return [t("common.all"), t("listings.categoryFurniture"), t("listings.categoryElectronics"), t("listings.categoryServices"), t("listings.categoryOther")];
  }, [listings, t]);

  const savedCount = useMemo(
    () => listings.filter((l) => l.is_saved).length,
    [listings],
  );

  const myCountDisplay = myCount || (userId
    ? listings.filter((l) => Number(l.user_id) === Number(userId)).length
    : 0);

  const visible = useMemo(() => {
    let rows = listings;
    if (filterMode === "saved") {
      rows = rows.filter((l) => l.is_saved);
    }
    if (selectedCategory && selectedCategory !== categories[0]) {
      rows = rows.filter(
        (l) => String(l.category ?? "").toLowerCase() === selectedCategory.toLowerCase(),
      );
    }
    return rows;
  }, [listings, filterMode, selectedCategory]);

  const handleApplyFilters = (next) => {
    const modeChanged = next.filterMode !== filterMode;
    const typeChanged = next.typeFilter !== typeFilter;
    setFilterMode(next.filterMode);
    setTypeFilter(next.typeFilter);
    setSelectedCategory(next.selectedCategory);
    setViewMode(next.viewMode);
    if (modeChanged || typeChanged) {
      loadWithTerm(search.trim(), next.filterMode, next.typeFilter);
    }
  };

  const activeFilterCount = useMemo(
    () =>
      countActiveListingFilters({
        filterMode,
        typeFilter,
        selectedCategory,
        viewMode,
      }),
    [filterMode, typeFilter, selectedCategory, viewMode],
  );

  const listingCountHint = useMemo(() => {
    if (search.trim()) return t("marketplace.matchingSearch");
    if (activeFilterCount > 0) return t("marketplace.filtersApplied");
    return t("marketplace.availableNow");
  }, [search, activeFilterCount, t]);

  const isGrid = viewMode === "grid";

  const filterCounts = useMemo(
    () => ({
      all: listings.filter((l) => l.status === "approved").length,
      mine: myCountDisplay,
      saved: savedCount,
    }),
    [listings, myCountDisplay, savedCount],
  );

  const goTo = (pathname, params = {}) => {
    router.push({
      pathname,
      params: withMarketplaceRole(activeRole, params),
    });
  };

  const openCreateListing = () => {
    const params =
      typeFilter === "service"
        ? { type: "service" }
        : typeFilter === "item"
          ? { type: "item" }
          : {};
    goTo(MarketplaceRoutes.CREATE_LISTING, params);
  };

  const handleToggleSave = async (item) => {
    try {
      const res = await toggleSaveListing(item.id);
      const saved = Boolean(res?.saved);
      setListings((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, is_saved: saved } : l)),
      );
    } catch {
      // ignore
    }
  };

  const submitSearch = useCallback(() => {
    const term = searchDraft.trim();
    setSearch(term);
    loadWithTerm(term, filterMode, typeFilter, { background: listings.length > 0 });
  }, [searchDraft, filterMode, typeFilter, loadWithTerm, listings.length]);

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setSearch("");
    loadWithTerm("", filterMode, typeFilter, { background: listings.length > 0 });
  }, [filterMode, typeFilter, loadWithTerm, listings.length]);

  const clampListScroll = useCallback(() => {
    const viewportHeight = listViewportHeightRef.current;
    const contentHeight = listContentHeightRef.current;
    if (!listRef.current || viewportHeight <= 0 || contentHeight <= 0) return;

    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const nextOffset = Math.min(lastScrollYRef.current, maxOffset);
    if (nextOffset !== lastScrollYRef.current) {
      listRef.current.scrollToOffset({ offset: nextOffset, animated: false });
      lastScrollYRef.current = nextOffset;
    }
  }, []);

  const setSearchExpandedAnimated = useCallback(
    (expanded, { animated = true } = {}) => {
      if (searchExpandedRef.current === expanded) return;
      searchExpandedRef.current = expanded;
      setSearchExpanded(expanded);
      if (animated) {
        Animated.timing(searchExpandAnim, {
          toValue: expanded ? 1 : 0,
          duration: 280,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished && !expanded) {
            requestAnimationFrame(clampListScroll);
          }
        });
      } else {
        searchExpandAnim.setValue(expanded ? 1 : 0);
        if (!expanded) clampListScroll();
      }
    },
    [searchExpandAnim, clampListScroll],
  );

  const openSearch = useCallback(() => {
    setSearchExpandedAnimated(true);
    requestAnimationFrame(() => {
      setTimeout(() => searchInputRef.current?.focus(), 120);
    });
  }, [setSearchExpandedAnimated]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchExpandedAnimated(false);
  }, [setSearchExpandedAnimated]);

  const toggleSearch = useCallback(() => {
    if (searchExpandedRef.current) {
      closeSearch();
    } else {
      openSearch();
    }
  }, [closeSearch, openSearch]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      keyboardOpenRef.current = true;
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardOpenRef.current = false;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!searchExpanded) return undefined;

    const timer = setTimeout(() => {
      const term = searchDraft.trim();
      if (term === search.trim()) return;
      setSearch(term);
      loadWithTerm(term, filterMode, typeFilter, { background: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [searchDraft, searchExpanded, search, filterMode, typeFilter, loadWithTerm]);

  const handleListScroll = useCallback(
    (event) => {
      const y = event.nativeEvent.contentOffset.y;
      const diff = y - lastScrollYRef.current;

      if (
        diff > SCROLL_COLLAPSE_THRESHOLD &&
        searchExpandedRef.current &&
        !keyboardOpenRef.current
      ) {
        closeSearch();
      }

      lastScrollYRef.current = y;
    },
    [closeSearch],
  );

  const onSearchBodyLayout = useCallback((event) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0 && height !== searchBodyHeightRef.current) {
      searchBodyHeightRef.current = height;
      searchCollapseHeightRef.current = height;
      setSearchBodyHeight(height);
    }
  }, []);

  const onListLayout = useCallback((event) => {
    const height = event.nativeEvent.layout.height;
    const previousHeight = listViewportHeightRef.current;
    listViewportHeightRef.current = height;
    if (previousHeight > 0 && height > previousHeight) {
      requestAnimationFrame(clampListScroll);
    }
  }, [clampListScroll]);

  const onListContentSizeChange = useCallback((_width, height) => {
    listContentHeightRef.current = height;
  }, []);

  const searchCollapseStyle = {
    height: searchExpandAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, searchBodyHeight ?? searchCollapseHeightRef.current],
    }),
    opacity: searchExpandAnim.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0, 0.5, 1],
    }),
  };

  const listBottomInset = 72;

  const emptyTitle = useMemo(() => {
    if (filterMode === "saved") return t("marketplace.emptyTitleSaved");
    if (filterMode === "mine") {
      return typeFilter === "service"
        ? t("marketplace.emptyTitleMineService")
        : typeFilter === "item"
          ? t("marketplace.emptyTitleMineItem")
          : t("marketplace.emptyTitleMine");
    }
    if (typeFilter === "service") return t("marketplace.emptyTitleService");
    if (typeFilter === "item") return t("marketplace.emptyTitleItem");
    return t("marketplace.emptyTitleAll");
  }, [filterMode, typeFilter, t]);

  const emptySubtitle = useMemo(() => {
    if (filterMode === "mine") {
      return typeFilter === "service"
        ? t("marketplace.emptySubtitleMineService")
        : t("marketplace.emptySubtitleMine");
    }
    return t("marketplace.emptySubtitleAll");
  }, [filterMode, typeFilter, t]);

  const emptyCtaLabel =
    typeFilter === "service" ? t("marketplace.ctaOfferService") : typeFilter === "item" ? t("marketplace.ctaListItem") : t("marketplace.ctaPostListing");

  const openFilters = useCallback(() => {
    setFilterSession((count) => count + 1);
    setFilterOpen(true);
  }, []);

  const renderListingCount = () => (
    <View style={styles.listingCountRow}>
      <View style={styles.listingCountBadge}>
        <Text style={styles.listingCountNumber}>{visible.length}</Text>
      </View>
      <View style={styles.listingCountTextWrap}>
        <Text style={styles.listingCountLabel}>
          {t("marketplace.listingCount", { count: visible.length })}
        </Text>
        <Text style={styles.listingCountHint} numberOfLines={1}>
          {listingCountHint}
        </Text>
      </View>
      {searching ? (
        <ActivityIndicator size="small" color={M.teal} style={styles.listingCountSpinner} />
      ) : null}
    </View>
  );

  const renderSearchIconButton = () => (
    <TouchableOpacity
      style={[styles.headerIconButton, searchExpanded && styles.headerIconButtonActive]}
      onPress={toggleSearch}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={searchExpanded ? t("marketplace.closeSearch") : t("marketplace.searchListings")}
      accessibilityState={{ expanded: searchExpanded }}
    >
      <Ionicons name="search-outline" size={20} color={searchExpanded ? M.teal : M.navy} />
    </TouchableOpacity>
  );

  const renderFloatingFilterButton = () => (
    <TouchableOpacity
      style={styles.floatingFilter}
      onPress={openFilters}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={t("marketplace.openFilters")}
    >
      <View style={styles.floatingFilterInner}>
        <Ionicons name="options-outline" size={20} color={M.navy} />
        <Text style={styles.floatingFilterText}>{t("marketplace.filters")}</Text>
        {activeFilterCount > 0 ? (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="storefront-outline" size={36} color={M.teal} />
      </View>
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
      <TouchableOpacity style={styles.emptyCta} onPress={openCreateListing} activeOpacity={0.9}>
        <Ionicons name="add-circle" size={18} color="#FFFFFF" />
        <Text style={styles.emptyCtaText}>{emptyCtaLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  const Root = embedded ? View : SafeAreaView;
  const rootProps = embedded
    ? { style: [styles.container, styles.containerEmbedded] }
    : { style: styles.container, edges: ["left", "right"] };

  return (
    <Root {...rootProps}>
      <KeyboardAvoidingView
        style={styles.searchKeyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={searchExpanded}
      >
        <View style={[styles.topSection, isWide && styles.topSectionWide]}>
          <View style={[styles.topSectionInner, { maxWidth: contentMaxWidth }]}>
          {!embedded ? (
            <HeaderShell padded dense style={styles.headerShell}>
              <View style={styles.headerRow}>
                <BackButton iconOnly compact />
                <View style={styles.headerTitleWrap}>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {t("marketplace.communityListings")}
                  </Text>
                  <View style={styles.headerSubtitleWrap}>
                    {renderListingCount()}
                  </View>
                </View>
                {renderSearchIconButton()}
              </View>
            </HeaderShell>
          ) : (
            <View style={styles.embeddedHeader}>
              {renderListingCount()}
              {renderSearchIconButton()}
            </View>
          )}

          <Animated.View
            style={[styles.searchCollapseBody, searchCollapseStyle]}
            pointerEvents={searchExpanded ? "auto" : "none"}
          >
            <View onLayout={onSearchBodyLayout}>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={18} color={M.caption} style={styles.searchIcon} />
                <TextInput
                  ref={searchInputRef}
                  value={searchDraft}
                  onChangeText={setSearchDraft}
                  placeholder={t("marketplace.searchPlaceholder")}
                  placeholderTextColor={M.caption}
                  style={styles.searchInput}
                  returnKeyType="search"
                  onSubmitEditing={submitSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="never"
                />
                {searchDraft.length > 0 ? (
                  <TouchableOpacity
                    onPress={clearSearch}
                    hitSlop={8}
                    accessibilityLabel={t("marketplace.clearSearch")}
                  >
                    <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <View style={styles.listHost} onLayout={onListLayout}>
          {loading && listings.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={M.teal} />
              <Text style={styles.loadingText}>{t("marketplace.loadingListings")}</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={visible}
              key={viewMode}
              style={styles.listFlex}
              numColumns={isGrid ? 2 : 1}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: listBottomInset },
                visible.length === 0 && styles.listContentEmpty,
              ]}
              columnWrapperStyle={isGrid ? styles.gridRow : undefined}
              scrollEventThrottle={16}
              onScroll={handleListScroll}
              onContentSizeChange={onListContentSizeChange}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor={M.teal}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                />
              }
              ListEmptyComponent={renderEmpty}
              renderItem={({ item }) => (
                <ListingGridCard
                  item={item}
                  width={isGrid ? cardWidth : undefined}
                  variant={isGrid ? "grid" : "list"}
                  onPress={() =>
                    goTo(MarketplaceRoutes.LISTING_DETAIL, { id: String(item.id) })
                  }
                  onToggleSave={handleToggleSave}
                />
              )}
            />
          )}
        </View>

      {!loading ? renderFloatingFilterButton() : null}

      <CommunityListingsFilterSheet
        visible={filterOpen}
        remountKey={filterSession}
        onClose={() => setFilterOpen(false)}
        filterMode={filterMode}
        typeFilter={typeFilter}
        selectedCategory={selectedCategory}
        viewMode={viewMode}
        categories={categories}
        filterCounts={filterCounts}
        onApply={handleApplyFilters}
      />
    </Root>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M.screenBg },
  containerEmbedded: {
    minHeight: 0,
  },
  searchKeyboardAvoid: {
    flexGrow: 0,
    flexShrink: 0,
  },
  listHost: {
    flex: 1,
    minHeight: 0,
  },
  listFlex: {
    flex: 1,
  },
  topSection: {
    backgroundColor: M.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: M.border,
  },
  topSectionWide: {
    alignItems: "center",
  },
  topSectionInner: {
    width: "100%",
  },
  searchCollapseBody: {
    overflow: "hidden",
  },
  headerShell: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: M.text,
    fontWeight: "700",
  },
  headerSubtitleWrap: {
    marginTop: 4,
  },
  listingCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  listingCountBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: M.mint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(20, 184, 166, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  listingCountNumber: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    lineHeight: 22,
    color: M.teal,
    fontWeight: "800",
  },
  listingCountTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  listingCountLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyLine,
    color: M.text,
    fontWeight: "700",
  },
  listingCountHint: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: M.textMuted,
  },
  listingCountSpinner: {
    marginStart: 4,
  },
  embeddedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PADDING,
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
    gap: 8,
  },
  searchIcon: {
    marginEnd: 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    color: M.text,
    paddingVertical: 0,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerIconButtonActive: {
    borderColor: M.teal,
    backgroundColor: M.mint,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: M.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.caption,
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  gridRow: {
    justifyContent: "space-between",
    gap: CARD_GAP,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: M.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: M.text,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: M.textMuted,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: M.navy,
  },
  emptyCtaText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  floatingFilter: {
    position: "absolute",
    bottom: 24,
    end: H_PADDING,
    borderRadius: 999,
    overflow: "hidden",
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  floatingFilterInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: M.surface,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  floatingFilterText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: M.navy,
    fontWeight: "700",
  },
});
