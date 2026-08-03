import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  Platform,
} from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import {
  Home,
  homeStyles,
  homeThreeColWidth,
} from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import {
  formatDisplayTime12h,
  formatShortDate,
  getCategoryTheme,
  isCarouselNotice,
} from "../../services/notices-api";
import CrispImage from "../ui/crisp-image";
import { Media } from "../../constants/media";
import { sw, sf } from "../../utils/responsive";
import HomeSectionEmpty from "./home-section-empty";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";

const QUICK_ACTIONS = [
  { id: "1", title: "New Post", route: "/screens/create-post", feather: "edit-3" },
  { id: "2", title: "Book", route: PropertyManagementRoutes.AMENITY, feather: "calendar" },
  { id: "3", title: "Sell", route: "/screens/createListing", feather: "tag" },
  { id: "4", title: "Help", route: "/screens/help", feather: "heart" },
  { id: "5", title: "Documents", route: PropertyManagementRoutes.DOCUMENTS, feather: "file-text" },
  { id: "6", title: "More", route: PropertyManagementRoutes.HOME, feather: "more-horizontal" },
];

const HERO_HEIGHT = sw(178);
const CURVE_SIZE = sw(220);
const FAB_SIZE = sw(40);

function mapNoticeToHero(notice) {
  const theme = notice.theme ?? getCategoryTheme(notice.category);
  return {
    id: String(notice.id),
    badge: theme.label || "Community Notice",
    title: notice.title ?? "",
    body:
      notice.summary ||
      notice.body ||
      ([
        notice.eventDate ? formatShortDate(notice.eventDate) : null,
        notice.eventTime ? formatDisplayTime12h(notice.eventTime) : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Tap to view community details."),
    imageUrl: notice.imageUrl,
    theme,
    notice,
  };
}

function NoticeHeroCard({ item, cardWidth, onPress }) {
  const imageSource = item.imageUrl ? { uri: item.imageUrl } : Media.heroEvent;
  const curveLeft = cardWidth - CURVE_SIZE * 0.62;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { width: cardWidth, height: HERO_HEIGHT },
        pressed && { opacity: 0.97 },
      ]}
    >
      <View style={[styles.heroShell, { width: cardWidth, height: HERO_HEIGHT }]}>
        <LinearGradient
          colors={["#0A2A43", "#148BA6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Soft teal blobs behind the curve */}
        <View pointerEvents="none" style={styles.blobA} />
        <View pointerEvents="none" style={styles.blobB} />

        {/* Large circular photo window on the right (~40%) */}
        <View
          pointerEvents="none"
          style={[
            styles.curveWindow,
            {
              width: CURVE_SIZE,
              height: CURVE_SIZE,
              borderRadius: CURVE_SIZE / 2,
              left: curveLeft,
              top: (HERO_HEIGHT - CURVE_SIZE) / 2,
            },
          ]}
        >
          <CrispImage
            source={imageSource}
            style={{ width: CURVE_SIZE, height: CURVE_SIZE }}
            contentFit="cover"
            contentPosition="center"
          />
        </View>

        {/* Left copy (~60%) */}
        <View style={styles.heroCopy}>
          <View style={styles.eyebrow}>
            <Feather name="volume-2" size={sf(11)} color="#FFFFFF" />
            <Text style={styles.eyebrowText}>
              {String(item.badge).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.heroBody} numberOfLines={2}>
            {item.body}
          </Text>

          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>View Details</Text>
            <Feather name="arrow-right" size={sf(13)} color={HomeTheme.primaryTeal} />
          </View>
        </View>

        {/* Floating tools FAB — bottom-right over photo */}
        <View style={styles.toolsFab} pointerEvents="none">
          <MaterialCommunityIcons
            name="hammer-wrench"
            size={sf(18)}
            color={HomeTheme.deepNavy}
          />
        </View>
      </View>
    </Pressable>
  );
}

function QuickActionsGrid({ screenWidth }) {
  const router = useRouter();
  const gap = Home.gap;
  const tileWidth = useMemo(
    () => homeThreeColWidth(screenWidth, gap),
    [screenWidth, gap],
  );

  return (
    <View style={styles.quickWrap}>
      <View style={styles.quickHeader}>
        <Text style={homeStyles.sectionLabel}>Quick Actions</Text>
        <Pressable
          style={styles.customizeBtn}
          onPress={() => router.push("/screens/settings")}
          hitSlop={8}
        >
          <Feather name="sliders" size={sf(12)} color={HomeTheme.mediumGray} />
          <Text style={styles.customizeText}>Customize</Text>
        </Pressable>
      </View>
      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.quickTile,
              { width: tileWidth, marginBottom: gap },
              pressed && styles.quickTilePressed,
            ]}
            onPress={() => router.push(item.route)}
          >
            <Feather name={item.feather} size={sf(20)} color={HomeTheme.deepNavy} />
            <Text style={styles.quickLabel} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Notices({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const cardWidth = useMemo(() => screenWidth - Home.gutter * 2, [screenWidth]);

  const carouselItems = useMemo(
    () => items.filter(isCarouselNotice).map(mapNoticeToHero),
    [items],
  );

  const onHeroScroll = useCallback(
    (event) => {
      if (!carouselItems.length) return;
      const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
      setActiveIndex(Math.min(Math.max(index, 0), carouselItems.length - 1));
    },
    [screenWidth, carouselItems.length],
  );

  const openNotice = useCallback(
    (item) => {
      router.push({
        pathname: "/screens/notice-detail",
        params: { id: String(item.notice?.id ?? item.id) },
      });
    },
    [router],
  );

  const renderHero = useCallback(
    ({ item }) => (
      <View style={{ width: screenWidth, paddingHorizontal: Home.gutter }}>
        <NoticeHeroCard
          item={item}
          cardWidth={cardWidth}
          onPress={() => openNotice(item)}
        />
      </View>
    ),
    [screenWidth, cardWidth, openNotice],
  );

  return (
    <>
      {carouselItems.length > 0 ? (
        <View style={styles.heroWrap}>
          <FlatList
            data={carouselItems}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={screenWidth}
            snapToAlignment="start"
            disableIntervalMomentum
            nestedScrollEnabled
            pagingEnabled
            scrollEventThrottle={16}
            onScroll={onHeroScroll}
            keyExtractor={(item) => item.id}
            renderItem={renderHero}
            style={styles.heroList}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
          />
          {carouselItems.length > 1 ? (
            <View style={styles.heroDots}>
              {carouselItems.map((_, i) => (
                <View
                  key={i}
                  style={[styles.heroDot, i === activeIndex && styles.heroDotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.heroWrap, { paddingHorizontal: Home.gutter }]}>
          <HomeSectionEmpty
            message="No announcements yet"
            hint="Community notices and updates will appear here."
          />
        </View>
      )}

      <QuickActionsGrid screenWidth={screenWidth} />
    </>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    paddingTop: sw(4),
  },
  heroList: {
    height: HERO_HEIGHT,
    flexGrow: 0,
  },
  heroShell: {
    borderRadius: Home.radiusLg,
    overflow: "hidden",
    backgroundColor: HomeTheme.deepNavy,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  blobA: {
    position: "absolute",
    width: sw(140),
    height: sw(140),
    borderRadius: sw(70),
    backgroundColor: "rgba(0, 217, 184, 0.14)",
    left: sw(40),
    bottom: -sw(50),
  },
  blobB: {
    position: "absolute",
    width: sw(90),
    height: sw(90),
    borderRadius: sw(45),
    backgroundColor: "rgba(0, 217, 184, 0.1)",
    left: sw(120),
    top: -sw(30),
  },
  curveWindow: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroCopy: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "58%",
    paddingLeft: sw(16),
    paddingRight: sw(8),
    paddingVertical: sw(16),
    justifyContent: "center",
    zIndex: 2,
  },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: sw(8),
  },
  eyebrowText: {
    marginLeft: sw(6),
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.92)",
    fontWeight: "600",
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: sw(6),
  },
  heroBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "rgba(255,255,255,0.86)",
    marginBottom: sw(14),
  },
  heroCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: sw(14),
    paddingVertical: sw(9),
    borderRadius: 999,
  },
  heroCtaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: HomeTheme.primaryTeal,
    fontWeight: "700",
    marginRight: sw(6),
  },
  toolsFab: {
    position: "absolute",
    right: sw(14),
    bottom: sw(14),
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#0A2A43",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: sw(12),
  },
  heroDot: {
    width: sw(7),
    height: sw(7),
    borderRadius: sw(4),
    backgroundColor: "rgba(10, 42, 67, 0.2)",
    marginHorizontal: sw(3),
  },
  heroDotActive: {
    width: sw(18),
    backgroundColor: HomeTheme.primaryTeal,
  },
  quickWrap: {
    marginTop: sw(20),
    paddingHorizontal: Home.gutter,
  },
  quickHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(12),
  },
  customizeBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  customizeText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: HomeTheme.mediumGray,
    fontWeight: "500",
    marginLeft: sw(5),
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  quickTile: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(16),
    borderRadius: sw(14),
    backgroundColor: HomeTheme.cardBg,
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
  },
  quickTilePressed: {
    backgroundColor: "#E8F8F6",
    borderColor: "rgba(0, 217, 184, 0.35)",
  },
  quickLabel: {
    marginTop: sw(8),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: HomeTheme.darkText,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: sw(4),
  },
});
