import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../layout/screen-header";
import PropertyHubHero from "../property/property-hub-hero";
import PropertyHubSectionHeader from "../property/property-hub-section-header";
import PropertyHubStats from "../property/property-hub-stats";
import PropertyQuickGrid from "../property/property-quick-grid";
import PropertyHubLinkCards from "../property/property-hub-link-cards";
import PropertyHubApprovalQueue from "../property/property-hub-approval-queue";
import { PropertyManagementRoutes, navigatePropertyHubRoute } from "../../constants/property-management-routes";
import { getCurrentRole } from "../../constants/role-session";
import { Fonts } from "../../constants/font";
import { Layout } from "../../constants/tokens";
import { HOME_SCROLL_BOTTOM_PAD } from "../../constants/home-styles";
import { sf, sw } from "../../utils/responsive";
import {
  PropertyHubTheme,
  getPropertyHubServices,
  getPropertyCommunityServices,
  filterPropertyServicesForViewer,
} from "../../constants/property-management-theme";
import { resolveViewerBillingAccess } from "../../services/property-services-api";
import {
  fetchMyBookings,
  fetchBookingInbox,
  fetchAdminAmenities,
} from "../../services/amenity-api";
import { rnShadow } from "../../utils/shadow";
import {
  buildPropertyHubActivity,
  buildResidentHubActivity,
  ACTIVITY_LIMIT,
} from "../../utils/property-hub-activity";

const ROUTES = { ...PropertyManagementRoutes, HELP: "/screens/help" };

function getEmptyResidentActivity(t) {
  return {
    incoming: { title: t("services.requestsToApprove"), items: [] },
    outgoing: { title: t("services.yourReservations"), items: [] },
  };
}

function getInitialHubStats(isAdmin, t) {
  if (!isAdmin) return [];

  return [
    {
      id: "pending-reviews",
      label: t("services.amenityReviews"),
      value: "0",
      tone: "default",
      routeKey: "ADMIN_AMENITIES",
      variant: "amenityReview",
    },
  ];
}

function SectionLoader({ label }) {
  return (
    <View style={styles.loaderCard}>
      <ActivityIndicator size="small" color={PropertyHubTheme.teal} />
      <Text style={styles.loaderText}>{label}</Text>
    </View>
  );
}

function EmptyApprovalQueue({ title, message }) {
  return (
    <View style={styles.emptyQueueCard}>
      <View style={styles.emptyQueueIcon}>
        <Feather name="check-circle" size={sf(18)} color={PropertyHubTheme.deepTeal} />
      </View>
      <Text style={styles.emptyQueueTitle}>{title}</Text>
      <Text style={styles.emptyQueueText}>{message}</Text>
    </View>
  );
}

export default function PropertyManagment() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const contentMaxWidth = Math.min(windowWidth, isWide ? 720 : windowWidth);

  const [isAdmin, setIsAdmin] = useState(() => getCurrentRole() === "admin");
  const [isBillingContact, setIsBillingContact] = useState(false);
  const hubServices = useMemo(() => {
    const services = getPropertyHubServices(isAdmin, t);
    if (isAdmin) return services;
    return filterPropertyServicesForViewer(services, { isBillingContact });
  }, [isAdmin, isBillingContact, t]);
  const communityServices = useMemo(() => getPropertyCommunityServices(t), [t]);

  const [refreshing, setRefreshing] = useState(false);
  const [adminActivity, setAdminActivity] = useState({ title: t("services.approvalQueue"), items: [] });
  const [residentActivity, setResidentActivity] = useState(() => getEmptyResidentActivity(t));
  const [hubStats, setHubStats] = useState(() => getInitialHubStats(getCurrentRole() === "admin", t));
  const [bookingCounts, setBookingCounts] = useState({
    myReservationCount: 0,
    approveRequestCount: 0,
  });
  const [activityLoading, setActivityLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    const admin = getCurrentRole() === "admin";
    setIsAdmin(admin);
    setActivityLoading(true);

    try {
      if (admin) {
        const [bookings, amenitiesRes, myBookings] = await Promise.all([
          fetchBookingInbox({ status: "pending" }).catch(() => []),
          fetchAdminAmenities({ review_status: "pending" }).catch(() => ({ data: [] })),
          fetchMyBookings().catch(() => []),
        ]);
        const pendingAmenities = amenitiesRes?.data ?? [];
        const pendingBookings = bookings ?? [];
        const upcomingCount = (myBookings ?? []).filter((b) =>
          ["pending", "confirmed"].includes(b?.status),
        ).length;
        const built = buildPropertyHubActivity({
          bookings: pendingBookings,
          amenities: pendingAmenities,
          isAdmin: true,
        });
        setAdminActivity(built);
        setResidentActivity(getEmptyResidentActivity(t));
        setIsBillingContact(false);
        setBookingCounts({
          myReservationCount: upcomingCount,
          approveRequestCount: pendingBookings.length,
        });
        setHubStats([
          {
            id: "pending-reviews",
            label: t("services.amenityReviews"),
            value: String(pendingAmenities.length),
            tone: pendingAmenities.length ? "pending" : "default",
            routeKey: "ADMIN_AMENITIES",
            variant: "amenityReview",
          },
        ]);
        return;
      }

      const [inbox, bookings, billingAccess] = await Promise.all([
        fetchBookingInbox({ status: "pending" }).catch(() => []),
        fetchMyBookings().catch(() => []),
        resolveViewerBillingAccess(),
      ]);
      setIsBillingContact(Boolean(billingAccess.isBillingContact));

      const resident = buildResidentHubActivity({
        inbox: inbox ?? [],
        bookings: bookings ?? [],
      });

      const pendingCount = (inbox ?? []).length;
      const upcomingCount = (bookings ?? []).filter((b) =>
        ["pending", "confirmed"].includes(b?.status),
      ).length;

      setResidentActivity(resident);
      setAdminActivity({ title: t("services.approvalQueue"), items: [] });
      setBookingCounts({
        myReservationCount: upcomingCount,
        approveRequestCount: pendingCount,
      });
      setHubStats([]);
    } catch {
      setIsBillingContact(false);
      setAdminActivity({ title: t("services.approvalQueue"), items: [] });
      setResidentActivity(getEmptyResidentActivity(t));
      setBookingCounts({ myReservationCount: 0, approveRequestCount: 0 });
      setHubStats(getInitialHubStats(getCurrentRole() === "admin", t));
    } finally {
      setActivityLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActivity();
  }, [loadActivity]);

  const goTo = (routeKey) => {
    navigatePropertyHubRoute(router, routeKey, ROUTES);
  };

  const handleActivity = (item) => {
    if (item.routeKey === "RULE_DETAIL" && item.ruleId != null) {
      router.push({
        pathname: ROUTES.RULE_DETAIL,
        params: { ruleId: String(item.ruleId) },
      });
      return;
    }
    goTo(item.routeKey);
  };

  const incomingApprovals = residentActivity.incoming.items;
  const approvalItems = isAdmin ? adminActivity.items : incomingApprovals;
  const approvalTitle = isAdmin ? adminActivity.title : t("services.requestsToApprove");
  const approvalSubtitle = isAdmin
    ? t("services.approvalQueueSub")
    : t("services.bookingRequestsSub");
  const showApprovalQueue =
    isAdmin
      ? adminActivity.items.length > 0 || activityLoading
      : true;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("services.title")}
        subtitle={isAdmin ? t("services.adminSubtitle") : t("services.residentSubtitle")}
        showBack
        iconOnly
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { maxWidth: contentMaxWidth, alignSelf: isWide ? "center" : undefined, width: "100%" },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PropertyHubTheme.teal}
          />
        }
      >
        <View style={styles.heroSection}>
          <PropertyHubHero
            isAdmin={isAdmin}
            onAction={goTo}
            reservationCount={bookingCounts.myReservationCount}
          />
        </View>

        {isAdmin && hubStats.length > 0 ? (
          <View style={styles.section}>
            <PropertyHubSectionHeader
              title={t("services.needsAttention")}
              subtitle={t("services.needsAttentionSub")}
            />
            <PropertyHubStats items={hubStats} onAction={goTo} />
          </View>
        ) : null}

        <View style={styles.section}>
          <PropertyHubSectionHeader
            title={t("services.explore")}
            subtitle={
              isAdmin
                ? t("services.exploreAdminSub")
                : t("services.exploreResidentSub")
            }
          />
          <PropertyQuickGrid
            actions={hubServices}
            onAction={goTo}
            badges={{
              myReservationCount: bookingCounts.myReservationCount,
              approveRequestCount: bookingCounts.approveRequestCount,
            }}
          />
        </View>

        <View style={styles.section}>
          <PropertyHubSectionHeader
            title={t("services.rulesSection")}
            subtitle={t("services.rulesSectionSub")}
          />
          <PropertyHubLinkCards items={communityServices} onAction={goTo} />
        </View>

        {showApprovalQueue ? (
          <View style={styles.lastSection}>
            <PropertyHubSectionHeader
              title={approvalTitle}
              subtitle={approvalSubtitle}
              count={approvalItems.length || undefined}
              actionLabel={approvalItems.length ? t("services.seeAll") : undefined}
              onAction={approvalItems.length ? () => goTo("ADMIN_BOOKINGS") : undefined}
            />
            {activityLoading && approvalItems.length === 0 ? (
              <SectionLoader label={t("services.loadingApprovalQueue")} />
            ) : approvalItems.length > 0 ? (
              <PropertyHubApprovalQueue
                items={approvalItems}
                onAction={handleActivity}
                limit={ACTIVITY_LIMIT}
              />
            ) : (
              <EmptyApprovalQueue
                title={t("admin.allClear")}
                message={t("propertyMgmt.noPendingReservations")}
              />
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PropertyHubTheme.surface,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: HOME_SCROLL_BOTTOM_PAD,
  },
  heroSection: {
    marginBottom: sw(20),
  },
  section: {
    marginBottom: sw(26),
  },
  lastSection: {
    marginBottom: 0,
  },
  loaderCard: {
    minHeight: sw(88),
    borderRadius: sw(16),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(22),
    paddingHorizontal: sw(16),
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#101828", offset: { width: 0, height: 1 }, opacity: 0.015, radius: 2 }),
      },
      android: { elevation: 0 },
    }),
  },
  loaderText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(10),
    textAlign: "center",
  },
  emptyQueueCard: {
    borderRadius: sw(14),
    backgroundColor: PropertyHubTheme.accentSoft,
    borderWidth: 1,
    borderColor: PropertyHubTheme.approvalBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(22),
    paddingHorizontal: sw(20),
    ...Platform.select({
      ios: {
        ...rnShadow({ color: PropertyHubTheme.deepTeal, offset: { width: 0, height: 1 }, opacity: 0.02, radius: 3 }),
      },
      android: { elevation: 0 },
    }),
  },
  emptyQueueIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: 1,
    borderColor: PropertyHubTheme.approvalBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyQueueTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: PropertyHubTheme.text,
    fontWeight: "700",
    marginTop: sw(12),
    textAlign: "center",
  },
  emptyQueueText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(6),
    textAlign: "center",
  },
});
