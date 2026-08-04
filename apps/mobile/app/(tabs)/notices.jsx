import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  FlatList,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import SearchInput from "../../components/ui/search-input";
import BackButton from "../../components/ui/back-button";
import { Fonts } from "../../constants/font";
import {
  fetchNotices,
  formatEventTimeRange,
  formatLongDate,
  formatEventRsvpLabel,
  getNoticeDetailRoute,
  isEventNotice,
} from "../../services/notices-api";
import { getSavedNoticeIds, toggleSavedNotice } from "../../services/saved-notices";
import { useNotificationUnread } from "../../hooks/use-notification-unread";
import NotificationCountBadge from "../../components/ui/notification-count-badge";
import SafeTop from "../../components/layout/safe-top";
import { sf, sw } from "../../utils/responsive";
import NoticeCoverThumbnail from "../../components/notices/notice-cover-thumbnail";
import { resolveGuestFeatureError, isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";
import GuestFeatureErrorState from "../../components/guest/guest-permission-denied-state";
import { resolveLoadRestriction } from "../../utils/account-access-sync";

const TABS = [
  { id: "all", label: "All" },
  { id: "events", label: "Events", categoryGroup: "events" },
  { id: "alerts", label: "Alerts", categoryGroup: "alerts" },
  { id: "notices", label: "Notice", categoryGroup: "notices" },
  { id: "saved", label: "Saved", savedOnly: true },
];

function noticePermissionFeature(tab) {
  if (tab?.categoryGroup === "events") return "events";
  return "notices";
}

function formatCardDate(notice) {
  const datePart = notice.eventDate ? formatLongDate(notice.eventDate) : "";
  const timePart = formatEventTimeRange(notice);
  if (datePart && timePart) return `${datePart} • ${timePart}`;
  if (datePart) return datePart;
  if (timePart) return timePart;
  return "";
}

export default function Notifications() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState("all");
  const [savedIds, setSavedIds] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { unread: unreadNotifications } = useNotificationUnread();
  const hasLoadedRef = useRef(false);
  const listRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const currentTab = TABS.find((t) => t.id === selectedTab);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const feature = noticePermissionFeature(currentTab);
        const blocked = await resolveLoadRestriction(feature);
        if (blocked) {
          setNotices([]);
          setError(blocked);
          return;
        }

        const isSavedTab = currentTab?.savedOnly;
        const apiCategoryGroup =
          currentTab?.categoryGroup && !isSavedTab ? currentTab.categoryGroup : undefined;
        const apiCategory =
          currentTab?.category && !isSavedTab && !apiCategoryGroup
            ? currentTab.category
            : undefined;

        const ids = await getSavedNoticeIds();
        setSavedIds(ids);

        const { notices: data } = await fetchNotices({
          categoryGroup: apiCategoryGroup,
          category: apiCategory,
          search: debouncedQuery || undefined,
          perPage: isSavedTab ? 100 : 50,
        });

        let items = data;

        if (isSavedTab) {
          const savedSet = new Set(ids);
          items = items.filter((n) => savedSet.has(Number(n.id)));
        }

        setNotices(items);
      } catch (err) {
        const feature = noticePermissionFeature(currentTab);
        const restricted = await resolveLoadRestriction(feature, err);
        if (restricted) {
          setNotices([]);
          setError(restricted);
          return;
        }
        setError(err);
        if (!silent) setNotices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentTab, debouncedQuery],
  );

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedRef.current);
      hasLoadedRef.current = true;
    }, [load]),
  );

  useEffect(() => {
    if (hasLoadedRef.current) {
      load(true);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [selectedTab, debouncedQuery, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const toggleSaved = useCallback(async (id) => {
    try {
      const { ids } = await toggleSavedNotice(id);
      setSavedIds(ids);
      if (selectedTab === "saved") {
        setNotices((prev) => prev.filter((notice) => ids.includes(Number(notice.id))));
      }
    } catch {
      // ignore
    }
  }, [selectedTab]);

  const openNotice = useCallback(
    (notice) => {
      router.push(getNoticeDetailRoute(notice));
    },
    [router],
  );

  const renderNoticeCard = useCallback(
    ({ item: notice }) => {
      const isSaved = savedIds.includes(Number(notice.id));
      const rsvpLabel = isEventNotice(notice) ? formatEventRsvpLabel(notice) : null;
      const cardDate = formatCardDate(notice);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.95}
          onPress={() => openNotice(notice)}
        >
          <View style={styles.cardData}>
            <NoticeCoverThumbnail
              imageUrl={notice.imageUrl}
              title={notice.title}
              size={sw(52)}
              borderRadius={sw(10)}
            />

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {notice.title}
              </Text>
              <Text style={styles.cardDescription} numberOfLines={2}>
                {notice.body}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.cardFooterLeft}>
                  {cardDate ? (
                    <Text style={styles.cardDate}>{cardDate}</Text>
                  ) : null}
                  {rsvpLabel ? (
                    <Text
                      style={[
                        styles.cardRsvp,
                        notice.isFull && styles.cardRsvpFull,
                        notice.isJoined && styles.cardRsvpJoined,
                      ]}
                      numberOfLines={1}
                    >
                      {notice.isJoined ? `${rsvpLabel} · You're going` : rsvpLabel}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={() => toggleSaved(notice.id)}
                  style={styles.bookmarkBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSaved ? "Remove from saved" : "Save notice"}
                >
                  <Image
                    source={
                      isSaved
                        ? require("../../assets/images/bold-bookmark.png")
                        : require("../../assets/images/bokmark-icon.png")
                    }
                    style={{ width: sw(14), height: sw(14) }}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [openNotice, savedIds, toggleSaved],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
          <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#0A2A43" />
        </View>
      );
    }

    if (error) {
      const permissionFeature = noticePermissionFeature(currentTab);
      if (isFeatureAccessBlockedError(error)) {
        return (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature={permissionFeature}
            defaultTitle="Could not load notices"
            compact
          />
        );
      }

      const errorState = resolveGuestFeatureError(
        error,
        permissionFeature,
        "Could not load notices",
      );
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{errorState.title}</Text>
          <Text style={styles.emptyHint}>{errorState.message}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>
          {selectedTab === "saved" ? "No saved notices yet" : "No notices found"}
        </Text>
        <Text style={styles.emptyHint}>
          {selectedTab === "saved"
            ? "Tap the bookmark on any notice to save it here."
            : query.trim()
              ? "Try a different search or category."
              : "New community announcements will appear here."}
        </Text>
      </View>
    );
  }, [loading, query, selectedTab, error, currentTab]);

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={styles.fixedHeader}>
        <SafeTop color="#FFFFFF">
          <View style={styles.container}>
            <View style={styles.headingContainer}>
              <View style={styles.headingLeft}>
                <BackButton iconOnly compact onPress={() => router.back()} />
                <View style={styles.headingBase}>
                  <Text
                    style={{
                      fontSize: sf(17),
                      fontWeight: 700,
                      color: "rgba(0, 0, 0, 1)",
                      lineHeight: sf(22),
                      fontFamily: Fonts.bold,
                    }}
                  >
                    Community Updates
                  </Text>
                </View>
              </View>
              {!accessBlocked ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/screens/notification")}
                accessibilityLabel="Notifications"
              >
                <View style={styles.bellIconContainer}>
                  <Image
                    source={require("../../assets/images/main-bell-icon.png")}
                    style={{
                      width: sw(20),
                      height: sw(20),
                      tintColor: "rgba(0, 0, 0, 1)",
                    }}
                    contentFit="contain"
                  />
                  <NotificationCountBadge count={unreadNotifications} size="sm" />
                </View>
              </TouchableOpacity>
              ) : null}
            </View>

            {!accessBlocked ? (
            <>
            <View>
              <Text style={styles.subtitle}>Notices, events & alerts</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <SearchInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search notices..."
              />
            </View>
            </>
            ) : null}
          </View>
        </SafeTop>

        {!accessBlocked ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={styles.tabsList}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, selectedTab === tab.id && styles.activeTab]}
              onPress={() => setSelectedTab(tab.id)}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      selectedTab === tab.id
                        ? "rgba(255, 255, 255, 1)"
                        : "rgba(54, 65, 83, 1)",
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        ) : null}
      </View>

      {accessBlocked ? (
        <GuestFeatureErrorState
          error={error}
          fallbackFeature={noticePermissionFeature(currentTab)}
          defaultTitle="Could not load notices"
          onRetry={onRefresh}
        />
      ) : (
      <FlatList
        ref={listRef}
        style={styles.cardList}
        data={notices}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNoticeCard}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.cardContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A2A43" />
        }
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  fixedHeader: {
    flexShrink: 0,
  },
  tabsList: {
    flexGrow: 0,
    flexShrink: 0,
  },
  container: {
    paddingHorizontal: sw(20),
    paddingTop: sw(16),
    paddingBottom: sw(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243, 244, 246, 1)",
    flexDirection: "column",
    gap: 2,
  },
  headingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "visible",
  },
  headingLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  headingBase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subtitle: {
    fontSize: sf(12),
    lineHeight: sf(17),
    fontWeight: "400",
    fontFamily: Fonts.regular,
    color: "rgba(106, 114, 130, 1)",
  },
  tabLabel: {
    fontSize: sf(12),
    lineHeight: sf(17),
    fontWeight: "600",
    fontFamily: Fonts.semibold,
  },
  bellIconContainer: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "rgba(255, 255, 255, 1)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "visible",
    marginTop: sw(2),
    marginRight: sw(2),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  tabsContainer: {
    paddingVertical: 12,
    paddingHorizontal: sw(20),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243, 244, 246, 1)",
    gap: 8,
    alignItems: "center",
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  activeTab: {
    backgroundColor: "#0A2A43",
  },
  cardList: {
    flex: 1,
    minHeight: 0,
  },
  cardContainer: {
    paddingHorizontal: sw(20),
    paddingTop: sw(14),
    paddingBottom: sw(20),
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 1)",
    backgroundColor: "#FFFFFF",
    padding: sw(12),
    borderRadius: 14,
    marginBottom: 10,
  },
  cardData: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardContent: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: Fonts.semibold,
    fontWeight: "700",
    fontSize: sf(14),
    lineHeight: sf(18),
    color: "#101828",
  },
  cardDescription: {
    fontFamily: Fonts.regular,
    fontWeight: "400",
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#4A5565",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(243, 244, 246, 1)",
  },
  cardFooterLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 8,
  },
  bookmarkBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardDate: {
    fontWeight: 500,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontFamily: Fonts.regular,
    color: "rgba(106, 114, 130, 1)",
  },
  cardRsvp: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: "#0A2A43",
    fontWeight: "600",
  },
  cardRsvpFull: {
    color: "#DC2626",
  },
  cardRsvpJoined: {
    color: "#059669",
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#334155",
    fontWeight: "700",
  },
  emptyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    textAlign: "center",
  },
});
