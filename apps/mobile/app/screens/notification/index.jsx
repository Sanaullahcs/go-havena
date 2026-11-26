import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Fonts } from "../../../constants/font";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useFocusEffect, useRouter } from "expo-router";
import ScreenHeader from "../../../components/layout/screen-header";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  ensureNotificationCommunityContext,
  resolveNotificationRoute,
  sortNotifications,
} from "../../../services/notifications-api";
import { mergeNotifications, syncLatestNotifications } from "../../../utils/notification-pagination";
import { subscribeNotificationRefresh } from "../../../services/notification-events";
import { useApiAction } from "../../../hooks/use-api-action";
import { sw, sf, SCREEN_WIDTH } from "../../../utils/responsive";
import { previewNotificationText } from "../../../utils/notification-preview";

const ICON_SIZE = sw(36);
const UNREAD_DOT = sw(8);
const PAGE_SIZE = 15;
const LIVE_REFRESH_MS = 20000;
const TITLE_LINE_H = sf(18);
const DESC_FONT = sf(12);
const DESC_LINE_H = sf(18);
const DESC_LINES = 3;
const TIME_LINE_H = sf(14);

function fallbackDescriptionWidth() {
  return Math.max(
    80,
    SCREEN_WIDTH - sw(16) * 2 - sw(14) * 2 - ICON_SIZE - sw(12) - UNREAD_DOT - sw(8),
  );
}

function textIsArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function NotificationRow({ item, onPress }) {
  const { i18n } = useTranslation();
  const arabicUi = String(i18n.language || "").startsWith("ar");
  const titleArabic = textIsArabic(item.title);
  const [bodyWidth, setBodyWidth] = useState(0);
  const description = previewNotificationText(item.description, {
    width: bodyWidth || fallbackDescriptionWidth(),
    fontSize: DESC_FONT,
    lines: DESC_LINES,
  });

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(item)}>
      <View style={[styles.notificationItem, item.read && styles.notificationItemRead]}>
        <View style={styles.itemRow}>
          <View>
            <Image source={item.icon} style={styles.itemIcon} />
          </View>
          <View
            style={styles.itemBody}
            onLayout={(event) => {
              if (bodyWidth > 0) return;
              const next = Math.floor(event.nativeEvent.layout.width);
              if (next > 0) setBodyWidth(next);
            }}
          >
            <Text
              style={[
                styles.notificationTitle,
                titleArabic ? styles.notificationTitleAr : arabicUi && styles.notificationTitleEn,
              ]}
            >
              {item.title}
            </Text>
            {description ? (
              <Text
                style={[
                  styles.notificationDescription,
                  textIsArabic(description) ? styles.notificationDescriptionAr : arabicUi && styles.notificationTextEn,
                ]}
                numberOfLines={DESC_LINES}
                ellipsizeMode="tail"
              >
                {description}
              </Text>
            ) : null}
            <Text style={styles.notificationTime} numberOfLines={1} ellipsizeMode="tail">
              {item.time}
            </Text>
          </View>
        </View>
        {!item.read ? (
          <View>
            <Image
              source={require("../../../assets/images/notification-dot.png")}
              style={styles.unreadDot}
            />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function Notifications() {
  const router = useRouter();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const loadingMoreRef = useRef(false);
  const silentInFlightRef = useRef(false);
  const silentQueuedRef = useRef(false);
  const pageRef = useRef(1);
  const hasLoadedRef = useRef(false);
  const onEndReachedGateRef = useRef(true);
  const [showFooterLoader, setShowFooterLoader] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { runAction, showFailure, dialog } = useApiAction();

  const loadPage = useCallback(async (pageNum, { append = false, silent = false, merge = false } = {}) => {
    if (silent && !append) {
      if (silentInFlightRef.current) {
        silentQueuedRef.current = true;
        return;
      }
      silentInFlightRef.current = true;
    }
    if (!silent && !append) setLoading(true);
    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }

    try {
      const { notifications, unread: unreadCount, meta } = await fetchNotifications({
        page: pageNum,
        perPage: PAGE_SIZE,
      });

      setLoadError(false);
      setItems((prev) => {
        if (append) return mergeNotifications(prev, notifications);
        if (merge) return syncLatestNotifications(prev, notifications);
        return notifications;
      });
      setUnread(unreadCount);
      if (!merge) {
        pageRef.current = meta.currentPage;
        setHasMore(meta.currentPage < meta.lastPage);
      }
      setTotal(meta.total);
    } catch {
      if (!append && !silent) {
        setLoadError(true);
        setHasMore(false);
        setItems([]);
        setTotal(0);
        pageRef.current = 1;
      }
    } finally {
      if (silent && !append) {
        silentInFlightRef.current = false;
        if (silentQueuedRef.current) {
          silentQueuedRef.current = false;
          loadPage(1, { silent: true, merge: true });
        }
      }
      if (!silent && !append) setLoading(false);
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        loadPage(1);
      } else {
        loadPage(1, { silent: true, merge: true });
      }

      const timer = setInterval(() => {
        if (active) loadPage(1, { silent: true, merge: true });
      }, LIVE_REFRESH_MS);
      const unsubscribe = subscribeNotificationRefresh(() => {
        if (active) loadPage(1, { silent: true, merge: true });
      });

      return () => {
        active = false;
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadPage]),
  );

  useEffect(() => {
    if (!loadingMore) {
      setShowFooterLoader(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowFooterLoader(true), 350);
    return () => clearTimeout(timer);
  }, [loadingMore]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    pageRef.current = 1;
    setHasMore(true);
    loadPage(1, { silent: true });
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || loadingMoreRef.current || !hasMore) return;
    if (items.length < PAGE_SIZE) return;
    loadPage(pageRef.current + 1, { append: true, silent: true });
  }, [hasMore, items.length, loadPage, loading, refreshing]);

  const handleMomentumScrollBegin = useCallback(() => {
    onEndReachedGateRef.current = false;
  }, []);

  const handleEndReached = useCallback(() => {
    if (onEndReachedGateRef.current) return;
    onEndReachedGateRef.current = true;
    loadMore();
  }, [loadMore]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll || unread === 0) return;

    setMarkingAll(true);
    try {
      await runAction({
        action: () => markAllNotificationsRead(),
        successTitle: t("notifications.allCaughtUpTitle"),
        successMessage: t("notifications.allMarkedRead"),
        errorTitle: t("notifications.couldNotMarkAllRead"),
        onSuccess: () => {
          setItems((prev) => sortNotifications(prev.map((item) => ({ ...item, read: true }))));
          setUnread(0);
        },
      });
    } catch {
      // runAction already showed the error dialog
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, unread, runAction, t]);

  const handlePressItem = useCallback(
    async (item) => {
      if (!item.read) {
        setItems((prev) =>
          sortNotifications(
            prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
          ),
        );
        setUnread((count) => Math.max(0, count - 1));

        try {
          await markNotificationRead(item.id);
        } catch (err) {
          await showFailure(t("notifications.couldNotUpdateNotification"), err);
        }
      }

      const route = resolveNotificationRoute(item);
      if (route?.pathname) {
        await ensureNotificationCommunityContext(item);
        router.push(route);
        return;
      }

      await dialog.showDialog({
        type: "info",
        title: t("notifications.unableToOpen"),
        message: t("notifications.noRelatedScreen"),
        actions: [{ key: "ok", label: t("common.ok"), variant: "primary" }],
      });
    },
    [dialog, router, showFailure, t],
  );

  const unreadLabel =
    unread === 0 ? t("notifications.allCaughtUp") : t("notifications.unreadCount", { count: unread });

  const renderFooter = useCallback(() => {
    if (showFooterLoader) {
      return (
        <View style={styles.footerWrap}>
          <ActivityIndicator size="small" color="#0EA5E9" />
        </View>
      );
    }

    if (items.length > 0 && !hasMore) {
      return (
        <View style={styles.footerWrap}>
          <Text style={styles.footerText}>
            {total > 0 ? t("notifications.showingAll", { count: total }) : t("notifications.allCaughtUp")}
          </Text>
        </View>
      );
    }

    return <View style={styles.footerSpacer} />;
  }, [hasMore, items.length, showFooterLoader, total, t]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#0EA5E9" />
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, styles.emptyTextInline]}>{t("notifications.couldNotLoad")}</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => loadPage(1)}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>{t("common.tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return <Text style={styles.emptyText}>{t("notifications.noNotificationsYet")}</Text>;
  }, [loadError, loadPage, loading, t]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("notifications.title")}
        subtitle={unreadLabel}
        iconOnly
        compact
        right={
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleMarkAllRead}
            disabled={markingAll || unread === 0}
          >
            <Text style={[styles.markAllRead, unread === 0 && styles.markAllReadDisabled]}>
              {t("notifications.markAllRead")}
            </Text>
          </TouchableOpacity>
        }
      />

      <View
        style={styles.gradient}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotificationRow item={item} onPress={handlePressItem} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.25}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  gradient: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: sw(16),
    paddingBottom: sw(24),
  },
  markAllRead: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: "rgba(14, 165, 233, 1)",
  },
  markAllReadDisabled: {
    color: "rgba(148, 163, 184, 1)",
  },
  loadingWrap: {
    paddingVertical: sw(24),
    alignItems: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: sw(24),
    gap: sw(12),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
    paddingVertical: sw(24),
  },
  emptyTextInline: {
    paddingVertical: 0,
  },
  retryBtn: {
    paddingHorizontal: sw(16),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    backgroundColor: "rgba(14, 165, 233, 0.12)",
  },
  retryText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "rgba(14, 165, 233, 1)",
    fontWeight: "700",
  },
  footerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: sw(8),
    paddingBottom: sw(4),
    gap: sw(8),
  },
  footerSpacer: {
    height: sw(8),
  },
  footerText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
  },
  notificationItem: {
    borderWidth: 1.5,
    borderColor: "rgba(20, 184, 166, 0.6)",
    borderRadius: sw(14),
    padding: sw(14),
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: sw(10),
    minHeight: ICON_SIZE + sw(4),
  },
  notificationItemRead: {
    borderColor: "rgba(148, 163, 184, 1)",
  },
  itemRow: {
    flexDirection: "row",
    gap: sw(12),
    flex: 1,
  },
  itemIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  unreadDot: {
    width: UNREAD_DOT,
    height: UNREAD_DOT,
  },
  notificationTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(20),
    color: "rgba(15, 23, 42, 1)",
    flexShrink: 1,
    includeFontPadding: true,
  },
  notificationTitleAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    fontSize: sf(14),
    lineHeight: sf(24),
    letterSpacing: 0,
    writingDirection: "rtl",
    textAlign: "left",
    includeFontPadding: true,
    paddingStart: sw(2),
    paddingEnd: sw(8),
  },
  notificationTitleEn: {
    fontFamily: Fonts.bold,
    fontWeight: "normal",
    letterSpacing: 0,
    writingDirection: "ltr",
    textAlign: "left",
    includeFontPadding: true,
  },
  notificationDescriptionAr: {
    fontFamily: "NotoSansArabic-Regular",
    fontWeight: "normal",
    letterSpacing: 0,
    writingDirection: "rtl",
    textAlign: "left",
    includeFontPadding: true,
    lineHeight: sf(22),
    paddingEnd: sw(6),
  },
  notificationTextEn: {
    fontFamily: Fonts.regular,
    fontWeight: "normal",
    letterSpacing: 0,
    writingDirection: "ltr",
    textAlign: "left",
    includeFontPadding: true,
  },
  notificationDescription: {
    fontFamily: Fonts.medium,
    fontSize: DESC_FONT,
    lineHeight: DESC_LINE_H,
    maxHeight: DESC_LINE_H * DESC_LINES,
    color: "rgba(54, 65, 83, 1)",
    fontWeight: "500",
    flexShrink: 1,
    marginTop: sw(2),
    overflow: "hidden",
  },
  notificationTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: TIME_LINE_H,
    height: TIME_LINE_H,
    color: "rgba(74, 85, 101, 1)",
    fontWeight: "500",
    marginTop: sw(4),
  },
});
