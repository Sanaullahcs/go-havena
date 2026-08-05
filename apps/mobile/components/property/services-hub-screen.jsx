import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import ScreenHeader from "../layout/screen-header";
import PropertyHubSectionHeader from "../property/property-hub-section-header";
import PropertyHubStats from "../property/property-hub-stats";
import PropertyHubUpNext from "../property/property-hub-up-next";
import PropertyQuickGrid from "../property/property-quick-grid";
import PropertyActivitySection from "../property/property-activity-section";
import { PropertyManagementRoutes, navigatePropertyHubRoute } from "../../constants/property-management-routes";
import { getCurrentRole } from "../../constants/role-session";
import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";
import {
  PropertyHubTheme,
  getPropertyHubServices,
} from "../../constants/property-management-theme";
import {
  fetchMyBookings,
  fetchBookingInbox,
  fetchAdminAmenities,
} from "../../services/amenity-api";
import {
  buildPropertyHubActivity,
  buildResidentHubActivity,
} from "../../utils/property-hub-activity";

const ROUTES = { ...PropertyManagementRoutes, HELP: "/screens/help" };

const EMPTY_RESIDENT_ACTIVITY = {
  incoming: { title: "Requests to approve", items: [] },
  outgoing: { title: "Your reservations", items: [] },
};

function SectionLoader({ label }) {
  return (
    <View style={styles.loaderCard}>
      <ActivityIndicator size="small" color={Colors.brandPrimaryDeep} />
      <Text style={styles.loaderText}>{label}</Text>
    </View>
  );
}

export default function PropertyManagment() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(() => getCurrentRole() === "admin");
  const hubServices = useMemo(() => getPropertyHubServices(isAdmin), [isAdmin]);

  const [refreshing, setRefreshing] = useState(false);
  const [adminActivity, setAdminActivity] = useState({ title: "Approval queue", items: [] });
  const [residentActivity, setResidentActivity] = useState(EMPTY_RESIDENT_ACTIVITY);
  const [hubStats, setHubStats] = useState(() =>
    getCurrentRole() === "admin"
      ? [
          {
            id: "pending-reviews",
            label: "Amenity reviews",
            value: "0",
            tone: "default",
            routeKey: "ADMIN_AMENITIES",
          },
          {
            id: "pending-bookings",
            label: "Booking requests",
            value: "0",
            tone: "default",
            routeKey: "ADMIN_BOOKINGS",
          },
        ]
      : [],
  );
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
        const [bookings, amenitiesRes] = await Promise.all([
          fetchBookingInbox({ status: "pending" }).catch(() => []),
          fetchAdminAmenities({ review_status: "pending" }).catch(() => ({ data: [] })),
        ]);
        const pendingAmenities = amenitiesRes?.data ?? [];
        const pendingBookings = bookings ?? [];
        const built = buildPropertyHubActivity({
          bookings: pendingBookings,
          amenities: pendingAmenities,
          isAdmin: true,
        });
        setAdminActivity(built);
        setResidentActivity(EMPTY_RESIDENT_ACTIVITY);
        setBookingCounts({ myReservationCount: 0, approveRequestCount: pendingBookings.length });
        setHubStats([
          {
            id: "pending-reviews",
            label: "Amenity reviews",
            value: String(pendingAmenities.length),
            tone: pendingAmenities.length ? "pending" : "default",
            routeKey: "ADMIN_AMENITIES",
          },
          {
            id: "pending-bookings",
            label: "Booking requests",
            value: String(pendingBookings.length),
            tone: pendingBookings.length ? "pending" : "default",
            routeKey: "ADMIN_BOOKINGS",
          },
        ]);
        return;
      }

      const [inbox, bookings] = await Promise.all([
        fetchBookingInbox({ status: "pending" }).catch(() => []),
        fetchMyBookings().catch(() => []),
      ]);

      const resident = buildResidentHubActivity({
        inbox: inbox ?? [],
        bookings: bookings ?? [],
      });

      const pendingCount = (inbox ?? []).length;
      const upcomingCount = (bookings ?? []).filter((b) =>
        ["pending", "confirmed"].includes(b?.status),
      ).length;

      setResidentActivity(resident);
      setAdminActivity({ title: "Approval queue", items: [] });
      setBookingCounts({
        myReservationCount: upcomingCount,
        approveRequestCount: pendingCount,
      });
      setHubStats([]);
    } catch {
      setAdminActivity({ title: "Approval queue", items: [] });
      setResidentActivity(EMPTY_RESIDENT_ACTIVITY);
      setBookingCounts({ myReservationCount: 0, approveRequestCount: 0 });
      if (getCurrentRole() === "admin") {
        setHubStats((prev) =>
          prev.length
            ? prev
            : [
                {
                  id: "pending-reviews",
                  label: "Amenity reviews",
                  value: "0",
                  tone: "default",
                  routeKey: "ADMIN_AMENITIES",
                },
                {
                  id: "pending-bookings",
                  label: "Booking requests",
                  value: "0",
                  tone: "default",
                  routeKey: "ADMIN_BOOKINGS",
                },
              ],
        );
      } else {
        setHubStats([]);
      }
    } finally {
      setActivityLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const nextReservation = residentActivity.outgoing.items[0] ?? null;
  const incomingApprovals = residentActivity.incoming.items;
  const showAdminQueue = isAdmin && (adminActivity.items.length > 0 || activityLoading);
  const showResidentInbox = !isAdmin && incomingApprovals.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title="Services" iconOnly />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brandPrimaryDeep}
          />
        }
      >
        {isAdmin && hubStats.length > 0 ? (
          <View style={styles.section}>
            <PropertyHubStats items={hubStats} onAction={goTo} />
          </View>
        ) : null}

        {!isAdmin ? (
          <View style={styles.section}>
            <PropertyHubSectionHeader title="Up next" />
            {activityLoading && !nextReservation ? (
              <SectionLoader label="Checking your schedule…" />
            ) : (
              <PropertyHubUpNext
                nextReservation={nextReservation}
                myReservationCount={bookingCounts.myReservationCount}
                approveRequestCount={bookingCounts.approveRequestCount}
                onAction={goTo}
              />
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <PropertyHubSectionHeader
            title="Explore"
            subtitle={
              isAdmin
                ? "Amenities, marketplace, and community tools"
                : "Book, shop, and community essentials"
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

        {showAdminQueue ? (
          <View style={styles.lastSection}>
            <PropertyHubSectionHeader
              title={adminActivity.title}
              count={adminActivity.items.length || undefined}
              actionLabel={adminActivity.items.length ? "See all" : undefined}
              onAction={adminActivity.items.length ? () => goTo("ADMIN_BOOKINGS") : undefined}
            />
            {adminActivity.items.length > 0 ? (
              <PropertyActivitySection items={adminActivity.items} onAction={handleActivity} />
            ) : (
              <SectionLoader label="Loading approval queue…" />
            )}
          </View>
        ) : null}

        {showResidentInbox ? (
          <View style={styles.lastSection}>
            <PropertyHubSectionHeader
              title={residentActivity.incoming.title}
              count={incomingApprovals.length}
              actionLabel="See all"
              onAction={() => goTo("ADMIN_BOOKINGS")}
            />
            <PropertyActivitySection items={incomingApprovals} onAction={handleActivity} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PropertyHubTheme.screenBg,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(8),
    paddingBottom: sw(24),
  },
  section: {
    marginBottom: sw(20),
  },
  lastSection: {
    marginBottom: 0,
  },
  loaderCard: {
    minHeight: sw(88),
    borderRadius: sw(16),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8ECF2",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(22),
    paddingHorizontal: sw(16),
    ...Platform.select({
      ios: {
        shadowColor: "#101828",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
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
});
