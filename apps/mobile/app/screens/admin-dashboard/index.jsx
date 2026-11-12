import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Animated,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import { AdminTheme } from "../../../constants/admin-theme";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sf, sw } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";
import { fetchAdminStats, approveMember } from "../../../services/admin-api";
import { getCommunityId, getUser, setCommunityId } from "../../../services/auth-session";
import { fetchMe } from "../../../services/auth-api";
import {
  currentCommunityId,
  getAdminMembership,
  isCommunityAdmin,
  isPakistanCommunityRegion,
} from "../../../services/community-access";
import { useRequireCommunityAdmin } from "../../../hooks/use-require-community-admin";
import { MarketplaceRoutes, withMarketplaceRole } from "../../../constants/marketplace-routes";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { isResidentFeatureEnabled, isReviewActionEnabled } from "../../../constants/resident-features";
import { useSessionUser } from "../../../hooks/use-session-user";
import { useApiAction } from "../../../hooks/use-api-action";
import { AdminDashboardSkeleton } from "../../../components/ui/skeleton-loader";

let dashboardCache = null;

const PAD = sw(20);
const STAT_COL_PAD = 5;
const CREATE_CARD_GAP = sw(16);

const ACTION_TYPE_META = {
  membership: { label: "admin.actionTypeMember", icon: "user", color: "#14B8A6" },
  listing: { label: "admin.actionTypeListing", icon: "shopping-bag", color: "#059669" },
  post: { label: "admin.actionTypePost", icon: "message-square", color: "#7C3AED" },
  business: { label: "admin.actionTypeBusiness", icon: "briefcase", color: "#D97706" },
  booking: { label: "admin.actionTypeBooking", icon: "calendar", color: "#7C3AED" },
  amenity_review: { label: "admin.actionTypeAmenityReview", icon: "grid", color: "#0891B2" },
  amenity_payment: { label: "admin.actionTypeAmenityPayment", icon: "file-text", color: "#D97706" },
  service_payment: { label: "admin.actionTypeServicePayment", icon: "clipboard", color: "#F59E0B" },
  event: { label: "admin.actionTypeEvent", icon: "calendar", color: "#7C3AED" },
  notice: { label: "admin.actionTypeNotice", icon: "bell", color: "#0891B2" },
  alert: { label: "admin.actionTypeAlert", icon: "alert-triangle", color: "#DC2626" },
  community_request: { label: "admin.actionTypeCommunity", icon: "home", color: "#4F46E5" },
  community_admin: { label: "admin.actionTypeAdminApp", icon: "shield", color: "#4F46E5" },
};

const DEFAULT_ACTION_META = { label: "admin.actionTypeReview", icon: "inbox", color: "#64748B" };

function haptic() {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function relTime(ts, t) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return t("admin.justNow");
  if (diff < 3600000) return t("admin.minutesAgo", { count: Math.floor(diff / 60000) });
  if (diff < 86400000) return t("admin.hoursAgo", { count: Math.floor(diff / 3600000) });
  return t("admin.daysAgo", { count: Math.floor(diff / 86400000) });
}

function StatusBanner({ communityName, generatedAt, pendingTotal, t }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const hasPending = pendingTotal > 0;

  return (
    <View style={[styles.statusBanner, compact && styles.statusBannerCompact]}>
      <View
        style={[
          styles.statusMark,
          hasPending ? styles.statusMarkActive : styles.statusMarkClear,
        ]}
      >
        <Feather
          name={hasPending ? "inbox" : "home"}
          size={sf(compact ? 16 : 18)}
          color={hasPending ? "#D97706" : Colors.brandPrimaryDeep}
        />
      </View>
      <View style={styles.statusCopy}>
        <Text style={[styles.communityName, compact && styles.communityNameCompact]} numberOfLines={2}>
          {communityName || t("admin.yourCommunity")}
        </Text>
        <View style={styles.statusMetaRow}>
          <View
            style={[
              styles.statusPill,
              hasPending ? styles.statusPillActive : styles.statusPillClear,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: hasPending ? "#F59E0B" : "#10B981" },
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                hasPending ? styles.statusPillTextActive : styles.statusPillTextClear,
              ]}
              numberOfLines={1}
            >
              {hasPending ? t("admin.waitingForReview", { count: pendingTotal }) : t("admin.allClear")}
            </Text>
          </View>
          {generatedAt ? (
            <Text style={styles.statusUpdated} numberOfLines={1}>
              {relTime(generatedAt, t)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function StatChip({ value, label, icon, color, highlight, onPress }) {
  const displayValue = value == null || value === "" ? "0" : String(value);
  const tint = highlight ? "#D97706" : color;

  return (
    <View style={styles.statCol}>
      <Pressable
        style={({ pressed }) => [
          styles.statChip,
          highlight && styles.statChipHighlight,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          haptic();
          onPress?.();
        }}
      >
        <View style={[styles.statIconWrap, { backgroundColor: `${tint}14` }]}>
          <Feather name={icon} size={sf(14)} color={tint} style={styles.statIconGlyph} />
        </View>
        <Text style={[styles.statChipValue, highlight && styles.statChipValueHighlight]}>
          {displayValue}
        </Text>
        <Text style={styles.statChipLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function SectionLabel({ title, hint }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      {hint ? <Text style={styles.sectionLabelHint}>{hint}</Text> : null}
    </View>
  );
}

function ReviewSectionHeader({ pendingTotal, t }) {
  const hasPending = pendingTotal > 0;
  return (
    <View style={styles.reviewSectionHead}>
      <Text style={styles.reviewSectionTitle}>{t("admin.review")}</Text>
      <View
        style={[
          styles.reviewCountPill,
          hasPending ? styles.reviewCountPillActive : styles.reviewCountPillClear,
        ]}
      >
        <View
          style={[
            styles.reviewCountDot,
            { backgroundColor: hasPending ? "#F59E0B" : "#10B981" },
          ]}
        />
        <Text
          style={[
            styles.reviewCountText,
            hasPending ? styles.reviewCountTextActive : styles.reviewCountTextClear,
          ]}
          numberOfLines={1}
        >
          {hasPending ? t("admin.pendingOpen", { count: pendingTotal }) : t("admin.allClear")}
        </Text>
      </View>
    </View>
  );
}

function QueueRow({ action, approving, onApprove, onReview, showDivider, t }) {
  const meta = ACTION_TYPE_META[action.type] ?? DEFAULT_ACTION_META;
  const isMember = action.type === "membership";
  const detail = (action.detail || action.subtitle || "").trim();
  const metaLine = detail ? `${t(meta.label)} · ${detail}` : t(meta.label);
  const timeLabel = action.created_at ? relTime(action.created_at, t) : "";

  return (
    <View style={styles.reviewItem}>
      <View style={styles.reviewRow}>
        <View style={[styles.reviewIcon, { backgroundColor: `${meta.color}14` }]}>
          <Feather name={meta.icon} size={sf(15)} color={meta.color} />
        </View>

        <View style={styles.reviewCopy}>
          <Pressable
            onPress={() => {
              haptic();
              onReview();
            }}
            style={({ pressed }) => pressed && styles.pressedSoft}
          >
            <Text style={styles.reviewTitle} numberOfLines={1} ellipsizeMode="tail">
              {action.title || t("admin.untitled")}
            </Text>
            <Text style={styles.reviewMeta} numberOfLines={1} ellipsizeMode="tail">
              {metaLine}
            </Text>
          </Pressable>
        </View>

        <View style={styles.reviewTrailing}>
          {timeLabel ? (
            <Text style={styles.reviewTime} numberOfLines={1}>
              {timeLabel}
            </Text>
          ) : null}

          {isMember ? (
            <Pressable
              style={({ pressed }) => [
                styles.reviewApproveBtn,
                approving && styles.reviewApproveBtnBusy,
                pressed && !approving && styles.pressedSoft,
              ]}
              disabled={approving}
              hitSlop={8}
              onPress={() => {
                haptic();
                onApprove();
              }}
            >
              {approving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="check" size={sf(12)} color="#FFFFFF" />
                  <Text style={styles.reviewApproveBtnText}>{t("admin.approve")}</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={styles.reviewChevronHit}
              onPress={() => {
                haptic();
                onReview();
              }}
              hitSlop={8}
            >
              <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
            </Pressable>
          )}
        </View>
      </View>

      {showDivider ? <View style={styles.reviewDivider} /> : null}
    </View>
  );
}

function NavRow({ icon, label, badge, color = Colors.brandPrimaryDeep, onPress }) {
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [styles.navRowOuter, pressed && styles.pressedSoft]}
    >
      <View style={styles.navRow}>
        <View style={[styles.navIcon, { backgroundColor: `${color}14` }]}>
          <Feather name={icon} size={sf(16)} color={color} />
        </View>
        <Text style={styles.navLabel} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.navTrailing}>
          {badge != null && badge > 0 ? (
            <View style={styles.navBadge}>
              <Text style={styles.navBadgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          ) : null}
          <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
        </View>
      </View>
    </Pressable>
  );
}

function CreateRow({ icon, title, subtitle, accent, onPress, isLast = false }) {
  return (
    <View style={[styles.createCardWrap, !isLast && styles.createCardSpacing]}>
      <Pressable
        onPress={() => {
          haptic();
          onPress?.();
        }}
        style={({ pressed }) => [styles.createRowPress, pressed && styles.pressedSoft]}
      >
        <View style={styles.createRow}>
          <View style={[styles.createAccent, { backgroundColor: accent }]} />
          <View style={[styles.createIcon, { backgroundColor: `${accent}14` }]}>
            <Feather name={icon} size={sf(16)} color={accent} />
          </View>
          <View style={styles.createCopy}>
            <Text style={styles.createTitle}>{title}</Text>
            <Text style={styles.createSub} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <Feather name="plus" size={sf(16)} color="#94A3B8" />
        </View>
      </Pressable>
    </View>
  );
}

export default function AdminDashboardScreen() {
  useRequireCommunityAdmin();
  const sessionUser = useSessionUser();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spinAnim = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(!dashboardCache);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(dashboardCache?.stats ?? null);
  const [communityName, setCommunityName] = useState(dashboardCache?.communityName ?? "");
  const [pendingActions, setPendingActions] = useState(dashboardCache?.pendingActions ?? []);
  const [generatedAt, setGeneratedAt] = useState(dashboardCache?.generatedAt ?? null);
  const [loadError, setLoadError] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const hasStatsRef = useRef(Boolean(dashboardCache?.stats));

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasStatsRef.current) setLoading(true);
    setLoadError(null);
    try {
      const user = (await fetchMe().catch(() => null)) ?? (await getUser());
      if (!isCommunityAdmin(user)) {
        router.replace("/(tabs)/home");
        return;
      }
      const storedCommunityId = await getCommunityId();
      const preferredCommunityId = currentCommunityId(user) ?? storedCommunityId;
      const adminCommunityId = getAdminMembership(user, preferredCommunityId)?.community_id;
      if (adminCommunityId) {
        await setCommunityId(adminCommunityId);
      }
      const dashboard = await fetchAdminStats();
      const nextCommunityName = dashboard?.scope?.label ?? t("admin.yourCommunity");
      const nextStats = dashboard?.stats ?? {};
      const nextPendingActions = dashboard?.pending_actions ?? [];
      const nextGeneratedAt = dashboard?.generated_at ?? null;

      dashboardCache = {
        communityName: nextCommunityName,
        stats: nextStats,
        pendingActions: nextPendingActions,
        generatedAt: nextGeneratedAt,
      };
      hasStatsRef.current = true;

      setCommunityName(nextCommunityName);
      setStats(nextStats);
      setPendingActions(nextPendingActions);
      setGeneratedAt(nextGeneratedAt);
    } catch (err) {
      if (!hasStatsRef.current) {
        setStats(null);
        setPendingActions([]);
      }
      setLoadError(err?.message || t("admin.couldNotLoadDashboard"));
      if (!silent && !hasStatsRef.current) await showFailure(t("admin.couldNotLoadDashboard"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  useEffect(() => {
    if (!refreshing) {
      spinAnim.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [refreshing, spinAnim]);

  const featureOn = (key) => {
    if (!key) return true;
    if (key === "refer_and_earn" && isPakistanCommunityRegion(sessionUser)) return false;
    return isResidentFeatureEnabled(sessionUser, key);
  };

  const pendingTotal = useMemo(() => {
    let total = Number(stats?.pending_members ?? 0);
    if (featureOn("marketplace")) {
      total += Number(stats?.pending_listings ?? 0) + Number(stats?.pending_businesses ?? 0);
    }
    if (featureOn("feed")) total += Number(stats?.pending_posts ?? 0);
    if (featureOn("bookings")) total += Number(stats?.pending_bookings ?? 0);
    if (featureOn("amenities")) {
      total += Number(stats?.pending_amenity_reviews ?? 0);
      total += Number(stats?.pending_amenity_payments ?? 0);
    }
    if (featureOn("services")) total += Number(stats?.pending_service_payments ?? 0);
    return total;
  }, [sessionUser, stats]);

  const handleApprove = async (action) => {
    if (action.type !== "membership" || !action.user_id) return;
    setApprovingId(action.user_id);
    try {
      await runAction({
        action: () => approveMember(action.user_id),
        successTitle: t("admin.approved"),
        successMessage: t("admin.canAccessCommunity", { name: action.title }),
        errorTitle: t("admin.approvalFailed"),
        onSuccess: () => load(true),
      });
    } finally {
      setApprovingId(null);
    }
  };

  const routeFor = (action) => {
    if (action.type === "post") return "/screens/community-feed";
    if (action.type === "membership") return "/screens/admin-members";
    if (action.type === "event") {
      return { pathname: "/screens/admin-content-review", params: { kind: "event" } };
    }
    if (action.type === "alert") {
      return { pathname: "/screens/admin-content-review", params: { kind: "alert" } };
    }
    if (action.type === "notice") {
      return { pathname: "/screens/admin-content-review", params: { kind: "notice" } };
    }
    if (action.type === "business") {
      return {
        pathname: MarketplaceRoutes.ALL_BUSINESSES,
        params: withMarketplaceRole("admin", { tab: "businesses" }),
      };
    }
    if (action.type === "booking") return "/screens/admin-bookings";
    if (action.type === "amenity_review") return "/screens/admin-amenities";
    if (action.type === "amenity_payment") return "/screens/admin-amenity-bills";
    if (action.type === "service_payment") return "/screens/admin-service-bills";
    if (action.type === "listing") return "/screens/admin-listings";
    return "/screens/admin-dashboard";
  };

  const refreshSpin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const statTiles = useMemo(() => {
    const pendingMembers = Number(stats?.pending_members ?? 0);
    return [
      {
        key: "members",
        value: Number(stats?.total_members ?? 0),
        label: t("admin.residents"),
        icon: "users",
        color: "#14B8A6",
        onPress: () => router.push("/screens/admin-members"),
      },
      {
        key: "pending",
        value: pendingMembers,
        label: t("admin.pending"),
        icon: "clock",
        color: "#D97706",
        highlight: pendingMembers > 0,
        onPress: () => router.push("/screens/admin-members"),
      },
      {
        key: "listings",
        feature: "marketplace",
        value: Number(stats?.active_listings ?? stats?.pending_listings ?? 0),
        label: t("admin.listings"),
        icon: "shopping-bag",
        color: "#059669",
        highlight: Number(stats?.pending_listings ?? 0) > 0,
        onPress: () => router.push("/screens/admin-listings"),
      },
      {
        key: "bookings",
        feature: "bookings",
        value: Number(stats?.pending_bookings ?? 0),
        label: t("admin.bookings"),
        icon: "calendar",
        color: "#7C3AED",
        highlight: Number(stats?.pending_bookings ?? 0) > 0,
        onPress: () => router.push("/screens/admin-bookings"),
      },
    ].filter((item) => featureOn(item.feature));
  }, [featureOn, router, stats, t]);

  const manageLinks = [
    { icon: "users", label: t("admin.residents"), badge: stats?.pending_members, color: "#14B8A6", route: "/screens/admin-members" },
    { icon: "user-plus", label: t("admin.inviteMember"), color: "#4F46E5", route: { pathname: "/screens/admin-members", params: { invite: "1" } } },
    { icon: "users", label: t("admin.guestUsers"), color: "#0EA5E9", route: "/screens/admin-guests", feature: "guest_invites" },
    { icon: "calendar", label: t("admin.communityEvents"), color: "#7C3AED", route: "/screens/admin-community-events", feature: "events" },
    { icon: "grid", label: t("admin.amenities"), color: "#0891B2", route: "/screens/admin-amenities", feature: "amenities" },
    { icon: "calendar", label: t("admin.amenityBookings"), badge: stats?.pending_bookings, color: "#7C3AED", route: "/screens/admin-bookings", feature: "bookings" },
    { icon: "life-buoy", label: "Complaints", color: "#1B4F8A", route: "/screens/admin-complaints" },
    { icon: "shopping-bag", label: t("admin.marketplaceListings"), badge: stats?.pending_listings, color: "#059669", route: "/screens/admin-listings", feature: "marketplace" },
    { icon: "briefcase", label: t("admin.businesses"), badge: stats?.pending_businesses, color: "#D97706", route: { pathname: MarketplaceRoutes.ALL_BUSINESSES, params: withMarketplaceRole("admin", { tab: "businesses" }) }, feature: "marketplace" },
    { icon: "tag", label: t("admin.deals"), color: "#E11D48", route: { pathname: MarketplaceRoutes.ALL_BUSINESSES, params: withMarketplaceRole("admin", { tab: "deals" }) }, feature: "marketplace" },
    { icon: "award", label: t("admin.referAndEarn"), color: "#0F766E", route: "/screens/admin-refer-and-earn", feature: "refer_and_earn" },
  ].filter((item) => featureOn(item.feature));

  const reviewItems = useMemo(() => {
    const seen = new Set();
    return pendingActions.filter((action) => {
      if (!isReviewActionEnabled(sessionUser, action.type)) return false;
      const key = `${action.type}-${action.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }, [pendingActions, sessionUser]);

  const scrollBottom = Math.max(insets.bottom, 16) + sw(16);

  const handleRefresh = () => {
    haptic();
    setRefreshing(true);
    load(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("admin.communityAdmin")}
        subtitle={communityName || t("admin.manageYourCommunity")}
        iconOnly
        right={
          <HeaderIconSlot>
            <Pressable
              style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
              onPress={handleRefresh}
              disabled={refreshing}
              hitSlop={8}
            >
              <Animated.View style={refreshing ? { transform: [{ rotate: refreshSpin }] } : undefined}>
                <Feather name="refresh-cw" size={sf(18)} color="#64748B" />
              </Animated.View>
            </Pressable>
          </HeaderIconSlot>
        }
      />

      {loading && !stats && !loadError ? (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
        >
          <AdminDashboardSkeleton />
        </ScrollView>
      ) : loadError && !stats ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={sf(28)} color={AdminTheme.textMuted} />
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>{t("admin.tryAgain")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.brandPrimaryDeep} />}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
        >
          <StatusBanner
            communityName={communityName}
            generatedAt={generatedAt}
            pendingTotal={pendingTotal}
            t={t}
          />

          <View style={styles.statGrid}>
            {statTiles.map(({ key, ...tile }) => (
              <StatChip key={`stat-${key}`} {...tile} />
            ))}
          </View>

          <View style={styles.block}>
            <ReviewSectionHeader pendingTotal={pendingTotal} t={t} />
            <View style={styles.reviewPanel}>
              {reviewItems.length > 0 ? (
                reviewItems.map((action, index) => (
                  <QueueRow
                    key={`${action.type}-${action.id}`}
                    action={action}
                    approving={approvingId === action.user_id}
                    onApprove={() => handleApprove(action)}
                    onReview={() => router.push(routeFor(action))}
                    showDivider={index < reviewItems.length - 1}
                    t={t}
                  />
                ))
              ) : (
                <View style={styles.reviewEmpty}>
                  <View style={styles.reviewEmptyIcon}>
                    <Feather name="check-circle" size={sf(18)} color="#059669" />
                  </View>
                  <View style={styles.reviewEmptyCopy}>
                    <Text style={styles.reviewEmptyTitle}>{t("admin.allCaughtUp")}</Text>
                    <Text style={styles.reviewEmptyText} numberOfLines={2}>
                      {t("admin.newRequestsWillAppear")}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.block}>
            <SectionLabel title={t("admin.manage")} hint={t("admin.communityTools")} />
            <View style={styles.navList}>
              {manageLinks.map((link, index) => (
                <View key={link.label}>
                  <NavRow
                    icon={link.icon}
                    label={link.label}
                    badge={link.badge}
                    color={link.color}
                    onPress={() => router.push(link.route)}
                  />
                  {index < manageLinks.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.block, styles.blockLast]}>
            <SectionLabel title={t("admin.create")} hint={t("admin.publishToResidents")} />
            <View style={styles.createList}>
              {featureOn("notices") ? (
              <CreateRow
                icon="clipboard"
                title={t("admin.notice")}
                subtitle={t("admin.boardUpdatesAndReminders")}
                accent="#1B4F8A"
                onPress={() => router.push("/screens/create-notice")}
              />
              ) : null}
              {featureOn("events") ? (
              <CreateRow
                icon="calendar"
                title={t("admin.event")}
                subtitle={t("admin.workshopsAndGatherings")}
                accent="#7C3AED"
                onPress={() => router.push("/screens/create-event")}
              />
              ) : null}
              {featureOn("alerts") ? (
              <CreateRow
                icon="alert-triangle"
                title={t("admin.alert")}
                subtitle={t("admin.urgentCommunityUpdates")}
                accent="#DC2626"
                onPress={() => router.push("/screens/create-alert")}
              />
              ) : null}
              {featureOn("community_rules") ? (
              <CreateRow
                icon="book-open"
                title={t("admin.addRule")}
                subtitle={t("admin.communityGuidelinesForResidents")}
                accent="#0F766E"
                onPress={() => router.push(PropertyManagementRoutes.RULE_FORM)}
              />
              ) : null}
              {featureOn("documents") ? (
              <CreateRow
                icon="file-text"
                title={t("admin.addDocument")}
                subtitle={t("admin.uploadFilesForResidents")}
                accent="#C2410C"
                onPress={() => router.push(PropertyManagementRoutes.DOCUMENT_FORM)}
              />
              ) : null}
              {featureOn("marketplace") ? (
              <CreateRow
                icon="shopping-bag"
                title={t("admin.addListing")}
                subtitle={t("admin.sellOrOfferServices")}
                accent="#059669"
                onPress={() => router.push(MarketplaceRoutes.CREATE_LISTING)}
              />
              ) : null}
              {featureOn("feed") ? (
              <CreateRow
                icon="edit-3"
                title={t("admin.createPost")}
                subtitle={t("admin.shareWithCommunityFeed")}
                accent="#14B8A6"
                onPress={() => router.push("/screens/create-post")}
                isLast
              />
              ) : null}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AdminTheme.screenBg,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: sw(16),
    width: "100%",
  },
  refreshBtn: {
    width: sw(36),
    height: sw(36),
    alignItems: "center",
    justifyContent: "center",
  },
  modeSwitch: {
    marginHorizontal: PAD,
    marginTop: sw(8),
    marginBottom: sw(4),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingVertical: sw(10),
  },
  modeSwitchText: {
    color: "#1B4F8A",
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(14),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  statusBannerCompact: {
    padding: sw(12),
    gap: sw(10),
  },
  statusMark: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusMarkActive: {
    backgroundColor: AdminTheme.amber.bg,
  },
  statusMarkClear: {
    backgroundColor: AdminTheme.accentSoft,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: sw(6),
  },
  communityName: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: AdminTheme.text,
    letterSpacing: -0.3,
  },
  communityNameCompact: {
    fontSize: sf(17),
    lineHeight: sf(22),
  },
  statusMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(8),
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  statusPillActive: {
    backgroundColor: AdminTheme.amber.bg,
    borderColor: AdminTheme.amber.border,
  },
  statusPillClear: {
    backgroundColor: AdminTheme.emerald.bg,
    borderColor: AdminTheme.emerald.border,
  },
  statusDot: {
    width: sw(6),
    height: sw(6),
    borderRadius: 999,
  },
  statusPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    flexShrink: 1,
  },
  statusPillTextActive: {
    color: AdminTheme.amber.text,
  },
  statusPillTextClear: {
    color: AdminTheme.emerald.text,
  },
  statusUpdated: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    width: "100%",
    marginBottom: sw(22),
    marginHorizontal: -STAT_COL_PAD,
  },
  statCol: {
    width: "25%",
    paddingHorizontal: STAT_COL_PAD,
  },
  statChip: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: sw(12),
    paddingBottom: sw(10),
    paddingHorizontal: sw(2),
    borderRadius: sw(12),
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  statChipHighlight: {
    borderColor: AdminTheme.amber.border,
    backgroundColor: AdminTheme.amber.bg,
  },
  statIconWrap: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: sw(6),
  },
  statIconGlyph: {
    textAlign: "center",
  },
  statChipValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: AdminTheme.text,
    lineHeight: sf(20),
    includeFontPadding: false,
    textAlign: "center",
    width: "100%",
    alignSelf: "center",
  },
  statChipValueHighlight: {
    color: AdminTheme.amber.text,
  },
  statChipLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    color: AdminTheme.textMuted,
    textAlign: "center",
    width: "100%",
    alignSelf: "center",
  },
  block: {
    marginBottom: sw(28),
  },
  blockLast: {
    marginBottom: 0,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  sectionLabelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionLabelHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    marginStart: sw(8),
  },
  reviewSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
    gap: sw(10),
  },
  reviewSectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  reviewCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(9),
    paddingVertical: sw(4),
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  reviewCountPillActive: {
    backgroundColor: AdminTheme.amber.bg,
    borderColor: AdminTheme.amber.border,
  },
  reviewCountPillClear: {
    backgroundColor: AdminTheme.emerald.bg,
    borderColor: AdminTheme.emerald.border,
  },
  reviewCountDot: {
    width: sw(5),
    height: sw(5),
    borderRadius: 999,
  },
  reviewCountText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  reviewCountTextActive: {
    color: AdminTheme.amber.text,
  },
  reviewCountTextClear: {
    color: AdminTheme.emerald.text,
  },
  reviewPanel: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
    overflow: "hidden",
  },
  reviewItem: {
    width: "100%",
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingStart: sw(14),
    paddingEnd: sw(12),
    paddingVertical: sw(12),
  },
  reviewIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
    marginEnd: sw(10),
  },
  reviewTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: AdminTheme.text,
    lineHeight: sf(18),
  },
  reviewMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    lineHeight: sf(16),
  },
  reviewTrailing: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: sw(6),
  },
  reviewTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  reviewApproveBtn: {
    height: sw(30),
    paddingHorizontal: sw(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(4),
    borderRadius: sw(8),
    backgroundColor: Colors.brandPrimaryDeep,
  },
  reviewApproveBtnBusy: {
    opacity: 0.75,
  },
  reviewApproveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#FFFFFF",
  },
  reviewChevronHit: {
    paddingVertical: sw(4),
    paddingStart: sw(4),
  },
  reviewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEF2F7",
    marginStart: sw(62),
  },
  reviewEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(16),
    paddingHorizontal: sw(14),
  },
  reviewEmptyIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: AdminTheme.emerald.bg,
    borderWidth: 1,
    borderColor: AdminTheme.emerald.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reviewEmptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewEmptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  reviewEmptyText: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: AdminTheme.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEF2F7",
    marginStart: sw(17),
  },
  emptyState: {
    paddingVertical: sw(18),
    paddingHorizontal: sw(14),
    borderRadius: sw(16),
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  emptyStateText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#94A3B8",
    textAlign: "center",
  },
  navList: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
    overflow: "hidden",
  },
  navRowOuter: {
    width: "100%",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: sw(14),
    paddingVertical: sw(13),
  },
  navIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  navLabel: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: AdminTheme.text,
    marginEnd: sw(8),
  },
  navTrailing: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  navBadge: {
    minWidth: sw(20),
    height: sw(20),
    borderRadius: 999,
    paddingHorizontal: sw(6),
    backgroundColor: AdminTheme.amber.bg,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(8),
  },
  navBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: AdminTheme.amber.text,
  },
  createCardWrap: {
    width: "100%",
  },
  createCardSpacing: {
    marginBottom: CREATE_CARD_GAP,
  },
  createRowPress: {
    width: "100%",
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: sw(13),
    paddingEnd: sw(14),
    paddingStart: sw(12),
    borderRadius: sw(16),
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
    overflow: "hidden",
  },
  createAccent: {
    position: "absolute",
    start: 0,
    top: 0,
    bottom: 0,
    width: sw(3),
  },
  createIcon: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
  },
  createCopy: {
    flex: 1,
    minWidth: 0,
  },
  createTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  createSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
    marginTop: 1,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  pressedSoft: { opacity: 0.92 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: "#64748B",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.brandPrimaryDeep,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: sw(4),
  },
  retryText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
});
