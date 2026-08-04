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
import React, { useCallback, useMemo, useState } from "react";
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
import { Image } from "expo-image";
import CrispImage from "../ui/crisp-image";
import { Media } from "../../constants/media";
import { sw, sf } from "../../utils/responsive";
import HomeSectionEmpty from "./home-section-empty";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";

const QUICK_ACTIONS = [
  { id: "1", title: "New Post", icon: "edit-3", route: "/screens/create-post" },
  { id: "2", title: "Book", icon: "calendar", route: PropertyManagementRoutes.AMENITY },
  { id: "3", title: "Sell", icon: "tag", route: "/screens/createListing" },
  { id: "4", title: "Help", icon: "heart", route: "/screens/help" },
  { id: "5", title: "Documents", icon: "file-text", route: PropertyManagementRoutes.DOCUMENTS },
  { id: "6", title: "More", icon: "more-horizontal", route: PropertyManagementRoutes.HOME },
];

const HERO_HEIGHT = sw(160);
const PHOTO_SIZE = sw(130);

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
  const hasRemoteImage = Boolean(item.imageUrl);
  const hasSchedule = item.dateLabel || item.timeStart;

  return (
    <View style={[styles.heroShell, { width: cardWidth, height: HERO_HEIGHT }]}>
      {/* Image on the right — tapping opens full-screen preview */}
      <Pressable
        onPress={() => hasRemoteImage && onImagePress?.()}
        style={styles.heroImageWrap}
        accessibilityRole="imagebutton"
        accessibilityLabel="View notice image"
      >
        {hasRemoteImage ? (
          <CrispImage
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
          />
        ) : (
          <Image
            source={Media.heroEvent}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
      </Pressable>

      {/* Left text block — tapping opens notice detail */}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.heroCopy, pressed && { opacity: 0.85 }]}
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
            <Feather name="calendar" size={sf(11)} color="rgba(255,255,255,0.55)" />
            <Text style={styles.dateText}>
              {item.dateLabel}
              {item.dateLabel && item.timeStart ? " · " : ""}
              {item.timeStart}
              {item.timeEnd ? ` – ${item.timeEnd}` : ""}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.ctaText}>View Details</Text>
          <Feather name="arrow-right" size={sf(12)} color={T.navy} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function QuickActionsRow({ screenWidth }) {
  const router = useRouter();
  const contentWidth = screenWidth - Home.gutter * 2;
  const tileCount = QUICK_ACTIONS.length;
  const tileWidth = Math.floor(contentWidth / tileCount);

  return (
    <View style={styles.qaWrap}>
      <View style={styles.qaHeader}>
        <Text style={homeStyles.sectionLabel}>Quick Actions</Text>
        <Pressable
          style={styles.qaCustomize}
          onPress={() => router.push("/screens/settings")}
          hitSlop={8}
        >
          <Text style={styles.qaCustomizeText}>Customize</Text>
        </Pressable>
      </View>

      <View style={styles.qaRow}>
        {QUICK_ACTIONS.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.qaTile,
              { width: tileWidth },
              pressed && styles.qaTilePressed,
            ]}
            onPress={() => router.push(item.route)}
          >
            <View style={styles.qaIconCircle}>
              <Feather name={item.icon} size={sf(20)} color={T.navy} />
            </View>
            <Text style={styles.qaLabel} numberOfLines={1}>
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
        router.push("/(tabs)/notices");
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

      <QuickActionsRow screenWidth={screenWidth} />

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
            source={{ uri: previewImage }}
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
    borderRadius: sw(18),
    overflow: "hidden",
    backgroundColor: T.navy,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
        }
      : { elevation: 4 }),
  },
  heroImageWrap: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "45%",
    overflow: "hidden",
  },
  heroCopy: {
    width: "58%",
    height: "100%",
    paddingLeft: sw(16),
    justifyContent: "center",
    zIndex: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: "rgba(20,184,166,0.15)",
    marginBottom: sw(6),
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    color: T.teal,
    letterSpacing: 0.6,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: sw(4),
  },
  dateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    marginBottom: sw(8),
  },
  dateText: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    color: "rgba(255,255,255,0.6)",
  },
  ctaBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    backgroundColor: T.teal,
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.navy,
    fontWeight: "700",
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: sw(5),
    marginTop: sw(8),
  },
  dot: {
    width: sw(6),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: T.mint,
  },
  dotActive: {
    width: sw(18),
    backgroundColor: T.navy,
    borderRadius: sw(3),
  },

  qaWrap: {
    marginTop: sw(12),
    paddingHorizontal: Home.gutter,
    paddingBottom: sw(6),
  },
  qaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  qaCustomize: {
    flexDirection: "row",
    alignItems: "center",
  },
  qaCustomizeText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
    fontWeight: "500",
  },
  qaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  qaTile: {
    alignItems: "center",
    paddingVertical: sw(4),
  },
  qaTilePressed: {
    opacity: 0.65,
  },
  qaIconCircle: {
    width: sw(42),
    height: sw(42),
    borderRadius: sw(21),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(6),
  },
  qaLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10.5),
    lineHeight: sf(14),
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
