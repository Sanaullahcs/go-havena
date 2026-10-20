import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import NoticeSortChips from "../../../components/notices/sort-chips";
import { useRequireCommunityAdmin } from "../../../hooks/use-require-community-admin";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import {
  fetchNotices,
  formatEventRsvpLabel,
  formatEventTimeRange,
  formatLongDate,
  getNoticeDetailRoute,
  isEventNotice,
} from "../../../services/notices-api";
import { localizedField } from "../../../i18n";

function EventRow({ item, onPress, t }) {
  const title = localizedField(item, "title") || item.title;
  const date = item.eventDate ? formatLongDate(item.eventDate) : null;
  const time = formatEventTimeRange(item);
  const rsvp = formatEventRsvpLabel(item);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={() => onPress(item)}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Feather name="calendar" size={sf(18)} color="#7C3AED" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {date ? <Text style={styles.meta}>{date}{time ? ` · ${time}` : ""}</Text> : null}
          {item.location ? (
            <Text style={styles.meta} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
          {rsvp ? <Text style={styles.rsvp}>{item.isJoined ? `${rsvp} · ${t("notices.youreGoing")}` : rsvp}</Text> : null}
        </View>
        <Feather name="chevron-right" size={sf(18)} color="#94A3B8" />
      </View>
      {item.requiresRsvp ? (
        <Text style={styles.hint}>{t("admin.tapEventToJoin")}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function AdminCommunityEventsScreen() {
  useRequireCommunityAdmin();
  const router = useRouter();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState("relevant");

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setItems([]);
    }
    try {
      const res = await fetchNotices({
        categoryGroup: "events",
        perPage: 50,
        includeExpired: false,
        sort,
      });
      const events = (res.notices ?? []).filter(isEventNotice);
      setItems(events);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sort]);

  const sortRef = useRef(sort);
  useFocusEffect(
    useCallback(() => {
      const sortChanged = sortRef.current !== sort;
      sortRef.current = sort;
      load(!sortChanged);
    }, [load, sort]),
  );

  const openEvent = (notice) => {
    router.push(getNoticeDetailRoute(notice));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("admin.communityEvents")}
        subtitle={t("admin.communityEventsSub")}
        iconOnly
      />
      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#14B8A6" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
          ListHeaderComponent={
            <NoticeSortChips value={sort} onChange={setSort} contentStyle={styles.sortChips} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{t("admin.noPublishedEvents")}</Text>
          }
          renderItem={({ item }) => (
            <EventRow item={item} onPress={openEvent} t={t} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  list: { padding: sw(16), paddingBottom: sw(32), flexGrow: 1 },
  sortChips: { paddingBottom: sw(12) },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    paddingVertical: sw(32),
  },
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(14),
    padding: sw(14),
    marginBottom: sw(10),
    backgroundColor: "#FFFFFF",
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: sw(12) },
  iconWrap: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
    fontWeight: "700",
  },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    marginTop: sw(4),
  },
  rsvp: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#0F766E",
    marginTop: sw(6),
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    marginTop: sw(10),
  },
});
