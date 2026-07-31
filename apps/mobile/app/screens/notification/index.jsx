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
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import ScreenHeader from "../../../components/layout/screen-header";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationRoute,
  sortNotifications,
} from "../../../services/notifications-api";
import { mergeNotifications } from "../../../utils/notification-pagination";
import { useApiAction } from "../../../hooks/use-api-action";
import { sw, sf } from "../../../utils/responsive";

const ICON_SIZE = sw(36);
const UNREAD_DOT = sw(8);
const PAGE_SIZE = 15;

function NotificationRow({ item, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(item)}>
      <LinearGradient
        style={styles.notificationItem}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        colors={
          !item.read
            ? [
                "rgba(239, 246, 255, 0.8)",
                "rgba(255, 255, 255, 0.9)",
                "rgba(236, 254, 255, 0.8)",
              ]
            : [
                "rgba(255, 255, 255, 0.9)",
                "rgba(255, 255, 255, 1)",
                "rgba(255, 255, 255, 0.9)",
              ]
        }
      >
        <View style={styles.itemRow}>
          <View>
            <Image source={item.icon} style={styles.itemIcon} />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationDescription}>{item.description}</Text>
            <Text style={styles.notificationTime}>{item.time}</Text>
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
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const loadingMoreRef = useRef(false);
  const pageRef = useRef(1);
  const hasLoadedRef = useRef(false);
  const onEndReachedGateRef = useRef(true);
  const [showFooterLoader, setShowFooterLoader] = useState(false);
  const { runAction, showFailure } = useApiAction();

  const loadPage = useCallback(async (pageNum, { append = false, silent = false } = {}) => {
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

      setItems((prev) => (append ? mergeNotifications(prev, notifications) : notifications));
      setUnread(unreadCount);
      pageRef.current = meta.currentPage;
      setHasMore(meta.currentPage < meta.lastPage);
      setTotal(meta.total);
    } catch {
      if (!append) {
        setItems([]);
        setHasMore(false);
        setTotal(0);
        pageRef.current = 1;
      }
    } finally {
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
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        loadPage(1);
        return;
      }
      // Refresh first page when returning — do not depend on items.length (breaks pagination).
      loadPage(1, { silent: true });
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
        successTitle: "All caught up",
        successMessage: "All notifications marked as read.",
        errorTitle: "Could not mark all read",
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
  }, [markingAll, unread, runAction]);

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
          await showFailure("Could not update notification", err);
        }
      }

      const route = resolveNotificationRoute(item);
      if (route?.pathname) {
        router.push(route);
        return;
      }

      await showFailure("Unable to open", {
        message: "This notification has no related screen to open.",
      });
    },
    [router, showFailure],
  );

  const unreadLabel =
    unread === 0 ? "All caught up" : `${unread} unread`;

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
            {total > 0 ? `Showing all ${total} notification${total === 1 ? "" : "s"}` : "You're all caught up"}
          </Text>
        </View>
      );
    }

    return <View style={styles.footerSpacer} />;
  }, [hasMore, items.length, showFooterLoader, total]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#0EA5E9" />
        </View>
      );
    }

    return <Text style={styles.emptyText}>No notifications yet.</Text>;
  }, [loading]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title="Notifications"
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
              Mark all read
            </Text>
          </TouchableOpacity>
        }
      />

      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        colors={["rgba(239, 246, 255, 0.8)", "rgba(255, 255, 255, 1)", "rgba(236, 253, 245, 0.8)"]}
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
      </LinearGradient>
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
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
    paddingVertical: sw(24),
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
    borderColor: "rgba(190, 219, 255, 0.6)",
    borderRadius: sw(14),
    padding: sw(14),
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: sw(10),
    flex: 1,
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
    lineHeight: sf(18),
    color: "rgba(15, 23, 42, 1)",
    fontWeight: "700",
    flexShrink: 1,
  },
  notificationDescription: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "rgba(54, 65, 83, 1)",
    fontWeight: "500",
    flexShrink: 1,
    marginTop: sw(2),
  },
  notificationTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "rgba(74, 85, 101, 1)",
    fontWeight: "500",
    marginTop: sw(4),
  },
});
