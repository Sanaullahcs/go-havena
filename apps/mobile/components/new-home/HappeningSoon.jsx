import { Text, View, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { NoticeCoverMedia } from "../notices/notice-cover-thumbnail";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import {
  formatEventRsvpLabel,
  formatEventTimeRange,
  formatLongDate,
  getNoticeDetailRoute,
} from "../../services/notices-api";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { navigateAppRoute } from "../../utils/app-navigation";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { localizedField } from "../../i18n";

const PEEK = sw(28);
const CARD_RADIUS = sw(16);

function mapEventToCard(notice, lang) {
  return {
    id: String(notice.id),
    title: localizedField(notice, "title") || notice.title || "",
    date: notice.eventDate
      ? formatLongDate(notice.eventDate)
      : notice.eventSchedule ?? notice.timeLabel ?? "",
    time: formatEventTimeRange(notice),
    location: notice.location ?? "",
    rsvp: formatEventRsvpLabel(notice),
    imageUrl: notice.imageUrl,
    notice,
    lang,
  };
}

function EventCard({ item, width, imageH, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardInner}>
        <View style={[styles.imageWrap, { height: imageH }]}>
          <NoticeCoverMedia
            fill
            imageUrl={item.imageUrl}
            notice={item.notice}
            kind="event"
            backgroundColor={T.mint}
          />
          {item.date ? (
            <View style={styles.dateBadge}>
              <Feather name="calendar" size={sf(10)} color={T.navy} />
              <Text style={styles.dateBadgeText}>{item.date}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.time ? (
            <View style={styles.metaRow}>
              <Feather name="clock" size={sf(12)} color={T.teal} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.time}
              </Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={sf(12)} color={T.teal} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : null}
          {item.rsvp ? (
            <View style={styles.metaRow}>
              <Feather name="users" size={sf(12)} color={T.teal} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.rsvp}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const frame = useHomeFrame();

  const events = useMemo(
    () => items.map((notice) => mapEventToCard(notice, i18n.language)),
    [items, i18n.language],
  );

  const layout = useMemo(() => {
    const contentWidth = frame.contentWidth;
    const gap = frame.size(12);
    if (events.length <= 1) {
      const cardWidth = contentWidth;
      return {
        featured: true,
        cardWidth,
        imageH: Math.round(cardWidth * 0.42),
        snap: contentWidth,
        gap,
      };
    }
    const cardWidth = Math.min(contentWidth, Math.floor(contentWidth * 0.84));
    return {
      featured: false,
      cardWidth,
      imageH: Math.round(cardWidth * 0.42),
      snap: cardWidth + gap,
      gap,
    };
  }, [frame, events.length]);

  const openEvent = useCallback(
    (item) => {
      router.push(getNoticeDetailRoute(item.notice ?? { id: item.id, category: "event" }));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
        <EventCard
          item={item}
          width={layout.cardWidth}
          imageH={layout.imageH}
          onPress={() => openEvent(item)}
        />
      </View>
    ),
    [layout.cardWidth, layout.imageH, openEvent],
  );

  if (!events.length) {
    return (
      <View style={[homeStyles.section, styles.sectionTightTop, { marginHorizontal: frame.sideInset }]}>
        <HomeSectionHeader
          label={t("home.happeningSoon")}
          onPress={() => navigateAppRoute(router, PropertyManagementRoutes.NOTICES)}
        />
        <HomeSectionEmpty message={t("home.noEvents")} />
      </View>
    );
  }

  return (
    <View style={[homeStyles.section, styles.sectionTightTop, { marginHorizontal: frame.sideInset }]}>
      <HomeSectionHeader
        label={t("home.happeningSoon")}
        onPress={() => navigateAppRoute(router, PropertyManagementRoutes.NOTICES)}
      />
      {layout.featured ? (
        <EventCard
          item={events[0]}
          width={layout.cardWidth}
          imageH={layout.imageH}
          onPress={() => openEvent(events[0])}
        />
      ) : (
        <FlatList
          data={events}
          horizontal
          style={[styles.carousel, { minHeight: layout.imageH + sw(96) }]}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={layout.snap}
          snapToAlignment="start"
          disableIntervalMomentum
          nestedScrollEnabled
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({ length: layout.snap, offset: layout.snap * index, index })}
          ItemSeparatorComponent={() => <View style={{ width: layout.gap }} />}
          contentContainerStyle={styles.listContent}
        />
      )}
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
    backgroundColor: T.mint,
    position: "relative",
  },
  dateBadge: {
    position: "absolute",
    bottom: sw(8),
    start: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
  },
  dateBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9.5),
    color: T.navy,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: sw(10),
    paddingTop: sw(10),
    paddingBottom: sw(12),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
    marginBottom: sw(6),
    writingDirection: "auto",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    marginTop: sw(3),
  },
  metaText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: T.gray,
    flex: 1,
    writingDirection: "auto",
  },
});
