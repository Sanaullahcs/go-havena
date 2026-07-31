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
import ScreenHeader from "../../../components/layout/screen-header";
import PropertyHubSectionHeader from "../../../components/property/property-hub-section-header";
import PropertyHubHero from "../../../components/property/property-hub-hero";
import PropertyHubStats from "../../../components/property/property-hub-stats";
import PropertyHubEmpty from "../../../components/property/property-hub-empty";
import PropertyHubBookingShortcuts from "../../../components/property/property-hub-booking-shortcuts";
import PropertyQuickGrid from "../../../components/property/property-quick-grid";
import PropertyServiceList from "../../../components/property/property-service-list";
import PropertyActivitySection from "../../../components/property/property-activity-section";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { getCurrentRole } from "../../../constants/role-session";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { sf, sw } from "../../../utils/responsive";
import {
  PropertyHubTheme,
  PROPERTY_COMMUNITY_SERVICES,
  getPropertyQuickActions,
} from "../../../constants/property-management-theme";
import {
  fetchMyBookings,
  fetchBookingInbox,
  fetchAdminAmenities,
} from "../../../services/amenity-api";
import {
  buildPropertyHubActivity,
  buildResidentHubActivity,
} from "../../../utils/property-hub-activity";

const ROUTES = PropertyManagementRoutes;

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
  const quickActions = useMemo(() => getPropertyQuickActions(isAdmin), [isAdmin]);

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
      setHubStats([
        {
          id: "approve-requests",
          label: "To approve",
          value: String(pendingCount),
          tone: pendingCount ? "pending" : "default",
          routeKey: "ADMIN_BOOKINGS",
        },
        {
          id: "my-reservations",
          label: "Active reservations",
          value: String(upcomingCount),
          tone: upcomingCount ? "success" : "default",
          routeKey: "MY_BOOKING",
        },
      ]);
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
    const route = ROUTES[routeKey];
    if (route) router.push(route);
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

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title="Property Management" iconOnly />

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
        <PropertyHubHero isAdmin={isAdmin} />

        {isAdmin && hubStats.length > 0 ? (
          <View style={styles.section}>
            <PropertyHubStats items={hubStats} onAction={goTo} />
          </View>
        ) : null}

        {!isAdmin ? (
          <View style={styles.section}>
            <PropertyHubSectionHeader title="Bookings" />
            <PropertyHubBookingShortcuts
              myReservationCount={bookingCounts.myReservationCount}
              approveRequestCount={bookingCounts.approveRequestCount}
              onAction={goTo}
            />
          </View>
        ) : null}


        <View style={styles.section}>
          <PropertyHubSectionHeader title={isAdmin ? "Admin tools" : "Quick actions"} />
          <PropertyQuickGrid actions={quickActions} onAction={goTo} />
        </View>

        <View style={styles.section}>
          <PropertyHubSectionHeader title="Community" />
          <PropertyServiceList services={PROPERTY_COMMUNITY_SERVICES} onAction={goTo} />
        </View>

        {isAdmin ? (
          <View style={styles.lastSection}>
            <PropertyHubSectionHeader
              title={adminActivity.title}
              count={adminActivity.items.length || undefined}
              actionLabel={adminActivity.items.length ? "See all" : undefined}
              onAction={adminActivity.items.length ? () => goTo("ADMIN_BOOKINGS") : undefined}
            />
            {adminActivity.items.length > 0 ? (
              <PropertyActivitySection items={adminActivity.items} onAction={handleActivity} />
            ) : activityLoading ? (
              <SectionLoader label="Loading approval queue…" />
            ) : (
              <PropertyHubEmpty isAdmin onAction={goTo} />
            )}
          </View>
        ) : (
          <>
            {residentActivity.incoming.items.length > 0 ? (
              <View style={styles.section}>
                <PropertyHubSectionHeader
                  title={residentActivity.incoming.title}
                  count={residentActivity.incoming.items.length}
                  actionLabel="See all"
                  onAction={() => goTo("ADMIN_BOOKINGS")}
                />
                <PropertyActivitySection
                  items={residentActivity.incoming.items}
                  onAction={handleActivity}
                />
              </View>
            ) : null}

            <View style={styles.lastSection}>
              <PropertyHubSectionHeader
                title={residentActivity.outgoing.title}
                subtitle="Track status for places you’ve booked"
                actionLabel={residentActivity.outgoing.items.length ? "See all" : undefined}
                onAction={
                  residentActivity.outgoing.items.length ? () => goTo("MY_BOOKING") : undefined
                }
              />
              {residentActivity.outgoing.items.length > 0 ? (
                <PropertyActivitySection
                  items={residentActivity.outgoing.items}
                  onAction={handleActivity}
                />
              ) : activityLoading ? (
                <SectionLoader label="Loading your reservations…" />
              ) : (
                <PropertyHubEmpty
                  isAdmin={false}
                  onAction={goTo}
                  variant="reservations-only"
                />
              )}
            </View>
          </>
        )}
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
    paddingTop: sw(12),
    paddingBottom: sw(40),
  },
  section: {
    marginBottom: sw(26),
  },
  lastSection: {
    marginBottom: sw(8),
  },
  loaderCard: {
    minHeight: sw(140),
    borderRadius: sw(16),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8ECF2",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(28),
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
