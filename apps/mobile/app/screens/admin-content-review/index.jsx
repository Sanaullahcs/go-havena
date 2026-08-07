import React, { useCallback, useMemo, useState } from "react";
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
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sf } from "../../../utils/responsive";
import {
  approveNotice,
  CATEGORY_THEME,
  fetchAdminNotices,
  rejectNotice,
} from "../../../services/notices-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { useAppDialog } from "../../../providers/app-dialog-provider";

const KIND_CONFIG = {
  event: {
    titleKey: "admin.pendingEvents",
    category_group: "events",
    emptyKey: "admin.noEventsWaiting",
    approveTitleKey: "admin.approveEvent",
    approveMessageKey: "admin.eventGoLive",
    rejectTitleKey: "admin.rejectEvent",
    reviewHintKey: "admin.reviewHintEvents",
  },
  alert: {
    titleKey: "admin.pendingAlerts",
    category_group: "alerts",
    emptyKey: "admin.noAlertsWaiting",
    approveTitleKey: "admin.approveAlert",
    approveMessageKey: "admin.alertGoLive",
    rejectTitleKey: "admin.rejectAlert",
    reviewHintKey: "admin.reviewHintAlerts",
  },
  notice: {
    titleKey: "admin.pendingNotices",
    category_group: "notices",
    emptyKey: "admin.noNoticesWaiting",
    approveTitleKey: "admin.approveNotice",
    approveMessageKey: "admin.noticeGoLive",
    rejectTitleKey: "admin.rejectNotice",
    reviewHintKey: "admin.reviewHintNotices",
  },
};

function formatSchedule(item) {
  const parts = [item.event_date, item.event_time].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(" · ");
}

function ContentRow({ item, busy, onApprove, onReject, t }) {
  const theme = CATEGORY_THEME[item.category] ?? CATEGORY_THEME.general;
  const schedule = formatSchedule(item);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.typePill, { backgroundColor: theme.bg }]}>
          <Feather name={theme.icon} size={sf(11)} color={theme.text} />
          <Text style={[styles.typePillText, { color: theme.text }]}>{theme.label}</Text>
        </View>
        <Text style={styles.author}>{t("admin.bySeller", { name: item.author_name ?? t("admin.resident") })}</Text>
      </View>

      <Text style={styles.title}>{item.title}</Text>
      {schedule ? <Text style={styles.schedule}>{schedule}</Text> : null}
      {item.location ? <Text style={styles.meta}>{t("admin.locationLabel", { location: item.location })}</Text> : null}
      {item.body ? (
        <Text style={styles.body} numberOfLines={4}>
          {item.body}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectBtn} disabled={busy} onPress={() => onReject(item.id)}>
          <Text style={styles.rejectBtnText}>{t("admin.reject")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveBtn} disabled={busy} onPress={() => onApprove(item.id)}>
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.approveBtnText}>{t("admin.approve")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminContentReviewScreen() {
  const { t } = useTranslation();
  const { kind = "event" } = useLocalSearchParams();
  const config = KIND_CONFIG[kind] ?? KIND_CONFIG.event;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchAdminNotices({
          review_status: "pending",
          category_group: config.category_group,
          per_page: 50,
        });
        setItems(res.data);
      } catch (err) {
        await showFailure(t("admin.couldNotLoad", { title: t(config.titleKey).toLowerCase() }), err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [config.category_group, config.titleKey, showFailure, t],
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const handleApprove = async (id) => {
    const confirmed = await showConfirm(t(config.approveTitleKey), t(config.approveMessageKey), {
      confirmLabel: t("admin.approve"),
    });
    if (confirmed !== "confirm") return;

    setBusyId(id);
    try {
      await runAction({
        action: () => approveNotice(id),
        successTitle: t("admin.approved"),
        successMessage: t("admin.residentsCanSeeContent"),
        errorTitle: t("admin.approvalFailed"),
        onSuccess: () => setItems((prev) => prev.filter((item) => item.id !== id)),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    const confirmed = await showConfirm(
      t(config.rejectTitleKey),
      t("admin.residentWillBeNotified"),
      { confirmLabel: t("admin.reject"), destructive: true },
    );
    if (confirmed !== "confirm") return;

    setBusyId(id);
    try {
      await runAction({
        action: () => rejectNotice(id),
        successTitle: t("admin.rejected"),
        successMessage: t("admin.residentHasBeenNotified"),
        errorTitle: t("admin.rejectFailed"),
        onSuccess: () => setItems((prev) => prev.filter((item) => item.id !== id)),
      });
    } finally {
      setBusyId(null);
    }
  };

  const listHeader = useMemo(
    () => (
      <Text style={styles.hint}>
        {t(config.reviewHintKey)}
      </Text>
    ),
    [config.reviewHintKey, t],
  );

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title={t(config.titleKey)} iconOnly />

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<Text style={styles.emptyText}>{t(config.emptyKey)}</Text>}
          renderItem={({ item }) => (
            <ContentRow
              item={item}
              busy={busyId === item.id}
              onApprove={handleApprove}
              onReject={handleReject}
              t={t}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 24, paddingBottom: 32 },
  hint: {
    marginBottom: 16,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textMuted,
    lineHeight: sf(19),
  },
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#FAFBFC",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typePillText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  author: {
    flex: 1,
    textAlign: "auto",
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  schedule: {
    marginTop: 6,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.brandPrimaryDeep,
  },
  meta: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  body: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
    lineHeight: sf(18),
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  rejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  rejectBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#DC2626",
  },
  approveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.brandPrimaryDeep,
    minWidth: 88,
    alignItems: "center",
  },
  approveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#FFFFFF",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 48,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: Colors.textMuted,
  },
});
