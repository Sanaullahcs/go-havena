import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import SectionCarousel from "./section-carousel";
import HomeSectionCard from "./home-section-card";
import HomeSectionEmpty from "./home-section-empty";
import { formatEventTimeRange, formatLongDate, getNoticeDetailRoute } from "../../services/notices-api";
import { getProfileInitial } from "../../utils/profile-display";
import { sw, sf, hp } from "../../utils/responsive";

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

const THUMB_SIZE = sw(44);

function EventCard({ item, width, onPress }) {
  return (
    <HomeSectionCard
      style={{ width }}
      contentStyle={styles.cardContent}
      onPress={onPress}
    >
      {item.imageUrl ? (
        <View style={styles.thumbWrap}>
          <CrispImage source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
        </View>
      ) : (
        <View style={styles.thumbWrap}>
          <Text style={styles.thumbInitial}>{getProfileInitial(item.title ?? "Event")}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        {(item.date || item.time) ? (
          <Text style={styles.meta} numberOfLines={1}>
            {[item.date, item.time].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {item.location ? (
          <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
        ) : null}
      </View>
    </HomeSectionCard>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => screenWidth - Home.gutter * 2, [screenWidth]);

  const events = useMemo(() => items.map(mapEventToCard), [items]);

  const openEvent = useCallback(
    (item) => {
      router.push(getNoticeDetailRoute(item.notice ?? { id: item.id, category: "event" }));
    },
    [router],
  );

  if (!events.length) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Happening Soon"
          onPress={() => router.push("/(tabs)/notices")}
        />
        <HomeSectionEmpty
          message="No upcoming events"
          hint="Community events will appear here."
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label="Happening Soon"
        onPress={() => router.push("/(tabs)/notices")}
      />
      <SectionCarousel
        data={events}
        screenWidth={screenWidth}
        cardWidth={cardWidth}
        fullPageSnap
        keyExtractor={(item) => item.id}
        renderItem={({ item, width }) => (
          <EventCard
            item={item}
            width={width}
            onPress={() => openEvent(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    flexDirection: "row",
    padding: sw(10),
    alignItems: "center",
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: sw(10),
    overflow: "hidden",
    backgroundColor: "rgba(0, 82, 223, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: "100%", height: "100%" },
  thumbInitial: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(20),
    color: "#0052DF",
    fontWeight: "700",
  },
  body: { flex: 1, marginLeft: sw(10) },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: "#101828",
    fontWeight: "700",
  },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#99A1AF",
    marginTop: hp(0.2),
  },
  location: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#4A5565",
    marginTop: hp(0.1),
  },
});
