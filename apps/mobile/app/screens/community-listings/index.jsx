import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Dimensions,
  Platform,
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
import { getProfileFields } from "../../../utils/profile-display";
import ListingGridCard from "../../../components/marketplace/listing-grid-card";
import {
  MarketplaceRoutes,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { MarketplaceTheme } from "../../../constants/marketplace-theme";

const M = MarketplaceTheme;
const H_PADDING = 20;
const CARD_GAP = 12;
const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.floor((SCREEN_W - H_PADDING * 2 - CARD_GAP) / 2);

const FILTER_TABS = [
  { id: "all", icon: "layers-outline", label: "Active" },
  { id: "mine", icon: "person-outline", label: "Mine" },
  { id: "saved", icon: "heart-outline", label: "Saved" },
];

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "item", label: "Items for Sale" },
  { id: "service", label: "Services" },
];

function TypeFilterRow({ active, onChange }) {
  return (
    <View style={styles.typeFilters}>
      {TYPE_FILTERS.map((tab, index) => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.typeFilterTab,
              isActive && styles.typeFilterTabActive,
              index > 0 && styles.typeFilterDivider,
            ]}
            onPress={() => onChange(tab.id)}
            activeOpacity={0.85}
          >
            <Text style={[styles.typeFilterLabel, isActive && styles.typeFilterLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FilterTabs({ active, onChange, counts }) {
  return (
    <View style={styles.filterTabs}>
      {FILTER_TABS.map((tab, index) => {
        const isActive = active === tab.id;
        const count = counts[tab.id] ?? 0;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.filterTab,
              isActive && styles.filterTabActive,
              index > 0 && styles.filterTabDivider,
            ]}
            onPress={() => onChange(tab.id)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={tab.icon}
              size={15}
              color={isActive ? M.teal : M.textMuted}
            />
            <Text style={[styles.filterTabLabel, isActive && styles.filterTabLabelActive]}>
              {tab.label}
            </Text>
            <View style={[styles.filterTabCount, isActive && styles.filterTabCountActive]}>
              <Text style={[styles.filterTabCountText, isActive && styles.filterTabCountTextActive]}>
                {count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function CommunityListingsScreen() {
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident" ? roleParam : getCurrentRole();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [communityName, setCommunityName] = useState("My Community");
  const [userId, setUserId] = useState(null);
  const [myCount, setMyCount] = useState(0);

  const loadWithTerm = useCallback(async (term, mode = filterMode, type = typeFilter) => {
    setLoading(true);
    try {
      const user = await getUser();
      if (user) {
        setUserId(user.id);
        setCommunityName(getProfileFields(user).communityName);
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
    if (fromData.length) return ["All", ...fromData];
    return ["All", "Furniture", "Electronics", "Services", "Other"];
  }, [listings]);

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
    if (selectedCategory !== "All") {
      rows = rows.filter(
        (l) => String(l.category ?? "").toLowerCase() === selectedCategory.toLowerCase(),
      );
    }
    return rows;
  }, [listings, filterMode, selectedCategory]);

  const handleFilterChange = (mode) => {
    setFilterMode(mode);
    loadWithTerm(search.trim(), mode, typeFilter);
  };

  const handleTypeFilterChange = (type) => {
    setTypeFilter(type);
    loadWithTerm(search.trim(), filterMode, type);
  };

  const filterCounts = useMemo(
    () => ({
      all: listings.filter((l) => l.status === "approved").length,
      mine: myCountDisplay,
      saved: savedCount,
    }),
    [listings, myCountDisplay, savedCount],
  );

  const filterHint = useMemo(() => {
    if (filterMode === "mine") {
      return typeFilter === "service"
        ? "Services you offer in this community"
        : typeFilter === "item"
          ? "Items you listed for sale"
          : "Listings you posted in this community";
    }
    if (filterMode === "saved") {
      return typeFilter === "service"
        ? "Services you saved for later"
        : typeFilter === "item"
          ? "Items you saved for later"
          : "Listings you saved for later";
    }
    if (typeFilter === "service") return "Browse services neighbors are offering";
    if (typeFilter === "item") return "Browse items neighbors are selling";
    return "Browse items for sale and services from neighbors";
  }, [filterMode, typeFilter]);

  const isGrid = viewMode === "grid";

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

  const submitSearch = () => {
    const term = searchDraft.trim();
    setSearch(term);
    loadWithTerm(term, filterMode, typeFilter);
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.resultsText}>
        {visible.length} {visible.length === 1 ? "listing" : "listings"}
        {typeFilter === "item" ? " · Items" : typeFilter === "service" ? " · Services" : ""}
        {selectedCategory !== "All" ? ` · ${selectedCategory}` : ""}
      </Text>
    </View>
  );

  const emptyTitle = useMemo(() => {
    if (filterMode === "saved") return "No saved listings yet";
    if (filterMode === "mine") {
      return typeFilter === "service"
        ? "You haven't offered a service yet"
        : typeFilter === "item"
          ? "You haven't listed an item yet"
          : "You haven't posted anything yet";
    }
    if (typeFilter === "service") return "No services found";
    if (typeFilter === "item") return "No items for sale";
    return "No listings found";
  }, [filterMode, typeFilter]);

  const emptySubtitle = useMemo(() => {
    if (filterMode === "mine") {
      return typeFilter === "service"
        ? "Offer tutoring, repairs, cleaning, and more to neighbors."
        : "Post items for sale or offer services to neighbors.";
    }
    return "Try another filter or check back soon for new posts.";
  }, [filterMode, typeFilter]);

  const fabLabel =
    typeFilter === "service" ? "Offer Service" : typeFilter === "item" ? "List Item" : "Post Listing";
  const emptyCtaLabel =
    typeFilter === "service" ? "Offer a service" : typeFilter === "item" ? "List an item" : "Post listing";

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

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <View style={styles.topSection}>
        <HeaderShell padded dense style={styles.headerShell}>
          <View style={styles.headerRow}>
            <BackButton iconOnly compact />
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Community Listings
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {communityName}
              </Text>
            </View>
          </View>
        </HeaderShell>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={M.caption} style={styles.searchIcon} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search by title or category..."
            placeholderTextColor={M.caption}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          {searchDraft.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setSearchDraft("");
                setSearch("");
                loadWithTerm("", filterMode, typeFilter);
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filterTabsWrap}>
          <FilterTabs
            active={filterMode}
            onChange={handleFilterChange}
            counts={filterCounts}
          />
          <Text style={styles.filterHint}>{filterHint}</Text>
        </View>
      </View>

      <View style={styles.filtersPanel}>
        <View style={styles.typeFilterWrap}>
          <TypeFilterRow active={typeFilter} onChange={handleTypeFilterChange} />
        </View>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryLabel}>Categories</Text>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewBtn, isGrid && styles.viewBtnActive]}
              onPress={() => setViewMode("grid")}
              activeOpacity={0.85}
            >
              <Ionicons name="grid" size={16} color={isGrid ? M.teal : M.caption} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewBtn, !isGrid && styles.viewBtnActive]}
              onPress={() => setViewMode("list")}
              activeOpacity={0.85}
            >
              <Ionicons name="list" size={16} color={!isGrid ? M.teal : M.caption} />
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsList}
          renderItem={({ item }) => {
            const active = selectedCategory === item;
            return (
              <TouchableOpacity
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedCategory(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading && listings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={M.teal} />
          <Text style={styles.loadingText}>Loading listings…</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          key={viewMode}
          numColumns={isGrid ? 2 : 1}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={isGrid ? styles.gridRow : undefined}
          ListHeaderComponent={renderHeader}
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
              width={isGrid ? CARD_W : undefined}
              variant={isGrid ? "grid" : "list"}
              onPress={() =>
                goTo(MarketplaceRoutes.LISTING_DETAIL, { id: String(item.id) })
              }
              onToggleSave={handleToggleSave}
            />
          )}
        />
      )}

      {visible.length > 0 ? (
        <TouchableOpacity
          style={styles.floatingListItem}
          activeOpacity={0.92}
          onPress={openCreateListing}
        >
          <View
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>{fabLabel}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M.screenBg },
  topSection: {
    backgroundColor: M.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: M.border,
    paddingBottom: 10,
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
  headerSubtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: M.textMuted,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PADDING,
    marginTop: 2,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: M.screenBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    color: M.text,
    paddingVertical: 0,
  },
  filterTabsWrap: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    gap: 6,
  },
  filterTabs: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M.border,
    backgroundColor: M.screenBg,
    overflow: "hidden",
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  filterTabDivider: {
    borderLeftWidth: 1,
    borderLeftColor: M.border,
  },
  filterTabActive: {
    backgroundColor: M.surface,
  },
  filterTabLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: M.textMuted,
    fontWeight: "600",
  },
  filterTabLabelActive: {
    color: M.teal,
  },
  filterTabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: M.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterTabCountActive: {
    backgroundColor: M.mint,
  },
  filterTabCountText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: M.textMuted,
    fontWeight: "700",
  },
  filterTabCountTextActive: {
    color: M.teal,
  },
  filterHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: M.caption,
    paddingHorizontal: 2,
  },
  typeFilterWrap: {
    paddingHorizontal: H_PADDING,
    marginBottom: 10,
  },
  typeFilters: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M.border,
    backgroundColor: M.screenBg,
    overflow: "hidden",
  },
  typeFilterTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  typeFilterDivider: {
    borderLeftWidth: 1,
    borderLeftColor: M.border,
  },
  typeFilterTabActive: {
    backgroundColor: M.surface,
  },
  typeFilterLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: M.textMuted,
    fontWeight: "600",
    textAlign: "center",
  },
  typeFilterLabelActive: {
    color: M.teal,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  filtersPanel: {
    backgroundColor: M.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: M.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    marginBottom: 8,
  },
  categoryLabel: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "600",
  },
  chipsList: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: H_PADDING,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  listHeader: {
    marginBottom: 8,
  },
  resultsText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "600",
  },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 3,
    borderRadius: 10,
    backgroundColor: M.mint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: M.border,
  },
  viewBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnActive: {
    backgroundColor: M.surface,
    ...Platform.select({
      ios: {
        shadowColor: M.navy,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
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
    paddingBottom: 100,
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
  floatingListItem: {
    position: "absolute",
    bottom: 24,
    right: H_PADDING,
    borderRadius: 999,
    overflow: "hidden",
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: M.teal,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  fabGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: M.teal,
    borderRadius: 999,
  },
  fabText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
