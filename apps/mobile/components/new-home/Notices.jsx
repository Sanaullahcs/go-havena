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
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useBillsSummary } from "../../hooks/use-bills-summary";
import { PAY_BILLS_ENABLED } from "../../services/payments-api";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { isGuestUser } from "../../services/community-access";
import Tap from "../ui/tap";
import { Fonts } from "../../constants/font";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  formatDisplayTime12h,
  formatNoticeRelativeTime,
  formatShortDate,
  getCategoryTheme,
  getNoticeDetailRoute,
} from "../../services/notices-api";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import CrispImage from "../ui/crisp-image";
import { NoticeCoverMedia } from "../notices/notice-cover-thumbnail";
import { mediaImageSource } from "../../utils/profile-display";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import HomeSectionEmpty from "./home-section-empty";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { MarketplaceRoutes } from "../../constants/marketplace-routes";
import { navigateAppRoute } from "../../utils/app-navigation";
import { arrowForward } from "../../utils/rtl";
import i18n, { localizedField } from "../../i18n";
import { useSessionUser } from "../../hooks/use-session-user";
import { isHomeSectionEnabled, isResidentFeatureEnabled, serverFeatureFlags } from "../../constants/resident-features";
import { homeSectionEmptyHintKey } from "../../utils/home-section-empty-copy";

const QUICK_ACTIONS = [
  { id: "bills", titleKey: "home.qa.bills", icon: "credit-card", route: "/screens/bills", feature: null, highlight: true },
  { id: "book", titleKey: "home.qa.book", icon: "home", route: PropertyManagementRoutes.AMENITY_SCREEN, feature: "amenities" },
  { id: "sell", titleKey: "home.qa.sell", icon: "shopping-bag", route: MarketplaceRoutes.CREATE_LISTING, feature: "marketplace" },
  { id: "feed", titleKey: "home.qa.feed", icon: "message-circle", route: "/screens/community-feed", feature: "feed" },
  { id: "deals", titleKey: "home.qa.deals", icon: "percent", route: MarketplaceRoutes.DEALS, feature: "marketplace" },
  { id: "wellness", titleKey: "home.qa.wellness", icon: "heart", route: "/(tabs)/wellness", feature: "wellness" },
  { id: "docs", titleKey: "home.qa.docs", icon: "file-text", route: PropertyManagementRoutes.DOCUMENTS_SCREEN, feature: "documents" },
  { id: "bookings", titleKey: "home.qa.bookings", icon: "clipboard", route: PropertyManagementRoutes.MY_BOOKING_SCREEN, feature: "bookings" },
];

function noticeFeatureKey(notice) {
  const category = String(notice?.category ?? "").toLowerCase();
  if (category === "event") return "events";
  if (category === "emergency" || category === "alert") return "alerts";
  return "notices";
}

const HERO_HEIGHT_DESIGN = 196;
/** Auto-advance interval for the home notices carousel. */
const AUTO_SCROLL_INTERVAL_MS = 5 * 60 * 1000;

function mapNoticeToHero(notice, t) {
  const theme = notice.theme ?? getCategoryTheme(notice.category);
  const cat = notice.category ?? "general";
  return {
    id: String(notice.id),
    badge: (() => {
      const label = t(`categories.${cat}`, { defaultValue: theme.label });
      return String(i18n.language || "").startsWith("ar") ? label : label.toUpperCase();
    })(),
    badgeIcon: theme.icon ?? "bell",
    title: localizedField(notice, "title") || notice.title || "",
    dateLabel: notice.eventDate
      ? formatShortDate(notice.eventDate)
      : formatNoticeRelativeTime(notice),
    timeStart: notice.eventTime ? formatDisplayTime12h(notice.eventTime) : "",
    timeEnd: notice.eventTimeEnd ? formatDisplayTime12h(notice.eventTimeEnd) : "",
    imageUrl: notice.imageUrl,
    notice,
  };
}

function NoticeHeroCard({ item, cardWidth, heroHeight, onPress, onImagePress }) {
  const { t, i18n } = useTranslation();
  const arabic = String(i18n.language || "").startsWith("ar");
  const [imageFailed, setImageFailed] = useState(false);
  const hasRemoteImage = Boolean(item.imageUrl);
  const hasSchedule = item.dateLabel || item.timeStart;

  useEffect(() => {
    setImageFailed(false);
  }, [item.imageUrl]);

  const circleD = cardWidth * 1.45;
  const curveRight = cardWidth * 0.30;

  return (
    <View style={[styles.heroShell, { width: cardWidth, height: heroHeight }]}>
      {/* Layer 1 — image positioned on the right side only */}
      <View style={styles.imageArea}>
        <NoticeCoverMedia
          fill
          imageUrl={item.imageUrl}
          notice={item.notice}
          backgroundColor={T.navy}
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
            end: curveRight,
            top: (heroHeight - circleD) / 2,
            pointerEvents: "none",
          },
        ]}
      />

      {/* Layer 3 — teal arc border between navy curve and image */}
      <View
        style={[
          styles.curveAccent,
          {
            width: circleD + sw(5),
            height: circleD + sw(5),
            borderRadius: (circleD + sw(5)) / 2,
            end: curveRight - sw(2.5),
            top: (heroHeight - circleD - sw(5)) / 2,
            pointerEvents: "none",
          },
        ]}
      />

      {/* Layer 4 — text content (rendered last = always on top) */}
      <View style={[styles.heroCopy, { pointerEvents: "box-none" }]}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.heroCopyInner, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.badge, arabic && styles.badgeAr]}>
            <Feather name={item.badgeIcon} size={sf(10)} color={T.teal} />
            <Text style={[styles.badgeText, arabic && styles.badgeTextAr]} numberOfLines={1}>{item.badge}</Text>
          </View>

          <Text style={[styles.heroTitle, arabic && styles.heroTitleAr]} numberOfLines={3} ellipsizeMode="tail">
            {item.title}
          </Text>
          {hasSchedule ? (
            <View style={styles.dateLine}>
              <Feather name="calendar" size={sf(11)} color="rgba(209,250,245,0.6)" />
              <Text style={[styles.dateText, arabic && styles.dateTextAr]} numberOfLines={1}>
                {item.dateLabel}
                {item.dateLabel && item.timeStart ? "  ·  " : ""}
                {item.timeStart}
                {item.timeEnd ? ` – ${item.timeEnd}` : ""}
              </Text>
            </View>
          ) : null}

          <View style={[styles.ctaBtn, arabic && styles.ctaBtnAr]}>
            <Text style={[styles.ctaText, arabic && styles.ctaTextAr]} numberOfLines={1}>{t("notices.viewDetails")}</Text>
            <Feather name={arrowForward()} size={sf(9)} color="#fff" />
          </View>
        </Pressable>
      </View>

      {/* Layer 5 — image tap zone */}
      {hasRemoteImage && !imageFailed ? (
        <Pressable
          onPress={() => onImagePress?.()}
          style={styles.imageTap}
          accessibilityRole="imagebutton"
          accessibilityLabel={t("notices.viewFullImage")}
        />
      ) : null}
    </View>
  );
}

function QuickActionsRow() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const dialog = useAppDialog();
  const arabic = String(i18n.language || "").startsWith("ar");
  const frame = useHomeFrame();
  const sessionUser = useSessionUser();
  const guest = isGuestUser(sessionUser);
  const { summary: bills, refresh: refreshBills } = useBillsSummary({ enabled: PAY_BILLS_ENABLED && !guest });
  useFocusEffect(useCallback(() => { void refreshBills(); }, [refreshBills]));
  // Home badge: unit-service bills only (not amenity shared bills or utilities).
  const billsDue = bills?.groups?.unit?.count ?? 0;
  const billsOverdue = (bills?.groups?.unit?.overdue ?? 0) > 0;
  const actions = QUICK_ACTIONS.filter((item) => {
    if (!serverFeatureFlags(sessionUser)) return false;
    if (item.id === "bills") return !guest;
    if (item.id === "notices") {
      return (
        isResidentFeatureEnabled(sessionUser, "notices") ||
        isResidentFeatureEnabled(sessionUser, "events") ||
        isResidentFeatureEnabled(sessionUser, "alerts")
      );
    }
    return isResidentFeatureEnabled(sessionUser, item.feature);
  });
  const gap = frame.size(4);
  const fitW = actions.length > 0 ? (frame.contentWidth - gap * (actions.length - 1)) / actions.length : 0;
  // Tile floor is wide enough for "Amenities" on a Pro Max. The label uses the
  // same scale as the tile, so the last letter stays on the first line.
  const tileW = Math.min(frame.size(86), Math.max(frame.size(74), Math.floor(fitW)));
  const rowWidth = actions.length * tileW + Math.max(0, actions.length - 1) * gap;
  const centerRow = actions.length > 0 && rowWidth <= frame.contentWidth;
  const labelSize = frame.size(10.5);
  const labelLine = arabic ? frame.size(16) : frame.size(14);
  const labelLines = arabic ? 2 : 1;
  const listHeight = sw(44) + sw(8) + labelLine * labelLines;

  const openAction = useCallback(
    (item) => {
      if (item.id === "bills" && !PAY_BILLS_ENABLED) {
        dialog.showDialog({
          type: "info",
          title: t("bills.comingSoonTitle"),
          message: t("bills.comingSoonBody"),
        });
        return;
      }
      navigateAppRoute(router, item.route);
    },
    [dialog, router, t],
  );

  if (actions.length === 0) return null;

  return (
    <View style={styles.qaWrap}>
      <Text
        style={[
          homeStyles.sectionLabel,
          styles.qaHeader,
          arabic && styles.qaHeaderAr,
          { paddingHorizontal: frame.sideInset },
        ]}
        numberOfLines={1}
      >
        {t("home.quickActions", { defaultValue: "Quick Actions" })}
      </Text>
      <FlatList
        data={actions}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={tileW + gap}
        snapToAlignment="start"
        disableIntervalMomentum
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        style={[styles.qaList, { height: listHeight }]}
        contentContainerStyle={[
          styles.qaListContent,
          { paddingHorizontal: frame.sideInset },
          centerRow && styles.qaListContentCentered,
        ]}
        getItemLayout={(_, index) => ({
          length: tileW + gap,
          offset: (tileW + gap) * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={[styles.qaItem, { width: tileW, maxWidth: tileW }]}>
            <Tap
              onPress={() => openAction(item)}
              style={[styles.qaTile, { width: tileW, maxWidth: tileW }]}
              pressedStyle={styles.qaTilePressed}
              accessibilityRole="button"
              accessibilityLabel={
                item.id === "bills" && PAY_BILLS_ENABLED && billsDue > 0
                  ? `${t(item.titleKey)}, ${t("bills.billsDue", { count: billsDue })}`
                  : t(item.titleKey)
              }
            >
              <View style={[styles.qaIconSlot, { width: tileW }]}>
                {item.highlight ? (
                  <LinearGradient
                    colors={billsOverdue ? ["#EF4B23", "#C23812"] : [T.navy, T.teal]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.qaIcon}
                  >
                    <Feather name={item.icon} size={sf(18)} color="#FFFFFF" />
                  </LinearGradient>
                ) : (
                  <View style={styles.qaIcon}>
                    <Feather name={item.icon} size={sf(18)} color={T.navy} />
                  </View>
                )}
                {item.id === "bills" && PAY_BILLS_ENABLED && billsDue > 0 ? (
                  <View style={[styles.qaBadge, billsOverdue && styles.qaBadgeAlert]}>
                    <Text style={styles.qaBadgeText}>{billsDue > 9 ? "9+" : billsDue}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.qaLabel,
                  arabic && styles.qaLabelAr,
                  { width: tileW, maxWidth: tileW, fontSize: labelSize, lineHeight: labelLine },
                ]}
                numberOfLines={labelLines}
                adjustsFontSizeToFit={!arabic}
                minimumFontScale={0.9}
                ellipsizeMode="tail"
              >
                {t(item.titleKey)}
              </Text>
            </Tap>
          </View>
        )}
      />
    </View>
  );
}

export default function Notices({ items = [], noticesLoaded = false }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const sessionUser = useSessionUser();
  const { width: screenWidth } = useWindowDimensions();
  const frame = useHomeFrame();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewImage, setPreviewImage] = useState(null);
  const cardWidth = frame.contentWidth;
  const arabicHome = String(i18n.language || "").startsWith("ar");
  const heroHeight = frame.size(arabicHome ? 224 : HERO_HEIGHT_DESIGN);
  const listRef = useRef(null);
  const activeIndexRef = useRef(0);
  const userScrollingRef = useRef(false);

  const carouselItems = useMemo(
    () =>
      items
        // Hero is notices + alerts only; events belong in Happening Soon.
        .filter((n) => n && n.id && String(n.category ?? "").toLowerCase() !== "event" && !n.isEvent)
        .filter((n) => isHomeSectionEnabled(sessionUser, noticeFeatureKey(n)))
        .slice(0, 7)
        .map((n) => mapNoticeToHero(n, t)),
    [items, sessionUser, t, i18n.language],
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    if (carouselItems.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
    carouselItems.forEach((item) => {
      if (item.imageUrl) {
        Image.prefetch(item.imageUrl).catch(() => {});
      }
    });
  }, [carouselItems.length, screenWidth]);

  useEffect(() => {
    if (carouselItems.length < 2 || previewImage) return undefined;

    const timer = setInterval(() => {
      if (userScrollingRef.current) return;
      const next = (activeIndexRef.current + 1) % carouselItems.length;
      activeIndexRef.current = next;
      setActiveIndex(next);
      listRef.current?.scrollToIndex({
        index: next,
        animated: true,
        viewPosition: 0,
      });
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [carouselItems.length, previewImage, screenWidth]);

  const onHeroScroll = useCallback(
    (event) => {
      if (!carouselItems.length) return;
      const index = Math.round(
        event.nativeEvent.contentOffset.x / screenWidth,
      );
      const next = Math.min(Math.max(index, 0), carouselItems.length - 1);
      activeIndexRef.current = next;
      setActiveIndex(next);
    },
    [screenWidth, carouselItems.length],
  );

  const onScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    userScrollingRef.current = false;
  }, []);

  const openNotice = useCallback(
    (item) => {
      if (item.notice) {
        router.push(getNoticeDetailRoute(item.notice));
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
      <View style={{ width: screenWidth, paddingHorizontal: frame.sideInset }}>
        <NoticeHeroCard
          item={item}
          cardWidth={cardWidth}
          heroHeight={heroHeight}
          onPress={() => openNotice(item)}
          onImagePress={() => openImage(item)}
        />
      </View>
    ),
    [screenWidth, cardWidth, heroHeight, frame.sideInset, openNotice, openImage],
  );

  return (
    <>
      {carouselItems.length > 0 ? (
        <View style={styles.heroWrap}>
          <FlatList
            ref={listRef}
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
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollEnd={onScrollEndDrag}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: Math.max(0, index) * screenWidth,
                  animated: true,
                });
              });
            }}
            keyExtractor={(item) => item.id}
            renderItem={renderHero}
            style={[styles.heroFlatList, { height: heroHeight, width: screenWidth }]}
            contentContainerStyle={[styles.heroFlatListContent, { height: heroHeight }]}
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
      ) : noticesLoaded ? (
        <View style={[styles.heroEmptyWrap, { width: "100%", paddingHorizontal: frame.sideInset }]}>
          <HomeSectionEmpty
            icon="bell"
            message={t("home.noNotices")}
            hint={t(homeSectionEmptyHintKey(sessionUser, "noNoticesHint"))}
          />
        </View>
      ) : null}

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
            accessibilityLabel={t("common.close")}
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
    flexGrow: 0,
  },
  heroFlatListContent: {
    alignItems: "stretch",
  },
  heroShell: {
    borderRadius: sw(16),
    overflow: "hidden",
    backgroundColor: T.navy,
    ...(Platform.OS === "ios"
      ? {
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 6 }, opacity: 0.2, radius: 16 }),
          borderCurve: "continuous",
        }
      : { elevation: 6 }),
  },
  imageArea: {
    position: "absolute",
    end: 0,
    top: 0,
    bottom: 0,
    width: "34%",
    overflow: "hidden",
    zIndex: 0,
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
    start: 0,
    top: 0,
    bottom: 0,
    width: "68%",
    paddingStart: sw(16),
    paddingEnd: sw(10),
    paddingTop: sw(14),
    paddingBottom: sw(14),
    justifyContent: "center",
  },
  heroCopyInner: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    maxWidth: "100%",
    gap: sw(8),
  },
  imageTap: {
    position: "absolute",
    end: 0,
    top: 0,
    bottom: 0,
    width: "32%",
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
    marginBottom: sw(4),
  },
  badgeAr: {
    paddingVertical: sw(5),
    paddingHorizontal: sw(10),
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    lineHeight: sf(14),
    color: T.teal,
    letterSpacing: 0.8,
    fontWeight: "700",
    writingDirection: "auto",
  },
  badgeTextAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    letterSpacing: 0,
    fontSize: sf(12),
    lineHeight: sf(20),
    writingDirection: "rtl",
    includeFontPadding: true,
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14.5),
    lineHeight: sf(20),
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: 0,
    flexShrink: 1,
    writingDirection: "auto",
  },
  heroTitleAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    fontSize: sf(15),
    lineHeight: sf(26),
    writingDirection: "rtl",
    includeFontPadding: true,
  },
  dateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    marginTop: sw(6),
    marginBottom: 0,
  },
  dateText: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(16),
    color: "rgba(209,250,245,0.7)",
    flexShrink: 1,
    writingDirection: "auto",
  },
  dateTextAr: {
    fontFamily: "NotoSansArabic-Regular",
    fontSize: sf(12),
    lineHeight: sf(20),
    writingDirection: "rtl",
    includeFontPadding: true,
  },
  ctaBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(3),
    backgroundColor: T.teal,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
  },
  ctaBtnAr: {
    paddingVertical: sw(4),
    paddingHorizontal: sw(8),
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: "#fff",
    fontWeight: "700",
    writingDirection: "auto",
  },
  ctaTextAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    fontSize: sf(11),
    lineHeight: sf(16),
    writingDirection: "rtl",
    includeFontPadding: false,
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
    paddingBottom: 0,
  },
  qaHeader: {
    marginBottom: sw(10),
  },
  qaHeaderAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    textTransform: "none",
    letterSpacing: 0,
    fontSize: sf(16),
    lineHeight: sf(30),
    writingDirection: "rtl",
    includeFontPadding: true,
    paddingHorizontal: sw(4),
    overflow: "visible",
  },
  qaList: {
    width: "100%",
    flexGrow: 0,
  },
  qaListContent: {
    alignItems: "flex-start",
  },
  qaListContentCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  qaItem: {
    flexShrink: 0,
  },
  qaTile: {
    alignItems: "center",
    overflow: "visible",
  },
  qaTilePressed: {
    opacity: 0.7,
  },
  qaIconSlot: {
    alignItems: "center",
    marginBottom: sw(6),
  },
  qaIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  qaBadge: {
    position: "absolute",
    top: -sw(2),
    end: sw(10),
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(4),
    borderRadius: sw(9),
    backgroundColor: T.teal,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  qaBadgeAlert: { backgroundColor: "#EF4B23" },
  qaBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    color: "#FFFFFF",
    includeFontPadding: false,
  },
  qaLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: T.navy,
    fontWeight: "500",
    textAlign: "center",
    includeFontPadding: false,
  },
  qaLabelAr: {
    fontFamily: "NotoSansArabic-Medium",
    fontWeight: "normal",
    letterSpacing: 0,
    writingDirection: "rtl",
    textAlign: "center",
    includeFontPadding: true,
    lineHeight: sf(18),
    paddingHorizontal: sw(2),
    overflow: "visible",
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
    end: sw(16),
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
