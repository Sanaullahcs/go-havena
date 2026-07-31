import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { Home, homeStyles } from "../../constants/home-styles";
import { Media } from "../../constants/media";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import { timeAgo } from "../../services/feed-api";
import HomeSectionEmpty from "./home-section-empty";
import { sw, sf, hp } from "../../utils/responsive";
import { getCurrentRole } from "../../constants/role-session";
import { MarketplaceRoutes, dealDetailsParams } from "../../constants/marketplace-routes";

const CARD_GAP = sw(10);
const CAROUSEL_PEEK = sw(24);
const CARD_RADIUS = sw(14);

const FALLBACK_IMAGES = [
  Media.heroFood,
  Media.heroCoffee,
  Media.dealFitness,
  Media.businessSpa,
];

function mapDealToCard(deal, index) {
  const badgeText = deal.isTrending
    ? "LIMITED TIME"
    : (deal.category || "LOCAL DEAL").toUpperCase();

  const headline = (deal.offerTag || deal.title || "").trim();
  const vendor = deal.vendor?.trim() ?? "";
  const businessName =
    vendor &&
    vendor.toLowerCase() !== headline.toLowerCase() &&
    vendor.toLowerCase() !== (deal.title || "").trim().toLowerCase()
      ? vendor
      : "";

  return {
    id: String(deal.id),
    badgeText,
    image: deal.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    title: headline,
    businessName,
    timeLabel: timeAgo(deal.createdAt) || "",
    location: deal.location?.trim() || "",
    deal,
  };
}

function DealCard({ item, cardWidth, imageHeight, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, { width: cardWidth }, pressed && styles.cardPressed]}
    >
      <View style={styles.cardSurface}>
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          <CrispImage source={item.image} style={styles.image} contentFit="cover" />
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {item.badgeText}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {item.timeLabel ? (
              <Text style={styles.timeLabel} numberOfLines={1}>
                {item.timeLabel}
              </Text>
            ) : null}
          </View>
          {item.businessName ? (
            <Text style={styles.businessName} numberOfLines={1}>
              {item.businessName}
            </Text>
          ) : null}
          {item.location ? (
            <Text style={styles.metaLine} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
          <View style={styles.btn}>
            <Text style={styles.btnText}>Get Deal</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function DealsCornor({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const activeRole = getCurrentRole();

  const cards = useMemo(
    () => (items ?? []).map(mapDealToCard),
    [items],
  );

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - CAROUSEL_PEEK) / 2);
    const imageHeight = Math.round(cardWidth * 0.4);
    const snapInterval = cardWidth + CARD_GAP;
    return { cardWidth, imageHeight, snapInterval };
  }, [screenWidth]);

  const openDeal = useCallback((item) => {
    router.push({
      pathname: MarketplaceRoutes.DEAL_DETAILS,
      params: dealDetailsParams(item.deal, activeRole),
    });
  }, [router, activeRole]);

  const renderItem = useCallback(({ item }) => (
    <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
      <DealCard
        item={item}
        cardWidth={layout.cardWidth}
        imageHeight={layout.imageHeight}
        onPress={() => openDeal(item)}
      />
    </View>
  ), [layout.cardWidth, layout.imageHeight, openDeal]);

  if (!cards.length) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Deal Corner"
          onPress={() => router.push(MarketplaceRoutes.DEALS)}
          style={styles.sectionHeader}
        />
        <HomeSectionEmpty
          message="No deals available"
          hint="Local offers from your community will show here."
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label="Deal Corner"
        onPress={() => router.push(MarketplaceRoutes.DEALS)}
        style={styles.sectionHeader}
      />
      <FlatList
        data={cards}
        horizontal
        style={styles.carousel}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={layout.snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: layout.snapInterval, offset: layout.snapInterval * index, index })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { marginBottom: hp(0.15) },
  carousel: { marginTop: 0, flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingRight: CAROUSEL_PEEK, alignItems: "flex-start" },
  cardShell: {
    borderRadius: CARD_RADIUS,
    ...(Platform.OS === "android"
      ? { backgroundColor: "transparent", elevation: 0 }
      : {
          backgroundColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
        }),
  },
  cardSurface: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  cardPressed: { opacity: 0.94 },
  imageWrap: {
    position: "relative",
    width: "100%",
    backgroundColor: "#F3F4F6",
  },
  image: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: sw(6),
    left: sw(6),
    paddingHorizontal: sw(6),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: "#EBF5FF",
    maxWidth: "88%",
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8),
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#0052DF",
    textTransform: "uppercase",
  },
  body: {
    paddingHorizontal: sw(8),
    paddingTop: sw(6),
    paddingBottom: sw(6),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(6),
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#101828",
    fontWeight: "700",
  },
  timeLabel: {
    flexShrink: 0,
    fontFamily: Fonts.regular,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#99A1AF",
  },
  businessName: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#6A7282",
    fontWeight: "600",
    marginTop: sw(2),
  },
  metaLine: {
    fontFamily: Fonts.regular,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#99A1AF",
    marginTop: sw(2),
  },
  btn: {
    marginTop: sw(5),
    paddingVertical: sw(5),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.brandPrimaryDeep,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  btnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    color: Colors.brandPrimaryDeep,
  },
});
