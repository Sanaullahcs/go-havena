import React, { useState, useCallback } from "react";
import { MarketplaceType } from "../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../constants/font";
import CrispImage from "../ui/crisp-image";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { ScrollView } from "react-native";

import CommunityListingsBanner from "../marketplace/community-listings-banner";
import MarketplaceSectionHeader from "../marketplace/marketplace-section-header";
import ThemedIconBox from "../ui/themed-icon-box";
import {
  MarketplaceTheme,
  exploreCategoryTheme,
  marketplaceSharedStyles,
} from "../../constants/marketplace-theme";
import { getCurrentRole, syncRoleFromUser } from "../../constants/role-session";
import { getUser } from "../../services/auth-session";
import { fetchMe } from "../../services/auth-api";
import { fetchDeals } from "../../services/deals-api";
import { fetchBusinesses } from "../../services/businesses-api";
import {
  MarketplaceRoutes,
  dealDetailsParams,
  providerProfileParams,
  withMarketplaceRole,
} from "../../constants/marketplace-routes";
import { MARKETPLACE_FEATURES } from "../../constants/marketplace-features";
import GuestFeatureErrorState from "../guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../utils/account-access-sync";

const DEAL_PLACEHOLDER = require("../../assets/images/food-new.png");
const BIZ_PLACEHOLDER = require("../../assets/images/ok-resturant.png");
const SCREEN_W = Dimensions.get("window").width;
const GRID_GAP = 12;
const H_PAD = 24;
const POPULAR_CARD_W = Math.floor((SCREEN_W - H_PAD * 2 - GRID_GAP) / 2);

const DEAL_PALETTES = [
  {
    bg: MarketplaceTheme.surface,
    border: MarketplaceTheme.border,
    tagBg: MarketplaceTheme.mint,
    tagColor: MarketplaceTheme.deepTeal,
    imageBorder: MarketplaceTheme.border,
  },
  {
    bg: MarketplaceTheme.surface,
    border: MarketplaceTheme.border,
    tagBg: MarketplaceTheme.mint,
    tagColor: MarketplaceTheme.navy,
    imageBorder: MarketplaceTheme.border,
  },
];

function formatDealDistance(deal) {
  const raw = String(deal.distance || deal.location || "").trim();
  if (!raw) return "";
  if (/away/i.test(raw)) return raw;
  if (/mi|km/i.test(raw)) return `${raw} away`;
  return raw;
}

function formatDealValidLabel(endsAt, validUntil) {
  if (endsAt) {
    const date = new Date(String(endsAt).replace(" ", "T"));
    if (!Number.isNaN(date.getTime())) {
      const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days > 0 && days <= 60) {
        return `Valid ${days} day${days === 1 ? "" : "s"}`;
      }
    }
  }
  return validUntil ? `Valid until ${validUntil}` : "";
}

const DEFAULT_EXPLORE_TINT = {
  soft: MarketplaceTheme.mint,
  border: MarketplaceTheme.border,
  icon: MarketplaceTheme.navy,
  feather: "grid",
};

function ExploreCard({ category, onPress }) {
  const tint = exploreCategoryTheme[category.title] ?? DEFAULT_EXPLORE_TINT;
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.exploreCard, { borderColor: tint.border }]}
    >
      <ThemedIconBox
        name={category.feather ?? tint.feather ?? "grid"}
        size="md"
        color={tint.icon}
        backgroundColor={tint.soft}
      />
      <Text style={styles.cardTitle}>{category.title}</Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        {category.subtitle}
      </Text>
    </TouchableOpacity>
  );
}

function SectionLoader() {
  return (
    <View style={styles.sectionLoader}>
      <ActivityIndicator size="large" color={MarketplaceTheme.teal} />
    </View>
  );
}

function FeaturedDealCard({ deal, variantIndex, isLast, onPress }) {
  const palette = DEAL_PALETTES[variantIndex % DEAL_PALETTES.length];
  const offerTag = deal.offerTag ?? deal.discount_label ?? "";
  const distanceText = formatDealDistance(deal);
  const validText = formatDealValidLabel(deal.endsAt, deal.validUntil);
  const displayTitle = deal.vendor || deal.title;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={!isLast && styles.dealCardSpacing}>
      <View
        style={[
          styles.dealCard,
          { backgroundColor: palette.bg, borderColor: palette.border },
        ]}
      >
        {offerTag ? (
          <View style={[styles.dealBadge, { backgroundColor: palette.tagBg }]}>
            <Text style={[styles.dealBadgeText, { color: palette.tagColor }]} numberOfLines={1}>
              {offerTag}
            </Text>
          </View>
        ) : null}

        <View style={styles.dealTopRow}>
          <View style={[styles.dealImageFrame, { borderColor: palette.imageBorder }]}>
            <CrispImage
              source={deal.imageUrl || DEAL_PLACEHOLDER}
              style={styles.dealImage}
              contentFit="cover"
            />
          </View>
          <View style={styles.dealBody}>
            <Text style={styles.dealTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            {deal.description ? (
              <Text style={styles.dealDescription} numberOfLines={2}>
                {deal.description}
              </Text>
            ) : null}
            {distanceText || validText ? (
              <View style={styles.dealMetaRow}>
                {distanceText ? (
                  <View style={styles.dealMetaItem}>
                    <Feather name="map-pin" size={12} color={MarketplaceTheme.textMuted} />
                    <Text style={styles.dealMetaText} numberOfLines={1}>
                      {distanceText}
                    </Text>
                  </View>
                ) : null}
                {validText ? (
                  <View style={styles.dealMetaItem}>
                    <Feather name="clock" size={12} color={MarketplaceTheme.textMuted} />
                    <Text style={styles.dealMetaText} numberOfLines={1}>
                      {validText}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PopularBusinessCard({ business, onPress }) {
  const categoryLabel = business.category || "Business";
  const metaLine = business.address
    ? `${categoryLabel} • ${business.address}`
    : categoryLabel;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.popularCard, { width: POPULAR_CARD_W }]}
      onPress={onPress}
    >
      <View style={styles.popularImageWrap}>
        <CrispImage
          source={business.imageUrl || BIZ_PLACEHOLDER}
          style={styles.popularImage}
          contentFit="cover"
        />
      </View>

      <View style={styles.popularBody}>
        <Text style={styles.popularName} numberOfLines={1}>
          {business.name}
        </Text>
        {business.rating != null ? (
          <View style={styles.popularRatingRow}>
            <Feather name="star" size={12} color="#F59E0B" />
            <Text style={styles.popularRatingText}>{Number(business.rating).toFixed(1)}</Text>
          </View>
        ) : null}
        <Text style={styles.popularMeta} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketplaceHubPanel() {
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams();
  const resolvedRoleParam =
    roleParam === "community_admin" ? "admin" : roleParam;
  const [activeRole, setActiveRole] = useState(() =>
    resolvedRoleParam === "admin" || resolvedRoleParam === "resident"
      ? resolvedRoleParam
      : getCurrentRole(),
  );
  const [featuredDeals, setFeaturedDeals] = useState([]);
  const [popularBiz, setPopularBiz] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [restrictionError, setRestrictionError] = useState(null);

  const loadMarketplaceData = useCallback(async () => {
    setLoadingData(true);
    setRestrictionError(null);

    const blocked = await resolveLoadRestriction("marketplace");
    if (blocked) {
      setFeaturedDeals([]);
      setPopularBiz([]);
      setRestrictionError(blocked);
      setLoadingData(false);
      return;
    }

    try {
      const [dealsRes, bizRes] = await Promise.all([
        fetchDeals({ perPage: 3 }),
        fetchBusinesses({ perPage: 4 }),
      ]);
      setFeaturedDeals(dealsRes.deals.slice(0, 3));
      setPopularBiz(bizRes.businesses.slice(0, 4));
    } catch (err) {
      const restricted = await resolveLoadRestriction("marketplace", err);
      if (restricted) {
        setFeaturedDeals([]);
        setPopularBiz([]);
        setRestrictionError(restricted);
        return;
      }
      setFeaturedDeals([]);
      setPopularBiz([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Sync role
      if (resolvedRoleParam === "admin" || resolvedRoleParam === "resident") {
        setActiveRole(resolvedRoleParam);
      } else {
        (async () => {
          try {
            const user = await fetchMe();
            setActiveRole(syncRoleFromUser(user));
          } catch {
            const user = await getUser();
            if (user) setActiveRole(syncRoleFromUser(user));
            else setActiveRole(getCurrentRole());
          }
        })();
      }

      loadMarketplaceData();
    }, [resolvedRoleParam, loadMarketplaceData]),
  );

  const accessBlocked = Boolean(
    restrictionError && isFeatureAccessBlockedError(restrictionError),
  );

  const isAdmin = activeRole === "admin";

  const residentCategories = [
    {
      id: 1,
      title: "Deals & Offers",
      subtitle: "Save with local deals",
      feather: "tag",
      route: MarketplaceRoutes.DEALS,
    },
    {
      id: 2,
      title: "Local Businesses",
      subtitle: "Discover nearby places",
      feather: "map-pin",
      route: MarketplaceRoutes.ALL_BUSINESSES,
    },
    {
      id: 3,
      title: "Recommendation",
      subtitle: "Community favorites",
      feather: "star",
      route: MarketplaceRoutes.DEALS,
    },
  ];

  const residentCategoriesWithCoupons = [
    ...residentCategories.slice(0, 2),
    {
      id: 3,
      title: "My Coupons",
      subtitle: "Saved offers",
      feather: "bookmark",
      route: MarketplaceRoutes.MY_COUPONS,
    },
    residentCategories[2],
  ];

  const adminCategories = [
    {
      id: 1,
      title: "Deals & Offers",
      subtitle: "Save with local deals",
      feather: "tag",
      route: MarketplaceRoutes.DEALS,
    },
    {
      id: 2,
      title: "Local Businesses",
      subtitle: "Discover nearby places",
      feather: "briefcase",
      route: MarketplaceRoutes.ALL_BUSINESSES,
    },
  ];

  const goTo = (pathname, params = {}) => {
    router.push({
      pathname,
      params: withMarketplaceRole(activeRole, params),
    });
  };

  const exploreCategories = isAdmin
    ? adminCategories
    : MARKETPLACE_FEATURES.coupons
      ? residentCategoriesWithCoupons
      : residentCategories;

  return (
    <ScrollView
      style={styles.panelScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
        {accessBlocked ? (
          <GuestFeatureErrorState
            error={restrictionError}
            fallbackFeature="marketplace"
            defaultTitle="Could not load marketplace"
            onRetry={loadMarketplaceData}
          />
        ) : (
        <View style={styles.panelBody}>
          <CommunityListingsBanner
            onPress={() => goTo(MarketplaceRoutes.COMMUNITY_LISTINGS)}
          />

          <View style={styles.exploreSection}>
            <MarketplaceSectionHeader title="Explore" />
            <View style={styles.exploreGrid}>
              {exploreCategories.map((category) => (
                <ExploreCard
                  key={category.id}
                  category={category}
                  onPress={() => category.route && goTo(category.route)}
                />
              ))}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <MarketplaceSectionHeader
              title="Featured Deals"
              actionLabel="See all"
              onAction={() => goTo(MarketplaceRoutes.DEALS)}
            />

            <View style={styles.sectionBody}>
              {loadingData ? (
                <SectionLoader />
              ) : featuredDeals.length === 0 ? (
                <Text style={marketplaceSharedStyles.emptyHint}>No deals yet</Text>
              ) : (
                featuredDeals.map((deal, index) => (
                  <FeaturedDealCard
                    key={deal.id}
                    deal={deal}
                    variantIndex={index}
                    isLast={index === featuredDeals.length - 1}
                    onPress={() =>
                      goTo(MarketplaceRoutes.DEAL_DETAILS, dealDetailsParams(deal, activeRole))
                    }
                  />
                ))
              )}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <MarketplaceSectionHeader
              title="Popular Nearby"
              actionLabel="See all"
              onAction={() => goTo(MarketplaceRoutes.ALL_BUSINESSES)}
            />

            <View style={styles.popularGrid}>
              {loadingData ? (
                <SectionLoader />
              ) : popularBiz.length === 0 ? (
                <Text style={marketplaceSharedStyles.emptyHint}>No businesses yet</Text>
              ) : (
                popularBiz.map((business) => (
                  <PopularBusinessCard
                    key={business.id}
                    business={business}
                    onPress={() =>
                      goTo(
                        MarketplaceRoutes.PROVIDER_PROFILE,
                        providerProfileParams(business, activeRole),
                      )
                    }
                  />
                ))
              )}
            </View>
          </View>

          {isAdmin && (
            <View style={styles.sectionBlock}>
              <MarketplaceSectionHeader title="Admin Tools" />

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => goTo(MarketplaceRoutes.MANAGE)}
              >
              <View
                style={styles.adminCard}
              >
                <View style={styles.adminRow}>
                  <ThemedIconBox
                    name="sliders"
                    size="md"
                    color={MarketplaceTheme.navy}
                    backgroundColor={MarketplaceTheme.mint}
                  />
                  <View style={styles.adminCopy}>
                    <Text style={styles.adminTitle}>Manage Marketplace</Text>
                    <Text style={styles.adminSubtitle}>
                      Add businesses, create deals, manage content
                    </Text>
                  </View>
                </View>
              </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panelScroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 4,
  },
  panelBody: {
    gap: 4,
  },
  exploreSection: {
    paddingTop: 16,
  },
  sectionBlock: {
    paddingTop: 20,
  },
  sectionBody: {
    paddingTop: 4,
  },
  exploreGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  exploreCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: MarketplaceTheme.surface,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 10,
    borderColor: MarketplaceTheme.border,
    ...Platform.select({
      ios: {
        shadowColor: MarketplaceTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MarketplaceTheme.text,
    fontWeight: "700",
  },
  cardSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: MarketplaceTheme.textMuted,
    marginTop: 4,
    fontWeight: "400",
  },
  adminCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MarketplaceTheme.border,
    backgroundColor: MarketplaceTheme.surface,
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: MarketplaceTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  adminCopy: {
    flex: 1,
    minWidth: 0,
  },
  adminTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MarketplaceTheme.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  adminSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: MarketplaceTheme.textMuted,
  },
  sectionLoader: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  dealCardSpacing: {
    marginBottom: 12,
  },
  dealCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: "hidden",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: MarketplaceTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  dealBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    maxWidth: 110,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 1,
  },
  dealBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  dealTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingRight: 72,
  },
  dealImageFrame: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: MarketplaceTheme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  dealImage: {
    width: "100%",
    height: "100%",
  },
  dealBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  dealTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MarketplaceTheme.text,
    fontWeight: "700",
  },
  dealDescription: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: 18,
    color: MarketplaceTheme.textMuted,
  },
  dealMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  dealMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  dealMetaText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: MarketplaceTheme.textMuted,
    flexShrink: 1,
  },
  popularGrid: {
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  popularCard: {
    backgroundColor: MarketplaceTheme.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MarketplaceTheme.border,
    overflow: "hidden",
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: MarketplaceTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  popularImageWrap: {
    overflow: "hidden",
    backgroundColor: MarketplaceTheme.mint,
    height: 112,
  },
  popularImage: {
    width: "100%",
    height: "100%",
  },
  popularBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  popularName: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MarketplaceTheme.text,
    fontWeight: "700",
  },
  popularRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  popularRatingText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: MarketplaceTheme.text,
    fontWeight: "700",
  },
  popularMeta: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: MarketplaceTheme.textMuted,
  },
});
