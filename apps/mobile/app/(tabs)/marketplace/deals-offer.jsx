import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import CrispImage from "../../../components/ui/crisp-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../../../components/layout/screen-header";
import ThemedIconBox from "../../../components/ui/themed-icon-box";
import { getCurrentRole } from "../../../constants/role-session";
import { fetchDeals, toggleSaveDeal } from "../../../services/deals-api";
import { fetchMyBusiness } from "../../../services/businesses-api";
import {
  MarketplaceRoutes,
  dealDetailsParams,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { MARKETPLACE_FEATURES } from "../../../constants/marketplace-features";
import { MarketplaceTheme, marketplaceSharedStyles } from "../../../constants/marketplace-theme";

const DEAL_PLACEHOLDER = require("../../../assets/images/food-bowl.png");

/** Favorites first, then featured, then newest. */
function sortFavoritesFirst(list) {
  return [...(list ?? [])].sort((a, b) => {
    const likedDiff = Number(!!b.isLiked) - Number(!!a.isLiked);
    if (likedDiff !== 0) return likedDiff;
    const featuredDiff = Number(!!b.isTrending) - Number(!!a.isTrending);
    if (featuredDiff !== 0) return featuredDiff;
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });
}

export default function DealsOffer() {
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isAdmin = activeRole === "admin";

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [myBusiness, setMyBusiness] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ deals: rows }, mine] = await Promise.all([
        fetchDeals({ includeExpired: true }),
        fetchMyBusiness(),
      ]);
      setDeals(sortFavoritesFirst(rows));
      setMyBusiness(mine);
    } catch (err) {
      setError(err?.message || "Could not load deals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleToggleLike = useCallback(async (deal) => {
    const nextLiked = !deal.isLiked;
    setDeals((prev) =>
      sortFavoritesFirst(
        prev.map((d) => (d.id === deal.id ? { ...d, isLiked: nextLiked } : d)),
      ),
    );
    try {
      const res = await toggleSaveDeal(deal.id);
      const liked = Boolean(res?.liked ?? res?.saved);
      setDeals((prev) =>
        sortFavoritesFirst(
          prev.map((d) => (d.id === deal.id ? { ...d, isLiked: liked } : d)),
        ),
      );
    } catch {
      setDeals((prev) =>
        sortFavoritesFirst(
          prev.map((d) => (d.id === deal.id ? { ...d, isLiked: deal.isLiked } : d)),
        ),
      );
    }
  }, []);

  const categories = [
    "All",
    ...Array.from(new Set(deals.map((d) => d.category).filter(Boolean))),
  ];

  const filteredDeals = useMemo(() => {
    const list =
      selectedCategory === "All"
        ? deals
        : deals.filter((deal) => deal.category === selectedCategory);
    return sortFavoritesFirst(list);
  }, [deals, selectedCategory]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title="Deals & Offers"
        iconOnly
        compact
        right={
          isAdmin ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.createDealBtn}
              onPress={() => {
                if (!myBusiness) {
                  Alert.alert(
                    "Add a Business First",
                    "Register your business before creating a deal.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Add Business",
                        onPress: () =>
                          router.push({
                            pathname: MarketplaceRoutes.ADD_BUSINESS,
                            params: withMarketplaceRole(activeRole),
                          }),
                      },
                    ],
                  );
                  return;
                }
                router.push({
                  pathname: MarketplaceRoutes.CREATE_DEAL,
                  params: withMarketplaceRole(activeRole),
                });
              }}
            >
              <Text style={styles.createDealBtnText}>Create Deal</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {MARKETPLACE_FEATURES.coupons ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: MarketplaceRoutes.MY_COUPONS,
                params: withMarketplaceRole(activeRole),
              })
            }
            style={styles.savedCouponsCard}
          >
            <View style={styles.savedLeft}>
              <ThemedIconBox
                name="bookmark"
                size="md"
                color={MarketplaceTheme.accent}
                backgroundColor={MarketplaceTheme.accentSoft}
              />
              <View>
                <Text style={styles.savedTitle}>My Saved Coupons</Text>
                <Text style={styles.savedSubTitle}>View your active offers</Text>
              </View>
            </View>

            <Image
              source={require("../../../assets/images/next-icon.png")}
              style={{ width: 20, height: 20, tintColor: MarketplaceTheme.accent }}
            />
          </TouchableOpacity>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
        >
          {categories.map((category) => {
            const isSelected = selectedCategory === category;

            return (
              <TouchableOpacity
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[
                  marketplaceSharedStyles.chip,
                  isSelected && marketplaceSharedStyles.chipActive,
                ]}
              >
                <Text
                  style={[
                    marketplaceSharedStyles.chipText,
                    isSelected && marketplaceSharedStyles.chipTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.listWrap}>
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#0B66E8" />
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Couldn't load deals</Text>
              <Text style={styles.emptySubTitle}>{error}</Text>
              <TouchableOpacity onPress={load} style={{ marginTop: 10 }}>
                <Text style={[styles.emptySubTitle, { color: "#0B66E8" }]}>
                  Tap to retry
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && !error && filteredDeals.map((deal) => (
            <TouchableOpacity
              key={deal.id}
              style={styles.dealCard}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: MarketplaceRoutes.DEAL_DETAILS,
                  params: dealDetailsParams(deal, activeRole),
                })
              }
            >
              <View style={styles.imageWrap}>
                <CrispImage
                  source={deal.imageUrl || DEAL_PLACEHOLDER}
                  style={styles.dealImage}
                  contentFit="cover"
                />

                {deal.isTrending ? (
                  <View style={styles.trendingTag}>
                    <Image
                      source={require("../../../assets/images/white-curl.svg")}
                      style={{ width: 12, height: 12 }}
                    />
                    <Text style={styles.trendingText}>Trending</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.likeButton}
                  activeOpacity={0.8}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    handleToggleLike(deal);
                  }}
                  hitSlop={8}
                  accessibilityLabel={deal.isLiked ? "Unsave deal" : "Save deal"}
                >
                  {deal.isLiked ? (
                    <Image
                      source={require("../../../assets/images/heart-red.svg")}
                      style={{ width: 20, height: 20 }}
                    />
                  ) : (
                    <Image
                      source={require("../../../assets/images/heart-border.svg")}
                      style={{ width: 20, height: 20 }}
                    />
                  )}
                </TouchableOpacity>

                <View
                  style={[
                    styles.offerTag,
                    {
                      backgroundColor: deal.isTrending ? "#FE9A00" : "#0052DF",
                    },
                  ]}
                >
                  <Text style={styles.offerTagText}>{deal.offerTag}</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{deal.title}</Text>
                {deal.vendor ? (
                  <Text style={styles.vendorText}>by {deal.vendor}</Text>
                ) : null}
                {deal.description ? (
                  <Text style={styles.descriptionText} numberOfLines={2}>
                    {deal.description}
                  </Text>
                ) : null}

                <View style={styles.metaRow}>
                  {deal.location ? (
                    <View style={styles.metaItem}>
                      <Image
                        source={require("../../../assets/images/grey-location.svg")}
                        style={styles.metaIcon}
                      />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {deal.location}
                      </Text>
                    </View>
                  ) : null}

                  {deal.validUntil ? (
                    <View style={styles.metaItem}>
                      <Image
                        source={require("../../../assets/images/grey-clock.svg")}
                        style={styles.metaIcon}
                      />
                      <Text style={styles.metaText}>
                        Valid until {deal.validUntil}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {!loading && !error && filteredDeals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No deals found</Text>
              <Text style={styles.emptySubTitle}>
                {selectedCategory === "All"
                  ? "Check back soon for new local deals"
                  : "Try another category"}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  createDealBtn: {
    backgroundColor: "rgba(0, 82, 223, 1)",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  createDealBtnText: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 32,
  },
  savedCouponsCard: {
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: MarketplaceTheme.accentBorder,
  },
  savedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  savedTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#101828",
  },
  savedSubTitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontWeight: "400",
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6A7282",
  },
  categoryContent: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  listWrap: {
    gap: 14,
    paddingTop: 2,
  },
  dealCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  imageWrap: {
    position: "relative",
    height: 160,
  },
  dealImage: {
    width: "100%",
    height: "100%",
  },
  trendingTag: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#FE9A00",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    boxShadow: "0px 4px 6px -4px #0000001A",

    boxShadow: "0px 10px 15px -3px #0000001A",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trendingText: {
    fontFamily: Fonts.bold,
    fontWeight: 700,
    color: "#FFFFFF",
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
  },
  likeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 50,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 6px -4px #0000001A",
    boxShadow: "0px 10px 15px -3px #0000001A",
  },
  likeIcon: {
    color: "#94A3B8",
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.bodyMdLine,
  },
  likeIconActive: {
    color: "#F43F5E",
  },
  offerTag: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  offerTagText: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    fontWeight: 700,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitle: {
    color: "#000000",
    fontFamily: Fonts.bold,
    fontWeight: 700,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
  },
  vendorText: {
    marginTop: 3,
    color: "#4A5565",
    fontFamily: Fonts.medium,
    fontWeight: 500,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
  },
  descriptionText: {
    marginTop: 14,
    color: "#6A7282",
    fontFamily: Fonts.medium,
    fontWeight: 500,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.headingLine,
  },
  metaRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaIcon: {
    width: 12,
    height: 12,
  },
  metaText: {
    color: "#6A7282",
    fontFamily: Fonts.medium,
    fontWeight: 500,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontWeight: 700,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#111827",
  },
  emptySubTitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontWeight: 400,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#667085",
  },
});
