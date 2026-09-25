import { Text, View, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { NoticeCoverMedia } from "../notices/notice-cover-thumbnail";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { formatEventTimeRange, getNoticeDetailRoute } from "../../services/notices-api";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { navigateAppRoute } from "../../utils/app-navigation";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { localizedField } from "../../i18n";
import { getLocaleForLang } from "../../hooks/use-app-locale";
import { arrowForward } from "../../utils/rtl";

const PEEK = sw(28);
const CARD_RADIUS = sw(20);

function eventDateParts(dateStr, lang) {
  if (!dateStr) return null;
  try {
    const date = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const locale = getLocaleForLang(lang);
    return {
      month: date.toLocaleDateString(locale, { month: "short" }).replace(".", "").toUpperCase(),
      day: String(date.getDate()),
    };
  } catch {
    return null;
  }
}

function mapEventToCard(notice, lang) {
  return {
    id: String(notice.id),
    title: localizedField(notice, "title") || notice.title || "",
    time: formatEventTimeRange(notice),
    location: notice.location ?? "",
    imageUrl: notice.imageUrl,
    dateParts: eventDateParts(notice.eventDate ?? notice.event_date, lang),
    notice,
  };
}

function EventCard({ item, width, height, onPress, t }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width, height },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardInner, { height }]}>
        <NoticeCoverMedia
          fill
          imageUrl={item.imageUrl}
          notice={item.notice}
          kind="event"
        />
        <LinearGradient
          colors={["transparent", "rgba(10,28,48,0.28)", "rgba(10,28,48,0.92)"]}
          locations={[0.28, 0.55, 1]}
          style={styles.overlay}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {t("categories.event").toUpperCase()}
            </Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.time ? (
              <View style={styles.metaRow}>
                <Feather name="clock" size={sf(12)} color="rgba(255,255,255,0.86)" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.time}
                </Text>
              </View>
            ) : null}
            {item.location ? (
              <View style={styles.metaRow}>
                <Feather name="map-pin" size={sf(12)} color="rgba(255,255,255,0.86)" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            ) : null}
            <View style={styles.ctaBtn}>
              <Text style={styles.ctaBtnText}>{t("events.joinEvent")}</Text>
              <Feather name={arrowForward()} size={sf(12)} color={T.navy} />
            </View>
          </View>
        </LinearGradient>
        {item.dateParts ? (
          <View style={styles.dateStack}>
            <Text style={styles.dateMonth}>{item.dateParts.month}</Text>
            <Text style={styles.dateDay}>{item.dateParts.day}</Text>
          </View>
        ) : null}
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
      return {
        featured: true,
        cardWidth: contentWidth,
        cardHeight: Math.round(contentWidth * 0.68),
        snap: contentWidth,
        gap,
      };
    }
    const cardWidth = Math.min(contentWidth, Math.floor(contentWidth * 0.84));
    return {
      featured: false,
      cardWidth,
      cardHeight: Math.round(cardWidth * 0.68),
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
      <EventCard
        item={item}
        width={layout.cardWidth}
        height={layout.cardHeight}
        onPress={() => openEvent(item)}
        t={t}
      />
    ),
    [layout.cardWidth, layout.cardHeight, openEvent, t],
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
          height={layout.cardHeight}
          onPress={() => openEvent(events[0])}
          t={t}
        />
      ) : (
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
          backgroundColor: T.navy,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 6 }, opacity: 0.16, radius: 16 }),
          borderCurve: "continuous",
        }
      : { elevation: 4 }),
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: T.navy,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: sw(16),
    paddingBottom: sw(14),
    paddingTop: sw(16),
  },
  badge: {
    position: "absolute",
    top: sw(12),
    start: sw(12),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    backgroundColor: T.teal,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    fontWeight: "700",
    letterSpacing: 0.6,
    color: T.navy,
    textTransform: "uppercase",
    writingDirection: "auto",
  },
  dateStack: {
    position: "absolute",
    top: sw(12),
    end: sw(12),
    minWidth: sw(48),
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: sw(12),
    paddingHorizontal: sw(8),
    paddingTop: sw(6),
    paddingBottom: sw(5),
  },
  dateMonth: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(11),
    letterSpacing: 0.7,
    color: T.teal,
    fontWeight: "700",
  },
  dateDay: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(22),
    color: T.navy,
    fontWeight: "700",
  },
  copy: {
    gap: sw(5),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(25),
    color: "#FFFFFF",
    fontWeight: "700",
    writingDirection: "auto",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  metaText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "rgba(255,255,255,0.86)",
    flex: 1,
    writingDirection: "auto",
  },
  ctaBtn: {
    marginTop: sw(6),
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: T.teal,
    paddingHorizontal: sw(14),
    paddingVertical: sw(7),
    borderRadius: 999,
  },
  ctaBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11.5),
    color: T.navy,
    fontWeight: "700",
    writingDirection: "auto",
  },
});
