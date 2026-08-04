import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { Media } from "../../constants/media";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import { timeAgo } from "../../services/feed-api";
import HomeSectionEmpty from "./home-section-empty";
import { sw, sf } from "../../utils/responsive";
import { getCurrentRole } from "../../constants/role-session";
import { MarketplaceRoutes, dealDetailsParams } from "../../constants/marketplace-routes";

const CARD_GAP = sw(12);
const PEEK = sw(32);
const CARD_RADIUS = sw(16);

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

function DealCard({ item, cardWidth, cardHeight, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth, height: cardHeight },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardInner, { height: cardHeight }]}>
        <CrispImage
          source={item.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />

        {/* Top badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>{item.badgeText}</Text>
        </View>

        {/* Bottom gradient overlay */}
        <LinearGradient
          colors={["transparent", "rgba(10,42,67,0.55)", "rgba(10,42,67,0.92)"]}
          locations={[0, 0.45, 1]}
          style={styles.overlay}
        >
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {item.businessName ? (
            <Text style={styles.vendor} numberOfLines={1}>{item.businessName}</Text>
          ) : null}
          <Pressable style={styles.ctaBtn} onPress={onPress}>
            <Text style={styles.ctaBtnText}>Get Deal</Text>
            <Feather name="arrow-right" size={sf(12)} color={T.navy} />
          </Pressable>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

export default function DealsCornor({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const activeRole = getCurrentRole();

  const cards = useMemo(() => (items ?? []).map(mapDealToCard), [items]);

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - PEEK) / 2);
    const cardHeight = Math.round(cardWidth * 1.35);
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, cardHeight, snap };
  }, [screenWidth]);

  const openDeal = useCallback(
    (item) => {
      router.push({
        pathname: MarketplaceRoutes.DEAL_DETAILS,
        params: dealDetailsParams(item.deal, activeRole),
      });
    },
    [router, activeRole],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
        <DealCard
          item={item}
          cardWidth={layout.cardWidth}
          cardHeight={layout.cardHeight}
          onPress={() => openDeal(item)}
        />
      </View>
    ),
    [layout.cardWidth, layout.cardHeight, openDeal],
  );

  if (!cards.length) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Deal Corner"
          onPress={() => router.push(MarketplaceRoutes.DEALS)}
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
      />
      <FlatList
        data={cards}
        horizontal
        style={styles.carousel}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={layout.snap}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: layout.snap,
          offset: layout.snap * index,
          index,
        })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingRight: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: CARD_RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.navy,
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          borderCurve: "continuous",
        }
      : { elevation: 3 }),
  },
  cardPressed: { opacity: 0.93, transform: [{ scale: 0.98 }] },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: T.navy,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  badge: {
    position: "absolute",
    top: sw(10),
    left: sw(10),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    backgroundColor: T.mint,
    zIndex: 2,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    fontWeight: "700",
    letterSpacing: 0.4,
    color: T.navy,
    textTransform: "uppercase",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: sw(12),
    paddingBottom: sw(12),
    paddingTop: sw(30),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  vendor: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    color: "rgba(255,255,255,0.75)",
    marginTop: sw(2),
  },
  ctaBtn: {
    marginTop: sw(8),
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: T.teal,
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
    borderRadius: 999,
  },
  ctaBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10.5),
    color: T.navy,
    fontWeight: "700",
  },
});
