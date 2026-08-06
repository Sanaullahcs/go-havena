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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import ScreenHeader from "../layout/screen-header";
import PropertyHubSectionHeader from "../property/property-hub-section-header";
import PropertyHubStats from "../property/property-hub-stats";
import PropertyHubUpNext from "../property/property-hub-up-next";
import PropertyQuickGrid from "../property/property-quick-grid";
import PropertyActivitySection from "../property/property-activity-section";
import { PropertyManagementRoutes, navigatePropertyHubRoute } from "../../constants/property-management-routes";
import { getCurrentRole } from "../../constants/role-session";
import { Fonts } from "../../constants/font";
import { Layout } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";
import {
  PropertyHubTheme,
  getPropertyHubServices,
  getPropertyHubHeroCopy,
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
      <ActivityIndicator size="small" color={PropertyHubTheme.teal} />
      <Text style={styles.loaderText}>{label}</Text>
    </View>
  );
}

function ServicesHero({ title, subtitle, isAdmin }) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroAccent} />
      <View style={styles.heroBody}>
        <View style={styles.heroRow}>
          <View style={styles.heroIconWrap}>
            <Feather name="layers" size={sf(20)} color={PropertyHubTheme.teal} />
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {title}
              </Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{isAdmin ? "Admin" : "Resident"}</Text>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function PropertyManagment() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const contentMaxWidth = Math.min(windowWidth, isWide ? 720 : windowWidth);

  const [isAdmin, setIsAdmin] = useState(() => getCurrentRole() === "admin");
  const hubServices = useMemo(() => getPropertyHubServices(isAdmin), [isAdmin]);
  const heroCopy = useMemo(() => getPropertyHubHeroCopy(isAdmin), [isAdmin]);

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
      <ScreenHeader
        layout="stacked"
        title="Services"
        subtitle={isAdmin ? "Manage community resources" : "Amenities, bookings, and more"}
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
        <ServicesHero
          title={heroCopy.title}
          subtitle={heroCopy.subtitle}
          isAdmin={isAdmin}
        />

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
                ? "Amenities, documents, and community tools"
                : "Book, add amenities, and community essentials"
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
    paddingTop: sw(4),
    paddingBottom: sw(28),
  },
  heroCard: {
    flexDirection: "row",
    backgroundColor: PropertyHubTheme.heroBg,
    borderRadius: sw(16),
    marginBottom: sw(20),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.heroBorder,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.text,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  heroAccent: {
    width: sw(4),
    alignSelf: "stretch",
    backgroundColor: PropertyHubTheme.heroAccent,
  },
  heroBody: {
    flex: 1,
    paddingHorizontal: sw(16),
    paddingVertical: sw(16),
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  heroTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "stretch",
    gap: sw(8),
    marginBottom: sw(6),
  },
  heroIconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.iconWell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.iconBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroBadge: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    backgroundColor: PropertyHubTheme.mint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.iconBorder,
  },
  heroBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: PropertyHubTheme.deepTeal,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: PropertyHubTheme.heroText,
    fontWeight: "700",
    textAlign: "left",
  },
  heroSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.heroSubtext,
    textAlign: "left",
    alignSelf: "stretch",
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
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
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
