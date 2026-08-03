import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import { Media } from "../../constants/media";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { sw, sf, hp } from "../../utils/responsive";
import { getCurrentRole } from "../../constants/role-session";
import { MarketplaceRoutes, dealDetailsParams } from "../../constants/marketplace-routes";

const CARD_GAP = sw(10);
const CAROUSEL_PEEK = sw(20);
const CARD_RADIUS = sw(16);

const FALLBACK_IMAGES = [
  Media.heroFood,
  Media.heroCoffee,
  Media.dealFitness,
  Media.businessSpa,
];

function formatValidity(deal) {
  if (deal.validUntil || deal.expires_at || deal.endsAt) {
    const raw = deal.validUntil || deal.expires_at || deal.endsAt;
    try {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        return `Valid till ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
    } catch {
      /* fall through */
    }
  }
  if (deal.isTrending) return "Limited time";
  return deal.category || "Neighborhood offer";
}

function mapDealToCard(deal, index) {
  const offer = (deal.offerTag || "").trim();
  const title = (deal.title || deal.vendor || "Local offer").trim();
  const vendor = deal.vendor?.trim() ?? "";
  const businessName =
    vendor && vendor.toLowerCase() !== title.toLowerCase() ? vendor : title;

  return {
    id: String(deal.id),
    discountLabel: offer || (deal.isTrending ? "SPECIAL" : "OFFER"),
    image: deal.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    businessName,
    validity: formatValidity(deal),
    deal,
  };
}

function OfferCard({ item, cardWidth, cardHeight, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth, height: cardHeight },
        pressed && styles.cardPressed,
      ]}
    >
      <CrispImage source={item.image} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      <LinearGradient
        colors={["transparent", "rgba(10, 42, 67, 0.55)", "rgba(10, 42, 67, 0.92)"]}
        locations={[0.25, 0.6, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.copy}>
        <Text style={styles.discount} numberOfLines={1}>
          {item.discountLabel}
        </Text>
        <Text style={styles.business} numberOfLines={1}>
          {item.businessName}
        </Text>
        <Text style={styles.validity} numberOfLines={1}>
          {item.validity}
        </Text>
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
    const cardWidth = Math.floor((contentWidth - CARD_GAP - CAROUSEL_PEEK) / 2.15);
    const cardHeight = Math.round(cardWidth * 1.4);
    const snapInterval = cardWidth + CARD_GAP;
    return { cardWidth, cardHeight, snapInterval };
  }, [screenWidth]);

  const openDeal = useCallback((item) => {
    router.push({
      pathname: MarketplaceRoutes.DEAL_DETAILS,
      params: dealDetailsParams(item.deal, activeRole),
    });
  }, [router, activeRole]);

  const renderItem = useCallback(({ item }) => (
    <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
      <OfferCard
        item={item}
        cardWidth={layout.cardWidth}
        cardHeight={layout.cardHeight}
        onPress={() => openDeal(item)}
      />
    </View>
  ), [layout.cardWidth, layout.cardHeight, openDeal]);

  if (!cards.length) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Local Offers"
          onPress={() => router.push(MarketplaceRoutes.DEALS)}
          style={styles.sectionHeader}
        />
        <HomeSectionEmpty
          message="No offers available"
          hint="Local deals from your community will show here."
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label="Local Offers"
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
        getItemLayout={(_, index) => ({
          length: layout.snapInterval,
          offset: layout.snapInterval * index,
          index,
        })}
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
  card: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: HomeTheme.deepNavy,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  cardPressed: { opacity: 0.94 },
  copy: {
    position: "absolute",
    left: sw(12),
    right: sw(12),
    bottom: sw(12),
  },
  discount: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(22),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  business: {
    marginTop: sw(2),
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
  },
  validity: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "rgba(255,255,255,0.75)",
  },
});
