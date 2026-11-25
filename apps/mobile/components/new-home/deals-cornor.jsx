import { Text, View, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { Media } from "../../constants/media";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { timeAgo } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { rnShadow } from "../../utils/shadow";
import { arrowForward } from "../../utils/rtl";
import { getCurrentRole } from "../../constants/role-session";
import { MarketplaceRoutes, dealDetailsParams } from "../../constants/marketplace-routes";
import { useSessionUser } from "../../hooks/use-session-user";
import { isHomeSectionEnabled } from "../../constants/resident-features";
import { localizedField } from "../../i18n";
import { homeSectionEmptyHintKey } from "../../utils/home-section-empty-copy";

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
  const localTitle = localizedField(deal, "title") || deal.title || "";
  const localOfferTag = localizedField(deal, "offerTag") || deal.offerTag || "";
  const headline = (localOfferTag || localTitle).trim();
  const vendor = deal.vendor?.trim() ?? "";
  const businessName =
    vendor &&
    vendor.toLowerCase() !== headline.toLowerCase() &&
    vendor.toLowerCase() !== localTitle.trim().toLowerCase()
      ? vendor
      : "";

  return {
    id: String(deal.id),
    image: deal.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    title: headline,
    businessName,
    location: deal.location?.trim() || "",
    deal,
  };
}

function DealCard({ item, cardWidth, cardHeight, onPress }) {
  const { t, i18n } = useTranslation();
  const deal = item.deal;
  const arabic = String(i18n.language || "").startsWith("ar");
  const badgeRaw = deal?.isTrending
    ? t("deals.limitedTime")
    : (deal?.category ? t(`categories.${deal.category}`, { defaultValue: deal.category }) : t("deals.localDeal"));
  const badgeText = arabic ? badgeRaw : badgeRaw.toUpperCase();

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
          <Text style={[styles.badgeText, arabic && styles.badgeTextAr]} numberOfLines={1}>{badgeText}</Text>
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
            <Text style={styles.ctaBtnText}>{t("deals.getDeal")}</Text>
            <Feather name={arrowForward()} size={sf(12)} color={T.navy} />
          </Pressable>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

export default function DealsCornor({ items = [] }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const frame = useHomeFrame();
  const sessionUser = useSessionUser();
  const activeRole = getCurrentRole();

  const cards = useMemo(() => (items ?? []).map((d, i) => mapDealToCard(d, i)), [items, i18n.language]);

  const layout = useMemo(() => {
    const contentWidth = frame.contentWidth;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - PEEK) / 2);
    const cardHeight = Math.round(cardWidth * 1.35);
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, cardHeight, snap };
  }, [frame]);

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

  if (!isHomeSectionEnabled(sessionUser, "marketplace")) return null;

  if (!cards.length) {
    return (
      <View style={[homeStyles.section, { marginHorizontal: frame.sideInset }]}>
        <HomeSectionHeader
          label={t("home.deals")}
          onPress={() => router.push(MarketplaceRoutes.DEALS)}
        />
        <HomeSectionEmpty
          icon="tag"
          message={t("home.noDeals")}
          hint={t(homeSectionEmptyHintKey(sessionUser, "noDealsHint"))}
        />
      </View>
    );
  }

  return (
    <View style={[homeStyles.section, { marginHorizontal: frame.sideInset }]}>
      <HomeSectionHeader
        label={t("home.deals")}
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
  carousel: { flexGrow: 0, alignSelf: "stretch", width: "100%" },
  listContent: { paddingEnd: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: CARD_RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.navy,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 4 }, opacity: 0.12, radius: 12 }),
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
    start: sw(10),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    backgroundColor: T.mint,
    zIndex: 2,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    lineHeight: sf(14),
    fontWeight: "700",
    letterSpacing: 0.4,
    color: T.navy,
    textTransform: "uppercase",
    flexShrink: 1,
    writingDirection: "auto",
  },
  badgeTextAr: {
    letterSpacing: 0,
    textTransform: "none",
    fontSize: sf(11),
    lineHeight: sf(16),
    writingDirection: "rtl",
  },
  overlay: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: sw(12),
    paddingBottom: sw(12),
    paddingTop: sw(30),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(12.5),
    lineHeight: sf(17),
    color: "#FFFFFF",
    fontWeight: "700",
    flexShrink: 1,
    writingDirection: "auto",
  },
  vendor: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    color: "rgba(255,255,255,0.75)",
    marginTop: sw(2),
    writingDirection: "auto",
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
    writingDirection: "auto",
  },
});
