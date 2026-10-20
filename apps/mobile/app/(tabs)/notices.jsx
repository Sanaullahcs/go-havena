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
import NoticeSortMenu from "../../components/notices/sort-menu";
import NoticeBoardEmpty from "../../components/notices/board-empty";
import BackButton from "../../components/ui/back-button";
import { Fonts } from "../../constants/font";
import {
  fetchNotices,
  formatEventTimeRange,
  formatLongDate,
  formatEventRsvpLabel,
  getNoticeDetailRoute,
  isAlertNotice,
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
import { useTranslation } from "react-i18next";
import { localizedField } from "../../i18n";
import { rnShadow } from "../../utils/shadow";
import { getUser } from "../../services/auth-session";
import { isCommunityAdminRole, isGuestUser, isResidentMode } from "../../services/community-access";
import { useSessionUser } from "../../hooks/use-session-user";
import { isResidentFeatureEnabled } from "../../constants/resident-features";
import { communityUpdatesSubtitle } from "../../utils/community-updates-subtitle";


const BASE_TABS = [
  { id: "all", labelKey: "notices.tabAll" },
  { id: "events", labelKey: "notices.tabEvents", categoryGroup: "events" },
  { id: "yours", labelKey: "notices.tabYours", mineOnly: true, residentOnly: true },
  { id: "alerts", labelKey: "notices.tabAlerts", categoryGroup: "alerts" },
  { id: "notices", labelKey: "notices.tabNotice", categoryGroup: "notices" },
  { id: "saved", labelKey: "notices.tabSaved", savedOnly: true },
];

function reviewStatusMeta(notice, t) {
  const status = notice.reviewStatus ?? "approved";
  if (status === "pending") {
    return {
      bg: "#FEF3C7",
      dot: "#F59E0B",
      color: "#B45309",
      label: t("notices.statusPending"),
    };
  }
  if (status === "rejected") {
    return {
      bg: "#FEF2F2",
      dot: "#EF4444",
      color: "#B91C1C",
      label: t("notices.statusRejected"),
    };
  }
  return {
    bg: "#ECFDF5",
    dot: "#059669",
    color: "#047857",
    label: t("notices.statusApproved"),
  };
}

function contentFeatureKey(notice) {
  if (isEventNotice(notice)) return "events";
  if (isAlertNotice(notice)) return "alerts";
  return "notices";
}

function noticePermissionFeature(tab) {
  if (tab?.categoryGroup === "events" || tab?.mineOnly) return "events";
  if (tab?.categoryGroup === "alerts") return "alerts";
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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const sessionUser = useSessionUser();
  const [selectedTab, setSelectedTab] = useState("all");
  const [savedIds, setSavedIds] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState("relevant");
  const [resultCount, setResultCount] = useState(null);
  const [showYoursTab, setShowYoursTab] = useState(false);
  const { unread: unreadNotifications } = useNotificationUnread();
  const hasLoadedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const listRef = useRef(null);
  const sessionUserRef = useRef(sessionUser);
  sessionUserRef.current = sessionUser;

  const sessionFeaturesSig = useMemo(
    () => JSON.stringify(sessionUser?.resident_features?.features ?? null),
    [sessionUser?.resident_features?.features],
  );

  const tabs = useMemo(
    () =>
      BASE_TABS.filter((tab) => !tab.residentOnly || showYoursTab).filter((tab) => {
        if (tab.categoryGroup) return isResidentFeatureEnabled(sessionUser, tab.categoryGroup);
        return (
          isResidentFeatureEnabled(sessionUser, "notices") ||
          isResidentFeatureEnabled(sessionUser, "events") ||
          isResidentFeatureEnabled(sessionUser, "alerts")
        );
      }),
    [showYoursTab, sessionUser],
  );

  const pageSubtitle = useMemo(
    () => communityUpdatesSubtitle(sessionUser, t, i18n.language),
    [sessionUser, t, i18n.language],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const currentTab = useMemo(
    () => tabs.find((tab) => tab.id === selectedTab) ?? tabs[0],
    [tabs, selectedTab],
  );

  useEffect(() => {
    getUser()
      .then((user) =>
        setShowYoursTab(
          Boolean(
            user &&
              !isGuestUser(user) &&
              (!isCommunityAdminRole(user) || isResidentMode(user)),
          ),
        ),
      )
      .catch(() => setShowYoursTab(false));
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === selectedTab)) {
      setSelectedTab(tabs[0]?.id ?? "all");
    }
  }, [tabs, selectedTab]);

  const load = useCallback(
    async (silent = false) => {
      const seq = ++loadSeqRef.current;
      if (!silent) {
        setLoading(true);
        setNotices([]);
        setResultCount(null);
        setError(null);
      } else {
        setError(null);
      }
      try {
        const feature = noticePermissionFeature(currentTab);
        const blocked = await resolveLoadRestriction(feature);
        if (blocked) {
          if (seq !== loadSeqRef.current) return;
          setNotices([]);
          setResultCount(0);
          setError(blocked);
          return;
        }

        const isSavedTab = currentTab?.savedOnly;
        const isMineTab = currentTab?.mineOnly;
        const apiCategoryGroup =
          currentTab?.categoryGroup && !isSavedTab && !isMineTab ? currentTab.categoryGroup : undefined;
        const apiCategory =
          currentTab?.category && !isSavedTab && !apiCategoryGroup && !isMineTab
            ? currentTab.category
            : undefined;

        const ids = await getSavedNoticeIds();
        setSavedIds(ids);

        const { notices: data, meta } = await fetchNotices({
          categoryGroup: apiCategoryGroup,
          category: apiCategory,
          search: debouncedQuery || undefined,
          perPage: isSavedTab ? 100 : 50,
          includeExpired: true,
          mine: isMineTab,
          sort,
        });

        let items = data;

        if (isSavedTab) {
          const savedSet = new Set(ids);
          items = items.filter((n) => savedSet.has(Number(n.id)));
        }

        items = items.filter((notice) =>
          isResidentFeatureEnabled(sessionUserRef.current, contentFeatureKey(notice)),
        );

        if (seq !== loadSeqRef.current) return;
        const serverTotal = Number(meta?.total);
        const hiddenByFeature = Math.max(0, data.length - items.length);
        setNotices(items);
        setResultCount(
          isSavedTab
            ? items.length
            : Number.isFinite(serverTotal)
              ? Math.max(0, serverTotal - hiddenByFeature)
              : items.length,
        );
      } catch (err) {
        const feature = noticePermissionFeature(currentTab);
        const restricted = await resolveLoadRestriction(feature, err);
        if (seq !== loadSeqRef.current) return;
        if (restricted) {
          setNotices([]);
          setResultCount(0);
          setError(restricted);
          return;
        }
        setError(err);
        if (!silent) {
          setNotices([]);
          setResultCount(0);
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [currentTab, debouncedQuery, sort],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      loadRef.current(hasLoadedRef.current);
      hasLoadedRef.current = true;
    }, []),
  );

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    setNotices([]);
    setLoading(true);
    setError(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    loadRef.current(true);
  }, [selectedTab, debouncedQuery, sort, sessionFeaturesSig]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRef.current(true);
  }, []);

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
      const categoryLabel = t(`categories.${notice.category ?? "general"}`, { defaultValue: notice.categoryLabel || notice.theme?.label || t("notices.notice") });
      const showReviewStatus = selectedTab === "yours" && isEventNotice(notice);
      const reviewPill = showReviewStatus ? reviewStatusMeta(notice, t) : null;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.95}
          onPress={() => openNotice(notice)}
        >
          <View style={styles.cardData}>
            <NoticeCoverThumbnail
              imageUrl={notice.imageUrl}
              notice={notice}
              size={sw(56)}
              borderRadius={sw(10)}
            />

            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardTopChips}>
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryChipText} numberOfLines={1}>
                      {String(categoryLabel).toUpperCase()}
                    </Text>
                  </View>
                  {reviewPill ? (
                    <View style={[styles.reviewPill, { backgroundColor: reviewPill.bg }]}>
                      <View style={[styles.reviewPillDot, { backgroundColor: reviewPill.dot }]} />
                      <Text style={[styles.reviewPillText, { color: reviewPill.color }]} numberOfLines={1}>
                        {reviewPill.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => toggleSaved(notice.id)}
                  style={styles.bookmarkBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSaved ? t("notices.removeFromSaved") : t("notices.saveNotice")}
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

              <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
                {localizedField(notice, "title") || notice.title}
              </Text>
              {(localizedField(notice, "body") || notice.body) ? (
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {localizedField(notice, "body") || notice.body}
                </Text>
              ) : null}

              {(cardDate || rsvpLabel) ? (
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
                        {notice.isJoined ? `${rsvpLabel} · ${t("notices.youreGoing")}` : rsvpLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [openNotice, savedIds, selectedTab, toggleSaved, t],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#1B4F8A" />
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
            defaultTitle={t("notices.couldNotLoad")}
            compact
          />
        );
      }

      const errorState = resolveGuestFeatureError(
        error,
        permissionFeature,
        t("notices.couldNotLoad"),
      );
      return (
        <NoticeBoardEmpty
          variant="error"
          title={errorState.title}
          hint={errorState.message}
          onRetry={onRefresh}
        />
      );
    }

    if (query.trim()) {
      return (
        <NoticeBoardEmpty
          variant="search"
          title={t("notices.emptyTitleSearch", { defaultValue: "No matches found" })}
          hint={t("notices.emptyHintSearch", { defaultValue: "Try a different search term." })}
        />
      );
    }

    const emptyCopy = (() => {
      switch (selectedTab) {
        case "events":
          return {
            variant: "events",
            title: t("notices.emptyTitleEvents", { defaultValue: "No events yet" }),
            hint: t("notices.emptyHintEvents", {
              defaultValue: "Upcoming events from your community will show up here.",
            }),
          };
        case "alerts":
          return {
            variant: "alerts",
            title: t("notices.emptyTitleAlerts", { defaultValue: "No alerts right now" }),
            hint: t("notices.emptyHintAlerts", {
              defaultValue: "Urgent alerts from your community will show up here.",
            }),
          };
        case "notices":
          return {
            variant: "notices",
            title: t("notices.emptyTitleNotices", { defaultValue: "No notices yet" }),
            hint: t("notices.emptyHintNotices", {
              defaultValue: "Community notices will show up here.",
            }),
          };
        case "saved":
          return {
            variant: "saved",
            title: t("notices.emptyTitleSaved", { defaultValue: "Nothing saved yet" }),
            hint: t("notices.emptyHintSaved", {
              defaultValue: "Updates you save will show up here.",
            }),
          };
        case "yours":
          return {
            variant: "yours",
            title: t("notices.emptyTitleYours", { defaultValue: "No events submitted yet" }),
            hint: t("notices.emptyHintYours", {
              defaultValue: "Events you submit will show up here with their review status.",
            }),
          };
        default:
          return {
            variant: "all",
            title: t("notices.emptyTitleAll", { defaultValue: "No updates yet" }),
            hint: t("notices.emptyHintDefault", {
              defaultValue: "Notices, events, and alerts from your community will show up here.",
            }),
          };
      }
    })();

    return (
      <NoticeBoardEmpty
        variant={emptyCopy.variant}
        title={emptyCopy.title}
        hint={emptyCopy.hint}
      />
    );
  }, [loading, query, selectedTab, error, currentTab, onRefresh, t]);

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={styles.fixedHeader}>
        <SafeTop color="#FFFFFF">
          <View style={styles.container}>
            <View style={styles.headingContainer}>
              <View style={styles.headingLeft}>
                <BackButton iconOnly compact />
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
                    {t("notices.communityUpdates")}
                  </Text>
                </View>
              </View>
              {!accessBlocked ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/screens/notification")}
                accessibilityLabel={t("notices.notifications")}
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
              <Text style={styles.subtitle}>{pageSubtitle}</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <SearchInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("notices.searchPlaceholder")}
              />
            </View>
            </>
            ) : null}
          </View>
        </SafeTop>

        {!accessBlocked ? (
        <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={styles.tabsList}
          contentContainerStyle={styles.tabsContainer}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, selectedTab === tab.id && styles.activeTab]}
              onPress={() => {
                if (tab.id === selectedTab) return;
                setSort("relevant");
                setSelectedTab(tab.id);
              }}
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
                numberOfLines={1}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortRow}>
          <Text style={styles.resultCount} numberOfLines={1}>
            {resultCount == null
              ? ""
              : t(resultCount === 1 ? "notices.resultCountOne" : "notices.resultCount", {
                  count: resultCount,
                })}
          </Text>
          <NoticeSortMenu value={sort} onChange={setSort} />
        </View>
        </>
        ) : null}
      </View>

      {accessBlocked ? (
        <GuestFeatureErrorState
          error={error}
          fallbackFeature={noticePermissionFeature(currentTab)}
          defaultTitle={t("notices.couldNotLoad")}
          onRetry={onRefresh}
        />
      ) : (
      <FlatList
        ref={listRef}
        style={styles.cardList}
        data={loading ? [] : notices}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNoticeCard}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.cardContainer,
          notices.length === 0 && styles.cardContainerEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B4F8A" />
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
    paddingBottom: sw(4),
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
    marginEnd: sw(2),
    ...rnShadow({ color: "#000", offset: { width: 0, height: 4 }, opacity: 0.1, radius: 8 }),
    elevation: 6,
  },
  tabsContainer: {
    paddingTop: sw(10),
    paddingBottom: sw(6),
    paddingHorizontal: sw(20),
    gap: sw(8),
    alignItems: "center",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(12),
    paddingHorizontal: sw(20),
    paddingTop: sw(2),
    paddingBottom: sw(8),
  },
  resultCount: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#6A7282",
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  activeTab: {
    backgroundColor: "#1B4F8A",
  },
  cardList: {
    flex: 1,
    minHeight: 0,
  },
  cardContainer: {
    paddingHorizontal: sw(20),
    paddingTop: sw(4),
    paddingBottom: sw(20),
  },
  cardContainerEmpty: {
    flexGrow: 1,
    justifyContent: "center",
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
    gap: sw(12),
  },
  cardContent: {
    flex: 1,
    flexDirection: "column",
    gap: sw(4),
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  cardTopChips: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(6),
  },
  categoryChip: {
    maxWidth: "100%",
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
  },
  categoryChipText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    fontWeight: "700",
    letterSpacing: 0.4,
    color: "#1B4F8A",
  },
  reviewPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(7),
    paddingVertical: sw(3),
    borderRadius: 999,
    maxWidth: "100%",
  },
  reviewPillDot: {
    width: sw(5),
    height: sw(5),
    borderRadius: sw(3),
  },
  reviewPillText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(9),
    lineHeight: sf(12),
    fontWeight: "600",
    flexShrink: 1,
  },
  cardTitle: {
    fontFamily: Fonts.semibold,
    fontWeight: "700",
    fontSize: sf(14.5),
    lineHeight: sf(19),
    color: "#1B4F8A",
    flexShrink: 1,
    width: "100%",
  },
  cardDescription: {
    fontFamily: Fonts.regular,
    fontWeight: "400",
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#4A5565",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: sw(6),
    marginTop: sw(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(243, 244, 246, 1)",
  },
  cardFooterLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bookmarkBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: sw(2),
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
    color: "#1B4F8A",
    fontWeight: "600",
  },
  cardRsvpFull: {
    color: "#DC2626",
  },
  cardRsvpJoined: {
    color: "#059669",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(48),
  },
});
