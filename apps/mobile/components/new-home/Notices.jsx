import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  Modal,
  Platform,
  StatusBar,
} from "react-native";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  formatDisplayTime12h,
  formatShortDate,
  getCategoryTheme,
} from "../../services/notices-api";
import CrispImage from "../ui/crisp-image";
import { NoticeCoverMedia } from "../notices/notice-cover-thumbnail";
import { mediaImageSource } from "../../utils/profile-display";
import { sw, sf } from "../../utils/responsive";
import HomeSectionEmpty from "./home-section-empty";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { MarketplaceRoutes } from "../../constants/marketplace-routes";
import { navigateAppRoute } from "../../utils/app-navigation";

const QUICK_ACTIONS = [
  { id: "post", title: "Post", icon: "edit-3", route: "/screens/create-post" },
  { id: "book", title: "Book", icon: "calendar", route: PropertyManagementRoutes.AMENITY },
  { id: "sell", title: "Sell", icon: "shopping-bag", route: MarketplaceRoutes.CREATE_LISTING },
  { id: "notices", title: "Notices", icon: "bell", route: PropertyManagementRoutes.NOTICES },
  { id: "feed", title: "Feed", icon: "message-circle", route: "/screens/community-feed" },
  { id: "deals", title: "Deals", icon: "percent", route: MarketplaceRoutes.DEALS },
  { id: "wellness", title: "Wellness", icon: "heart", route: "/(tabs)/wellness" },
  { id: "docs", title: "Docs", icon: "file-text", route: PropertyManagementRoutes.DOCUMENTS },
  { id: "bookings", title: "Bookings", icon: "clipboard", route: PropertyManagementRoutes.MY_BOOKING },
  { id: "chat", title: "Chat", icon: "mail", route: "/screens/messages" },
];

const QA_TILE_W = sw(64);
const QA_GAP = sw(20);

const HERO_HEIGHT = sw(175);

function mapNoticeToHero(notice) {
  const theme = notice.theme ?? getCategoryTheme(notice.category);
  return {
    id: String(notice.id),
    badge: theme.label.toUpperCase(),
    badgeIcon: theme.icon ?? "bell",
    title: notice.title ?? "",
    dateLabel: notice.eventDate
      ? formatShortDate(notice.eventDate)
      : notice.timeLabel ?? "",
    timeStart: notice.eventTime ? formatDisplayTime12h(notice.eventTime) : "",
    timeEnd: notice.eventTimeEnd ? formatDisplayTime12h(notice.eventTimeEnd) : "",
    imageUrl: notice.imageUrl,
    notice,
  };
}

function NoticeHeroCard({ item, cardWidth, onPress, onImagePress }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasRemoteImage = Boolean(item.imageUrl);
  const hasSchedule = item.dateLabel || item.timeStart;

  useEffect(() => {
    setImageFailed(false);
  }, [item.imageUrl]);

  const circleD = cardWidth * 1.5;
  const curveRight = cardWidth * 0.40;

  return (
    <View style={[styles.heroShell, { width: cardWidth, height: HERO_HEIGHT }]}>
      {/* Layer 1 — image positioned on the right side only */}
      <View style={styles.imageArea}>
        <NoticeCoverMedia
          fill
          imageUrl={item.imageUrl}
          onImageError={() => setImageFailed(true)}
        />
      </View>

      {/* Layer 2 — curved navy panel (oversized circle, clipped) */}
      <View
        style={[
          styles.curveShape,
          {
            width: circleD,
            height: circleD,
            borderRadius: circleD / 2,
            right: curveRight,
            top: (HERO_HEIGHT - circleD) / 2,
          },
        ]}
        pointerEvents="none"
      />

      {/* Layer 3 — teal arc border between navy curve and image */}
      <View
        style={[
          styles.curveAccent,
          {
            width: circleD + sw(5),
            height: circleD + sw(5),
            borderRadius: (circleD + sw(5)) / 2,
            right: curveRight - sw(2.5),
            top: (HERO_HEIGHT - circleD - sw(5)) / 2,
          },
        ]}
        pointerEvents="none"
      />

      {/* Layer 4 — text content (rendered last = always on top) */}
      <View style={styles.heroCopy} pointerEvents="box-none">
        <View style={styles.accentBar} />

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.heroCopyInner, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.badge}>
            <Feather name={item.badgeIcon} size={sf(10)} color={T.teal} />
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>

          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {hasSchedule ? (
            <View style={styles.dateLine}>
              <Feather name="calendar" size={sf(12)} color="rgba(209,250,245,0.6)" />
              <Text style={styles.dateText}>
                {item.dateLabel}
                {item.dateLabel && item.timeStart ? "  ·  " : ""}
                {item.timeStart}
                {item.timeEnd ? ` – ${item.timeEnd}` : ""}
              </Text>
            </View>
          ) : null}

          <View style={styles.ctaBtn}>
            <Text style={styles.ctaText}>View Details</Text>
            <Feather name="arrow-right" size={sf(12)} color="#fff" />
          </View>
        </Pressable>
      </View>

      {/* Layer 5 — image tap zone */}
      {hasRemoteImage && !imageFailed ? (
        <Pressable
          onPress={() => onImagePress?.()}
          style={styles.imageTap}
          accessibilityRole="imagebutton"
          accessibilityLabel="View full image"
        />
      ) : null}
    </View>
  );
}

function QuickActionsRow() {
  const router = useRouter();

  const openAction = useCallback(
    (route) => {
      navigateAppRoute(router, route);
    },
    [router],
  );

  return (
    <View style={styles.qaWrap}>
      <Text style={[homeStyles.sectionLabel, styles.qaHeader]}>Quick Actions</Text>
      <FlatList
        data={QUICK_ACTIONS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={QA_TILE_W + QA_GAP}
        snapToAlignment="start"
        disableIntervalMomentum
        ItemSeparatorComponent={() => <View style={{ width: QA_GAP }} />}
        contentContainerStyle={styles.qaListContent}
        getItemLayout={(_, index) => ({
          length: QA_TILE_W + QA_GAP,
          offset: (QA_TILE_W + QA_GAP) * index,
          index,
        })}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openAction(item.route)}
            style={({ pressed }) => [
              styles.qaTile,
              pressed && styles.qaTilePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <View style={styles.qaIcon}>
              <Feather name={item.icon} size={sf(18)} color={T.navy} />
            </View>
            <Text style={styles.qaLabel} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export default function Notices({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewImage, setPreviewImage] = useState(null);
  const cardWidth = useMemo(() => screenWidth - Home.gutter * 2, [screenWidth]);

  const carouselItems = useMemo(
    () =>
      items
        .filter((n) => n && n.id)
        .slice(0, 6)
        .map(mapNoticeToHero),
    [items],
  );

  const onHeroScroll = useCallback(
    (event) => {
      if (!carouselItems.length) return;
      const index = Math.round(
        event.nativeEvent.contentOffset.x / screenWidth,
      );
      setActiveIndex(
        Math.min(Math.max(index, 0), carouselItems.length - 1),
      );
    },
    [screenWidth, carouselItems.length],
  );

  const openNotice = useCallback(
    (item) => {
      if (item.notice) {
        router.push({
          pathname: "/screens/notice-detail",
          params: { id: String(item.notice.id) },
        });
      } else {
        navigateAppRoute(router, PropertyManagementRoutes.NOTICES);
      }
    },
    [router],
  );

  const openImage = useCallback((item) => {
    const uri = item.imageUrl;
    if (uri) setPreviewImage(uri);
  }, []);

  const renderHero = useCallback(
    ({ item }) => (
      <View style={{ width: screenWidth, paddingHorizontal: Home.gutter }}>
        <NoticeHeroCard
          item={item}
          cardWidth={cardWidth}
          onPress={() => openNotice(item)}
          onImagePress={() => openImage(item)}
        />
      </View>
    ),
    [screenWidth, cardWidth, openNotice, openImage],
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
            style={styles.heroFlatList}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
          />
          {carouselItems.length > 1 ? (
            <View style={styles.dots}>
              {carouselItems.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.heroEmptyWrap}>
          <View style={{ paddingHorizontal: Home.gutter }}>
            <HomeSectionEmpty
              message="No announcements yet"
              hint="Community notices and updates will appear here."
            />
          </View>
        </View>
      )}

      <QuickActionsRow />

      {/* Full-screen image preview */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewImage(null)}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.previewRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewImage(null)}
          />
          <CrispImage
            source={mediaImageSource(previewImage) ?? { uri: previewImage }}
            style={styles.previewImage}
            contentFit="contain"
          />
          <Pressable
            onPress={() => setPreviewImage(null)}
            style={[styles.previewClose, { top: Math.max(insets.top, 12) + 8 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Feather name="x" size={sf(22)} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    paddingTop: sw(4),
  },
  heroEmptyWrap: {
    paddingTop: sw(4),
    paddingBottom: sw(4),
  },
  heroFlatList: {
    height: HERO_HEIGHT,
    flexGrow: 0,
  },
  heroShell: {
    borderRadius: sw(16),
    overflow: "hidden",
    backgroundColor: T.navy,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
          borderCurve: "continuous",
        }
      : { elevation: 6 }),
  },
  imageArea: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "48%",
  },
  curveShape: {
    position: "absolute",
    backgroundColor: T.navy,
  },
  curveAccent: {
    position: "absolute",
    backgroundColor: "transparent",
    borderWidth: sw(2.5),
    borderColor: T.teal,
  },
  heroCopy: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "55%",
    paddingLeft: sw(18),
    paddingTop: sw(14),
    paddingBottom: sw(16),
    justifyContent: "center",
  },
  heroCopyInner: {
    flex: 1,
    justifyContent: "center",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: sw(18),
    width: sw(28),
    height: sw(3),
    borderRadius: sw(2),
    backgroundColor: T.teal,
    opacity: 0.7,
  },
  imageTap: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "45%",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: "rgba(20,184,166,0.18)",
    marginBottom: sw(8),
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    color: T.teal,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15.5),
    lineHeight: sf(21),
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: sw(6),
  },
  dateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    marginBottom: sw(10),
  },
  dateText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "rgba(209,250,245,0.7)",
  },
  ctaBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: T.teal,
    paddingHorizontal: sw(14),
    paddingVertical: sw(7),
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#fff",
    fontWeight: "700",
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(10),
  },
  dot: {
    width: sw(7),
    height: sw(7),
    borderRadius: sw(4),
    backgroundColor: T.mint,
  },
  dotActive: {
    width: sw(22),
    height: sw(7),
    backgroundColor: T.teal,
    borderRadius: sw(4),
  },

  qaWrap: {
    marginTop: sw(12),
    paddingBottom: sw(2),
  },
  qaHeader: {
    paddingHorizontal: Home.gutter,
    marginBottom: sw(10),
  },
  qaListContent: {
    paddingHorizontal: Home.gutter,
    paddingRight: Home.gutter + sw(8),
  },
  qaTile: {
    width: QA_TILE_W,
    alignItems: "center",
  },
  qaTilePressed: {
    opacity: 0.7,
  },
  qaIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(6),
  },
  qaLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10.5),
    lineHeight: sf(13),
    color: T.navy,
    fontWeight: "500",
    textAlign: "center",
  },
  previewRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "92%",
    height: "70%",
  },
  previewClose: {
    position: "absolute",
    right: sw(16),
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
