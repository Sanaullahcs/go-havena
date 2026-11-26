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
  formatNoticeRelativeTime,
  getNoticeDetailRoute,
} from "../../services/notices-api";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { navigateAppRoute } from "../../utils/app-navigation";
import { useSessionUser } from "../../hooks/use-session-user";
import { isHomeSectionEnabled } from "../../constants/resident-features";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { localizedField } from "../../i18n";
import { homeSectionEmptyHintKey } from "../../utils/home-section-empty-copy";

const PEEK = sw(28);
const CARD_RADIUS = sw(16);
const META_ROW_H = sw(20);

function eventBodyHeight(item, arabic) {
  const rows = [item?.time, item?.location, item?.rsvp].filter((value) => String(value || "").trim()).length;
  const titleH = (arabic ? sf(22) : sf(18)) * 2;
  return sw(8) + titleH + (rows > 0 ? sw(4) + META_ROW_H * rows : 0) + sw(8);
}

function mapEventToCard(notice, lang) {
  return {
    id: String(notice.id),
    title: localizedField(notice, "title") || notice.title || "",
    date: notice.eventDate
      ? formatLongDate(notice.eventDate)
      : notice.eventSchedule ?? formatNoticeRelativeTime(notice),
    time: formatEventTimeRange(notice),
    location: notice.location ?? "",
    rsvp: formatEventRsvpLabel(notice),
    imageUrl: notice.imageUrl,
    notice,
    lang,
  };
}

function EventCard({ item, width, imageH, onPress }) {
  const { i18n } = useTranslation();
  const arabic = String(i18n.language || "").startsWith("ar");
  const metaLines = [
    { icon: "clock", text: item.time },
    { icon: "map-pin", text: item.location },
    { icon: "users", text: item.rsvp },
  ].filter((row) => String(row.text || "").trim());

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
              <Text style={[styles.dateBadgeText, arabic && styles.dateBadgeTextAr]} numberOfLines={1}>
                {item.date}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, arabic && styles.titleAr]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.metaBlock}>
            {metaLines.map(({ icon, text }) => (
              <View key={icon} style={styles.metaRow}>
                {text ? (
                  <>
                    <Feather name={icon} size={sf(12)} color={T.teal} />
                    <Text style={[styles.metaText, arabic && styles.metaTextAr]} numberOfLines={1} ellipsizeMode="tail">
                      {text}
                    </Text>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const frame = useHomeFrame();
  const sessionUser = useSessionUser();

  const events = useMemo(
    () => items.map((notice) => mapEventToCard(notice, i18n.language)),
    [items, i18n.language],
  );

  const layout = useMemo(() => {
    const contentWidth = frame.contentWidth;
    const gap = frame.size(12);
    const arabic = String(i18n.language || "").startsWith("ar");
    const bodyH = events.reduce(
      (max, item) => Math.max(max, eventBodyHeight(item, arabic)),
      eventBodyHeight(null, arabic),
    );
    if (events.length <= 1) {
      const cardWidth = contentWidth;
      return {
        featured: true,
        cardWidth,
        imageH: Math.round(cardWidth * 0.42),
        bodyH,
        snap: contentWidth,
        gap,
      };
    }
    const cardWidth = Math.min(contentWidth, Math.floor(contentWidth * 0.84));
    return {
      featured: false,
      cardWidth,
      imageH: Math.round(cardWidth * 0.42),
      bodyH,
      snap: cardWidth + gap,
      gap,
    };
  }, [frame, events, i18n.language]);

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

  if (!isHomeSectionEnabled(sessionUser, "events")) return null;

  if (!events.length) {
    return (
      <View style={[homeStyles.section, { alignSelf: "center", marginHorizontal: frame.sideInset, width: frame.contentWidth }]}>
        <HomeSectionHeader
          label={t("home.happeningSoon")}
          onPress={() => navigateAppRoute(router, PropertyManagementRoutes.NOTICES)}
        />
        <HomeSectionEmpty
          icon="calendar"
          message={t("home.noEvents")}
          hint={t(homeSectionEmptyHintKey(sessionUser, "noEventsHint"))}
        />
      </View>
    );
  }

  return (
    <View style={[homeStyles.section, { alignSelf: "center", marginHorizontal: frame.sideInset, width: frame.contentWidth }]}>
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
          style={[styles.carousel, { width: frame.contentWidth, height: layout.imageH + layout.bodyH }]}
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
    fontSize: sf(10),
    lineHeight: sf(20),
    color: T.navy,
    includeFontPadding: false,
  },
  dateBadgeTextAr: {
    fontFamily: "NotoSansArabic-SemiBold",
    fontWeight: "normal",
    fontSize: sf(12),
    lineHeight: sf(22),
    letterSpacing: 0,
  },
  body: {
    paddingHorizontal: sw(10),
    paddingTop: sw(8),
    paddingBottom: sw(8),
    overflow: "hidden",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    includeFontPadding: false,
    color: T.navy,
    marginBottom: sw(4),
    width: "100%",
    paddingHorizontal: 1,
  },
  titleAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    fontSize: sf(14),
    lineHeight: sf(22),
    letterSpacing: 0,
    writingDirection: "rtl",
    textAlign: "left",
    includeFontPadding: true,
    paddingStart: sw(2),
    paddingEnd: sw(8),
  },
  metaBlock: {
    alignSelf: "stretch",
  },
  metaRow: {
    height: META_ROW_H,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    overflow: "visible",
  },
  metaText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: T.gray,
    flex: 1,
    includeFontPadding: false,
  },
  metaTextAr: {
    fontFamily: "NotoSansArabic-Regular",
    fontSize: sf(12),
    lineHeight: sf(18),
    letterSpacing: 0,
    includeFontPadding: false,
    writingDirection: "rtl",
  },
});
