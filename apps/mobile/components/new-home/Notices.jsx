import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions, FlatList } from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import {
  formatDisplayTime12h,
  formatShortDate,
  getCategoryTheme,
  isCarouselNotice,
} from "../../services/notices-api";
import NoticeCoverThumbnail from "../notices/notice-cover-thumbnail";
import { sw, sf, hp } from "../../utils/responsive";
import HomeSectionEmpty from "./home-section-empty";
import ThemedIconBox from "../ui/themed-icon-box";

import { PropertyManagementRoutes } from "../../constants/property-management-routes";

const QUICK_ACTION_THEMES = {
  "New Post": { soft: "#EFF6FF", icon: "#0052DF", feather: "edit-3" },
  Book: { soft: "#ECFDF5", icon: "#059669", feather: "calendar" },
  Sell: { soft: "#FFF7ED", icon: "#EA580C", feather: "tag" },
  Help: { soft: "#ECFDF5", icon: "#047857", feather: "help-circle" },
  Noticeboard: { soft: "#EFF6FF", icon: "#0052DF", feather: "bell" },
  Marketplace: { soft: "#EFF6FF", icon: "#0052DF", feather: "shopping-cart" },
  Wellness: { soft: "#FDF2F8", icon: "#DB2777", feather: "heart" },
};

const QUICK_ACTIONS = [
  { id: "1", title: "New Post", route: "/screens/create-post" },
  { id: "2", title: "Book", route: PropertyManagementRoutes.AMENITY },
  { id: "3", title: "Sell", route: "/screens/createListing" },
  { id: "4", title: "Help", route: "/screens/help" },
  { id: "5", title: "Noticeboard", route: "/(tabs)/notices" },
  { id: "6", title: "Marketplace", route: "/(tabs)/marketplace" },
  { id: "7", title: "Wellness", route: "/(tabs)/wellness" },
].map((item) => ({
  ...item,
  ...QUICK_ACTION_THEMES[item.title],
}));

const CARD_HEIGHT = hp(11);
const THUMB_SIZE = sw(64);

function mapNoticeToHero(notice) {
  const theme = notice.theme ?? getCategoryTheme(notice.category);
  return {
    id: String(notice.id),
    badge: theme.label.toUpperCase(),
    title: notice.title ?? "",
    dateLabel: notice.eventDate
      ? formatShortDate(notice.eventDate)
      : notice.timeLabel ?? "",
    timeStart: notice.eventTime ? formatDisplayTime12h(notice.eventTime) : "",
    timeEnd: notice.eventTimeEnd ? formatDisplayTime12h(notice.eventTimeEnd) : "",
    imageUrl: notice.imageUrl,
    theme,
    notice,
  };
}

function NoticeHeroCard({ item, cardWidth, onPress }) {
  const hasSchedule = item.dateLabel || item.timeStart;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.94 }}>
      <LinearGradient
        colors={["#0B4FA8", "#0052DF", "#0066FF"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.heroCard, { width: cardWidth }]}
      >
        <View style={styles.heroTextCol}>
          <View style={styles.badge}>
            <Feather name={item.theme?.icon ?? "volume-2"} size={sf(10)} color="#FFFFFF" />
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>

          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title ?? ""}
          </Text>

          {hasSchedule ? (
            <Text style={styles.heroMeta}>
              {item.dateLabel ? (
                <Text style={styles.heroMetaDim}>
                  {item.dateLabel}
                  {item.timeStart ? " from " : ""}
                </Text>
              ) : item.timeStart ? (
                <Text style={styles.heroMetaDim}>from </Text>
              ) : null}
              {item.timeStart ? (
                <>
                  <Text style={styles.heroMetaBold}>{item.timeStart}</Text>
                  {item.timeEnd ? (
                    <>
                      <Text style={styles.heroMetaDim}> to </Text>
                      <Text style={styles.heroMetaBold}>{item.timeEnd}</Text>
                    </>
                  ) : null}
                </>
              ) : null}
            </Text>
          ) : null}
        </View>

        <View style={styles.heroThumbWrap}>
          <NoticeCoverThumbnail
            imageUrl={item.imageUrl}
            title={item.title}
            size={THUMB_SIZE}
            borderRadius={sw(12)}
            style={styles.heroThumb}
          />
        </View>
      </LinearGradient>
    </Pressable>
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
        <NoticeHeroCard item={item} cardWidth={cardWidth} onPress={() => openNotice(item)} />
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
            <View style={styles.dots}>
              {carouselItems.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.heroWrap, styles.heroEmptyWrap]}>
          <View style={{ paddingHorizontal: Home.gutter }}>
            <HomeSectionEmpty
              message="No announcements yet"
              hint="Community notices and updates will appear here."
            />
          </View>
        </View>
      )}

      <View style={[styles.quickActionsWrap, carouselItems.length === 0 && styles.quickActionsTopInset]}>
        <Text style={[homeStyles.sectionLabel, styles.quickActionsLabel]}>Quick Actions</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          nestedScrollEnabled
          bounces
          overScrollMode="never"
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {QUICK_ACTIONS.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={() => router.push(item.route)}
            >
              <View style={styles.chipRow}>
                <ThemedIconBox
                  name={item.feather}
                  size="sm"
                  color={item.icon}
                  backgroundColor={item.soft}
                />
                <Text style={styles.chipText} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    paddingTop: hp(0.25),
    paddingBottom: 0,
  },
  heroEmptyWrap: {
    paddingBottom: hp(0.2),
  },
  heroList: {
    height: CARD_HEIGHT,
  },
  heroCard: {
    height: CARD_HEIGHT,
    borderRadius: sw(14),
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: sw(14),
    paddingRight: sw(10),
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    justifyContent: "center",
    paddingRight: sw(10),
    paddingVertical: sw(8),
    gap: hp(0.25),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: sw(4),
    paddingHorizontal: sw(7),
    paddingVertical: hp(0.2),
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(8.5),
    color: "#FFFFFF",
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: "#FFFFFF",
    fontWeight: "600",
    letterSpacing: 0,
  },
  heroMeta: {
    marginTop: hp(0.1),
  },
  heroMetaDim: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    color: "rgba(255,255,255,0.82)",
  },
  heroMetaBold: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#FFFFFF",
    fontWeight: "600",
  },
  heroThumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: sw(10),
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
    flexShrink: 0,
  },
  heroThumb: {
    width: "100%",
    height: "100%",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: sw(5),
    marginTop: hp(0.35),
  },
  dot: {
    width: sw(6),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: "#C4D5F0",
  },
  dotActive: { backgroundColor: "#0052DF", width: sw(18), borderRadius: sw(3) },
  quickActionsWrap: {
    marginTop: hp(0.5),
    marginBottom: 0,
  },
  quickActionsTopInset: {
    paddingTop: hp(0.35),
    marginTop: 0,
  },
  quickActionsLabel: {
    paddingHorizontal: Home.gutter,
    marginBottom: hp(0.25),
  },
  chipsScroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.05)",
  },
  chipsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(7),
    paddingHorizontal: Home.gutter,
    paddingTop: hp(0.45),
    paddingBottom: hp(0.15),
    paddingRight: Home.gutter + sw(8),
  },
  chip: {
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(10),
    paddingVertical: hp(0.65),
  },
  chipPressed: {
    opacity: 0.85,
    backgroundColor: "#F0F7FF",
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(15),
    color: "#101828",
    fontWeight: "600",
    flexShrink: 0,
  },
});
