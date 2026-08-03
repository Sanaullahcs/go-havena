import { Text, View, StyleSheet, Pressable } from "react-native";
import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import CrispImage from "../ui/crisp-image";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import {
  formatEventTimeRange,
  formatLongDate,
  getNoticeDetailRoute,
} from "../../services/notices-api";
import { getProfileInitial } from "../../utils/profile-display";
import { sw, sf } from "../../utils/responsive";

function EventCard({ item, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.media}>
        {item.imageUrl ? (
          <CrispImage source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={[styles.image, styles.fallback]}>
            <Text style={styles.fallbackText}>{getProfileInitial(item.title)}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Feather name="bookmark" size={sf(16)} color={HomeTheme.seaGreen} />
        </View>
        {item.date ? (
          <View style={styles.metaRow}>
            <Feather name="calendar" size={sf(12)} color={HomeTheme.mediumGray} />
            <Text style={styles.meta} numberOfLines={1}>
              {item.date}
            </Text>
          </View>
        ) : null}
        {item.time ? (
          <View style={styles.metaRow}>
            <Feather name="clock" size={sf(12)} color={HomeTheme.mediumGray} />
            <Text style={styles.meta} numberOfLines={1}>
              {item.time}
            </Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={sf(12)} color={HomeTheme.mediumGray} />
            <Text style={styles.meta} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        ) : null}
        {item.goingLabel ? (
          <View style={styles.goingPill}>
            <Feather name="users" size={sf(11)} color={HomeTheme.freshGreen} />
            <Text style={styles.goingText}>{item.goingLabel}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function HappeningSoon({ items = [] }) {
  const router = useRouter();

  const events = useMemo(
    () =>
      (items ?? []).slice(0, 3).map((notice) => ({
        id: String(notice.id),
        title: notice.title ?? "",
        date: notice.eventDate
          ? formatLongDate(notice.eventDate)
          : notice.eventSchedule ?? notice.timeLabel ?? "",
        time: formatEventTimeRange(notice),
        location: notice.location ?? "",
        imageUrl: notice.imageUrl,
        goingLabel:
          notice.rsvp_count || notice.attendees_count
            ? `${notice.rsvp_count || notice.attendees_count} Going`
            : null,
        notice,
      })),
    [items],
  );

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
          label="Upcoming Events"
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
        label="Upcoming Events"
        onPress={() => router.push("/(tabs)/notices")}
      />
      <View style={styles.list}>
        {events.map((item) => (
          <EventCard
            key={item.id}
            item={item}
            onPress={() => openEvent(item)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Home.gap },
  card: {
    flexDirection: "row",
    gap: sw(12),
    padding: sw(12),
    borderRadius: Home.radius,
    backgroundColor: HomeTheme.cardBg,
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
  },
  cardPressed: {
    borderColor: "rgba(0, 217, 184, 0.4)",
    backgroundColor: "#F7FCFC",
  },
  media: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(14),
    overflow: "hidden",
    backgroundColor: "#E8F8F6",
    flexShrink: 0,
  },
  image: { width: "100%", height: "100%" },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: HomeTheme.seaGreen,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    marginBottom: sw(6),
  },
  title: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: HomeTheme.darkText,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginBottom: sw(3),
  },
  meta: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: HomeTheme.mediumGray,
  },
  goingPill: {
    alignSelf: "flex-start",
    marginTop: sw(6),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    backgroundColor: "rgba(0, 201, 136, 0.12)",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  goingText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: HomeTheme.freshGreen,
    fontWeight: "600",
  },
});
