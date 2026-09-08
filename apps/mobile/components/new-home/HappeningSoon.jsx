import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { NoticeCoverMedia } from "../notices/notice-cover-thumbnail";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { formatEventTimeRange, formatLongDate, getNoticeDetailRoute } from "../../services/notices-api";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { navigateAppRoute } from "../../utils/app-navigation";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { localizedField } from "../../i18n";

const CARD_GAP = sw(12);
const PEEK = sw(32);
const CARD_RADIUS = sw(16);
const BODY_MIN_H = sw(110);

function mapEventToCard(notice) {
  return {
    id: String(notice.id),
    title: notice.title ?? "",
    date: notice.eventDate
      ? formatLongDate(notice.eventDate)
      : notice.eventSchedule ?? notice.timeLabel ?? "",
    time: formatEventTimeRange(notice),
    location: notice.location ?? "",
    imageUrl: notice.imageUrl,
    notice,
  };
}

function EventCard({ item, width, imageH, cardHeight, onPress }) {
  const { i18n } = useTranslation();
  const displayTitle = localizedField(item.notice, "title") || item.title;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width, minHeight: cardHeight },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardInner, { minHeight: cardHeight }]}>
        <View style={[styles.imageWrap, { height: imageH }]}>
          <NoticeCoverMedia
            fill
            imageUrl={item.imageUrl}
            notice={item.notice}
            kind="event"
          />
          {item.date ? (
            <View style={styles.dateBadge}>
              <Feather name="calendar" size={sf(10)} color={T.navy} />
              <Text style={styles.dateBadgeText} numberOfLines={1}>
                {item.date}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={3}>
            {displayTitle}
          </Text>
          <View style={styles.metaBlock}>
            {item.time ? (
              <View style={styles.metaRow}>
                <Feather name="clock" size={sf(11)} color={T.teal} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.time}
                </Text>
              </View>
            ) : null}
            {item.location ? (
              <View style={styles.metaRow}>
                <Feather name="map-pin" size={sf(11)} color={T.teal} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();

  const events = useMemo(() => items.map(mapEventToCard), [items, i18n.language]);

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - PEEK) / 2);
    const imageH = Math.round(cardWidth * 0.65);
    const cardHeight = imageH + BODY_MIN_H;
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, imageH, cardHeight, snap };
  }, [screenWidth]);

  const openEvent = useCallback(
    (item) => {
      router.push(getNoticeDetailRoute(item.notice ?? { id: item.id, category: "event" }));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ width: layout.cardWidth, minHeight: layout.cardHeight, flexShrink: 0 }}>
        <EventCard
          item={item}
          width={layout.cardWidth}
          imageH={layout.imageH}
          cardHeight={layout.cardHeight}
          onPress={() => openEvent(item)}
        />
      </View>
    ),
    [layout.cardWidth, layout.imageH, layout.cardHeight, openEvent],
  );

  if (!events.length) {
    return (
      <View style={[homeStyles.section, styles.sectionTightTop]}>
        <HomeSectionHeader
          label={t("home.happeningSoon")}
          onPress={() => navigateAppRoute(router, PropertyManagementRoutes.NOTICES)}
        />
        <HomeSectionEmpty message={t("home.noEvents")} />
      </View>
    );
  }

  return (
    <View style={[homeStyles.section, styles.sectionTightTop]}>
      <HomeSectionHeader
        label={t("home.happeningSoon")}
        onPress={() => navigateAppRoute(router, PropertyManagementRoutes.NOTICES)}
      />
      <FlatList
        data={events}
        horizontal
        style={[styles.carousel, { minHeight: layout.cardHeight }]}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={layout.snap}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: layout.snap, offset: layout.snap * index, index })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTightTop: {
    paddingTop: 0,
  },
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingEnd: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: CARD_RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 3 }, opacity: 0.08, radius: 10 }),
          borderCurve: "continuous",
        }
      : { elevation: 2 }),
  },
  cardPressed: { opacity: 0.93, transform: [{ scale: 0.98 }] },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  imageWrap: {
    width: "100%",
    backgroundColor: T.white,
    position: "relative",
    overflow: "hidden",
  },
  dateBadge: {
    position: "absolute",
    bottom: sw(8),
    start: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    maxWidth: "85%",
  },
  dateBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9),
    color: T.navy,
    fontWeight: "600",
    flexShrink: 1,
    writingDirection: "auto",
  },
  body: {
    flex: 1,
    paddingHorizontal: sw(10),
    paddingTop: sw(10),
    paddingBottom: sw(10),
    justifyContent: "space-between",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(12.5),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
    flexShrink: 1,
    writingDirection: "auto",
  },
  metaBlock: {
    gap: sw(3),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
  },
  metaText: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: T.gray,
    flex: 1,
    flexShrink: 1,
    writingDirection: "auto",
  },
});
