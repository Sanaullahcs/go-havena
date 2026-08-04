import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { formatEventTimeRange, formatLongDate, getNoticeDetailRoute } from "../../services/notices-api";
import { getProfileInitial } from "../../utils/profile-display";
import { sw, sf, hp } from "../../utils/responsive";

const CARD_GAP = sw(12);
const PEEK = sw(32);
const CARD_RADIUS = sw(16);

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

function EventCard({ item, width, imageH, onPress }) {
  const initial = getProfileInitial(item.title ?? "E");

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
          {item.imageUrl ? (
            <CrispImage
              source={{ uri: item.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imageInitial}>{initial}</Text>
            </View>
          )}
          {item.date ? (
            <View style={styles.dateBadge}>
              <Feather name="calendar" size={sf(10)} color={T.navy} />
              <Text style={styles.dateBadgeText}>{item.date}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {item.time ? (
            <View style={styles.metaRow}>
              <Feather name="clock" size={sf(11)} color={T.teal} />
              <Text style={styles.metaText}>{item.time}</Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={sf(11)} color={T.teal} />
              <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const events = useMemo(() => items.map(mapEventToCard), [items]);

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - PEEK) / 2);
    const imageH = Math.round(cardWidth * 0.65);
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, imageH, snap };
  }, [screenWidth]);

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
      <View style={homeStyles.section}>
        <HomeSectionHeader label="Happening Soon" onPress={() => router.push("/(tabs)/notices")} />
        <HomeSectionEmpty message="No upcoming events" hint="Community events will appear here." />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader label="Happening Soon" onPress={() => router.push("/(tabs)/notices")} />
      <FlatList
        data={events}
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
        getItemLayout={(_, index) => ({ length: layout.snap, offset: layout.snap * index, index })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingRight: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: CARD_RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
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
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.mint,
  },
  imageInitial: {
    fontFamily: Fonts.bold,
    fontSize: sf(24),
    color: T.navy,
    fontWeight: "700",
  },
  dateBadge: {
    position: "absolute",
    bottom: sw(8),
    left: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "rgba(255,255,255,0.92)",
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
  },
});
