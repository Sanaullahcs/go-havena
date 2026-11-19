import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  LayoutAnimation,
  UIManager,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "../layout/app-modal";
import { getTopInset } from "../layout/system-chrome";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";

import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { sw } from "../../utils/responsive";
import { navigateAppRoute } from "../../utils/app-navigation";
import { confirmSignOut } from "../../services/sign-out";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { getUser, getCachedUser, subscribeSessionUser } from "../../services/auth-session";
import { isResidentFeatureEnabled } from "../../constants/resident-features";
import { canSwitchModes, canSwitchToAdminMode, currentCommunityId, isCommunityAdmin, isGuestUser, isResidentMode } from "../../services/community-access";
import { fetchMe, switchActiveContext } from "../../services/profile-api";
import { syncRoleFromUser } from "../../constants/role-session";
import { isResidentWithStaff, navigateAfterAuth, STAFF_HOME } from "../../constants/onboarding-routes";
import { formatResidentUnitLabel, getProfileFields } from "../../utils/profile-display";
import ProfilePhotoAvatar from "../profile/profile-photo-avatar";
import HavenaLogo from "./havena-logo";
import HavenaWordmark from "./havena-wordmark";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { wellnessDetailRouteParams } from "../../constants/wellness-categories";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { fetchWellnessHub, getCachedWellnessHub, subscribeWellnessHub } from "../../services/wellness-api";
import { fetchMyFamily } from "../../services/family-api";
import { SidebarWellnessHubSkeleton } from "./skeleton-loader";
import { dismissImageSourcePicker } from "../../providers/image-source-picker-provider";
import { rnShadow } from "../../utils/shadow";


const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_WIDTH = Math.min(SCREEN_WIDTH * 0.86, 340);

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateMenuChange() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      180,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ),
  );
}

function wellnessCategorySignature(categories) {
  return (categories ?? [])
    .map((item) => [item?.key, item?.title, item?.subtitle, item?.iconKey].join("\u0001"))
    .join("\u0002");
}

function DisclosureChevron({ open }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Feather name="chevron-right" size={16} color={open ? "#0F766E" : "#94A3B8"} />
    </Animated.View>
  );
}

function NavRow({ iconName, title, active, badgeCount, depth = 0, danger, open, trailing, onPress }) {
  const color = danger ? "#DC2626" : active ? "#0F766E" : "#334155";
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.navRow,
        depth === 1 && styles.navRowNested,
        depth >= 2 && styles.navRowDeep,
        open && !active && styles.navRowOpen,
        active && styles.navRowActive,
      ]}
    >
      <View
        style={[
          styles.navIcon,
          depth > 0 && styles.navIconNested,
          active && styles.navIconActive,
          danger && styles.navIconDanger,
        ]}
      >
        <Feather name={iconName} size={depth > 0 ? 15 : 17} color={color} />
      </View>
      <Text
        style={[
          styles.navLabel,
          depth > 0 && styles.navLabelNested,
          active && styles.navLabelActive,
          danger && styles.navLabelDanger,
        ]}
        numberOfLines={2}
      >
        {title}
      </Text>
      {badgeCount > 0 ? (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{badgeCount > 99 ? "99+" : badgeCount}</Text>
        </View>
      ) : null}
      {trailing ? <View style={styles.navTrailing}>{trailing}</View> : null}
    </TouchableOpacity>
  );
}

function searchParam(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? "" : String(value);
}

/** Which sidebar row matches the screen the user is actually on. */
function menuKeyFromPath(pathname, params) {
  const path = String(pathname ?? "");
  if (!path || path === "/" || path === "/home" || path.endsWith("/home")) return "home";

  if (path.includes("community-feed")) return "feed";
  if (path.includes("notices")) return "updates";
  if (path.includes("my-community")) return "communities";
  if (path.includes("my-units") || path.includes("admin-units")) return "units";
  if (path.includes("my-family")) return "family";
  if (path.includes("invite-guest")) return "invite";
  if (path.includes("guest-approvals")) return "approvals";
  if (path.includes("my-booking") || path.includes("admin-bookings")) return "bookings";
  if (path.includes("amenity") || path.includes("admin-amenities")) return "amenities";
  if (path.includes("marketplace") || path.includes("community-listings")) return "deals";
  if (path.includes("unit-bills") || path.includes("amenity-bills") || path.includes("payments-history")) return "bills";
  if (path.includes("available-services") || path.includes("admin-service")) return "available-services";
  if (path.includes("complaint")) return "complaints";
  if (path.includes("community-rules")) return "rules";
  if (path.includes("documents")) return "documents";
  if (path.includes("/services") || path.endsWith("/services")) return "service-hub";
  if (path.includes("wellness")) {
    const type = searchParam(params?.type);
    return type ? `wellness-${type}` : "wellness";
  }
  if (path.includes("settings")) return "settings";
  if (path.includes("profile")) return "profile";
  return "home";
}

function groupKeyForMenu(menuKey) {
  if (["feed", "updates", "communities", "units"].includes(menuKey)) return "community";
  if (["family", "invite", "approvals"].includes(menuKey)) return "people";
  if (
    ["service-hub", "amenities", "bookings", "deals", "bills", "available-services", "complaints"].includes(menuKey)
  ) {
    return "services";
  }
  if (["rules", "documents"].includes(menuKey)) return "resources";
  if (menuKey === "wellness" || String(menuKey).startsWith("wellness-")) return "wellness";
  return null;
}

function drawerWidth(screenWidth) {
  if (screenWidth >= 900) return 400;
  if (screenWidth >= 600) return Math.min(380, Math.round(screenWidth * 0.48));
  return Math.min(Math.round(screenWidth * 0.88), 360);
}

function WellnessEmpty({ onExplore }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wellnessEmpty}>
      <View style={styles.wellnessEmptyIcon}>
        <Feather name="heart" size={18} color="#1B4F8A" />
      </View>
      <Text style={styles.wellnessEmptyTitle}>{t("nav.wellnessComingSoon")}</Text>
      <Text style={styles.wellnessEmptyHint}>
        {t("nav.wellnessComingSoonMsg")}
      </Text>
      <Pressable style={styles.wellnessEmptyCta} onPress={onExplore}>
        <Text style={styles.wellnessEmptyCtaText}>{t("nav.browseWellness")}</Text>
        <Feather name="arrow-right" size={14} color="#1B4F8A" />
      </Pressable>
    </View>
  );
}

function resolveTopInset(insets) {
  // RN Modal often reports insets.top = 0 — fall back to window metrics.
  return Math.max(
    getTopInset(insets),
    initialWindowMetrics?.insets?.top ?? 0,
    Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  );
}

export default function SideMenu({ visible, onClose }) {
  if (!visible) return null;

  return (
    <AppModal
      visible
      onRequestClose={onClose}
      statusBarStyle="dark"
      manageOverlayChrome={false}
      animationType="none"
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SideMenuPanel visible onClose={onClose} />
      </SafeAreaProvider>
    </AppModal>
  );
}

const profileLineText = { includeFontPadding: false, overflow: "hidden" };

function getRoleLabelKey(user) {
  if (!user) return "roles.resident";
  if (isGuestUser(user)) return "roles.guest";
  if (isResidentMode(user)) return "roles.resident";
  if (user.role === "community_admin" || user.role === "admin") return "roles.admin";
  return "roles.resident";
}

function SideMenuPanel({ visible, onClose }) {
  const { t } = useTranslation();
  const dialog = useAppDialog();
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const menuWidth = drawerWidth(screenWidth);
  const topInset = resolveTopInset(insets);

  const slideAnim = useRef(new Animated.Value(-menuWidth)).current;
  const navigatingRef = useRef(false);
  const activeMenu = useMemo(
    () => menuKeyFromPath(pathname, routeParams),
    [pathname, routeParams],
  );
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedNested, setExpandedNested] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    const group = groupKeyForMenu(activeMenu);
    setExpandedGroup(group);
    setExpandedNested(activeMenu === "invite" || activeMenu === "approvals" ? "guest" : null);
    return undefined;
  }, [visible, activeMenu]);
  const [user, setUser] = useState(() => getCachedUser());

  useEffect(() => {
    let sawLiveUpdate = false;
    const unsubscribe = subscribeSessionUser((next) => {
      sawLiveUpdate = true;
      setUser(next);
    });
    getUser().then((cached) => {
      if (cached && !sawLiveUpdate) setUser(cached);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchMe();
        if (!cancelled) setUser(data);
      } catch {
        const cached = await getUser();
        if (!cancelled && cached) setUser(cached);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const profile = getProfileFields(user);
  const unitLabel = formatResidentUnitLabel(user, t);
  const roleLabelKey = getRoleLabelKey(user);
  const isNewProfile =
    !profile.avatarUrl ||
    profile.displayName === "My Profile" ||
    profile.displayName === "Neighbor";
  const handleClose = () => {
    dismissImageSourcePicker();
    Animated.timing(slideAnim, {
      toValue: -menuWidth,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const navigateAndClose = (route) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    slideAnim.stopAnimation();
    slideAnim.setValue(-menuWidth);
    dismissImageSourcePicker();
    onClose();

    requestAnimationFrame(() => {
      navigateAppRoute(router, route);
      setTimeout(() => {
        navigatingRef.current = false;
      }, 400);
    });
  };

  const openProfile = () => {
    navigateAndClose("/(tabs)/profile");
  };

  const initialWellnessCategories = getCachedWellnessHub()?.categories ?? [];
  const [wellnessHub, setWellnessHub] = useState(initialWellnessCategories);
  const [wellnessHubLoading, setWellnessHubLoading] = useState(initialWellnessCategories.length === 0);
  const wellnessHubRef = useRef(initialWellnessCategories);
  const [familyPendingCount, setFamilyPendingCount] = useState(0);

  const applyWellnessCategories = useCallback((categories) => {
    const next = categories ?? [];
    if (wellnessCategorySignature(wellnessHubRef.current) === wellnessCategorySignature(next)) {
      return;
    }
    wellnessHubRef.current = next;
    setWellnessHub(next);
  }, []);

  const residentFeaturesSig = user?.resident_features?.features
    ? JSON.stringify(user.resident_features.features)
    : "";

  const wellnessMenuScope = useMemo(() => {
    if (!user) return "pending";
    if (!isResidentFeatureEnabled(user, "wellness")) return "off";
    return `on:${currentCommunityId(user) ?? "none"}:${residentFeaturesSig}`;
  }, [user, residentFeaturesSig]);

  const familyMenuScope = useMemo(() => {
    if (!user || isGuestUser(user)) return "off";
    if (!isResidentFeatureEnabled(user, "family")) return "off";
    return `on:${currentCommunityId(user) ?? "none"}`;
  }, [user]);

  const menuGroups = useMemo(() => {
    const item = (key, iconName, titleKey, route, badgeCount = 0) => ({
      key,
      iconName,
      titleKey,
      route,
      badgeCount,
    });

    const community = [
      isResidentFeatureEnabled(user, "feed")
        ? item("feed", "message-square", "nav.communityFeed", "/screens/community-feed")
        : null,
      isResidentFeatureEnabled(user, "notices") ||
      isResidentFeatureEnabled(user, "events") ||
      isResidentFeatureEnabled(user, "alerts")
        ? item("updates", "bell", "nav.communityUpdates", "/(tabs)/notices")
        : null,
      user && !isGuestUser(user) && !isCommunityAdmin(user)
        ? item(
            "communities",
            "map-pin",
            "nav.myCommunity",
            "/screens/my-community",
            Number(user?.pending_invitation_count) || 0,
          )
        : null,
      user && !isGuestUser(user) && !isCommunityAdmin(user)
        ? item("units", "grid", "nav.myUnits", "/screens/my-units")
        : null,
    ].filter(Boolean);

    const guestChildren = isResidentFeatureEnabled(user, "guest_invites")
      ? [
          item("invite", "user-plus", "nav.inviteGuest", "/screens/invite-guest"),
          item("approvals", "check-square", "nav.guestApprovals", "/screens/guest-approvals"),
        ]
      : [];
    const people =
      user && !isGuestUser(user)
        ? [
            isResidentFeatureEnabled(user, "family")
              ? item("family", "users", "nav.myFamily", "/screens/my-family", familyPendingCount)
              : null,
            guestChildren.length
              ? {
                  key: "guest",
                  iconName: "user-plus",
                  titleKey: "nav.guest",
                  children: guestChildren,
                }
              : null,
          ].filter(Boolean)
        : [];

    const services = [
      isResidentFeatureEnabled(user, "amenities") || isResidentFeatureEnabled(user, "bookings")
        ? item("service-hub", "layout", "nav.serviceHub", PropertyManagementRoutes.HOME)
        : null,
      isResidentFeatureEnabled(user, "amenities")
        ? item("amenities", "star", "services.browseAmenities", PropertyManagementRoutes.AMENITY)
        : null,
      isResidentFeatureEnabled(user, "bookings")
        ? item("bookings", "calendar", "services.myReservations", PropertyManagementRoutes.MY_BOOKING)
        : null,
      isResidentFeatureEnabled(user, "marketplace")
        ? item("deals", "shopping-bag", "nav.marketplace", "/(tabs)/marketplace")
        : null,
      user && !isGuestUser(user)
        ? item(
            "available-services",
            "sliders",
            "services.availableServicesTitle",
            PropertyManagementRoutes.AVAILABLE_SERVICES,
          )
        : null,
      user && !isGuestUser(user)
        ? item(
            "complaints",
            "alert-circle",
            "nav.complaints",
            isCommunityAdmin(user) ? "/screens/admin-complaints" : "/screens/complaints",
          )
        : null,
    ].filter(Boolean);

    const resources = [
      isResidentFeatureEnabled(user, "community_rules")
        ? item("rules", "shield", "services.communityRules", PropertyManagementRoutes.COMMUNITY_RULES)
        : null,
      isResidentFeatureEnabled(user, "documents")
        ? item("documents", "file", "services.documents", PropertyManagementRoutes.DOCUMENTS)
        : null,
    ].filter(Boolean);

    const wellnessOn = isResidentFeatureEnabled(user, "wellness");
    const wellnessChildren = wellnessOn
      ? wellnessHub.map((entry) => {
          const meta = getWellnessCategoryMeta(entry.key);
          return {
            key: `wellness-${entry.key}`,
            iconName: meta.icon,
            titleKey: meta.titleKey || null,
            title: meta.titleKey ? null : entry.title,
            route: {
              pathname: "/(tabs)/wellness/wellness-detail",
              params: wellnessDetailRouteParams(entry),
            },
          };
        })
      : [];

    return [
      { key: "home", iconName: "home", titleKey: "nav.home", route: "/(tabs)/home" },
      isResidentWithStaff(user)
        ? { key: "assigned-tasks", iconName: "clipboard", titleKey: "nav.assignedTasks", route: STAFF_HOME }
        : null,
      community.length
        ? { key: "community", iconName: "users", titleKey: "nav.community", children: community }
        : null,
      people.length
        ? { key: "people", iconName: "user", titleKey: "nav.peopleAccess", children: people }
        : null,
      services.length
        ? { key: "services", iconName: "briefcase", titleKey: "nav.services", children: services }
        : null,
      resources.length
        ? { key: "resources", iconName: "book-open", titleKey: "nav.resources", children: resources }
        : null,
      wellnessOn
        ? {
            key: "wellness",
            iconName: "heart",
            titleKey: "nav.wellnessProgramsMenu",
            children: wellnessChildren,
            loading: wellnessHubLoading && wellnessChildren.length === 0,
            empty: !wellnessHubLoading && wellnessChildren.length === 0,
          }
        : null,
    ].filter(Boolean);
  }, [user, familyPendingCount, wellnessHub, wellnessHubLoading]);

  const placeLine = [profile.communityName, unitLabel].filter(Boolean).join(" - ");

  useEffect(() => {
    if (!visible) {
      slideAnim.setValue(-menuWidth);
      return undefined;
    }

    slideAnim.setValue(-menuWidth);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    return undefined;
  }, [visible, slideAnim, menuWidth]);

  useEffect(() => subscribeWellnessHub((hub) => {
    applyWellnessCategories(hub?.categories ?? []);
    setWellnessHubLoading(false);
  }), [applyWellnessCategories]);

  useEffect(() => {
    if (!visible) return undefined;
    if (wellnessMenuScope === "pending") return undefined;

    if (wellnessMenuScope === "off") {
      applyWellnessCategories([]);
      setWellnessHubLoading(false);
      return undefined;
    }

    const cached = getCachedWellnessHub()?.categories ?? [];
    if (cached.length > 0) {
      applyWellnessCategories(cached);
      setWellnessHubLoading(false);
    } else if (wellnessHubRef.current.length === 0) {
      setWellnessHubLoading(true);
    }

    let cancelled = false;
    fetchWellnessHub()
      .then((hub) => {
        if (!cancelled) applyWellnessCategories(hub?.categories ?? []);
      })
      .catch(() => {
        if (!cancelled && wellnessHubRef.current.length === 0) {
          applyWellnessCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setWellnessHubLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, wellnessMenuScope, applyWellnessCategories]);

  useEffect(() => {
    if (!visible) return undefined;

    if (familyMenuScope === "off") {
      setFamilyPendingCount(0);
      return undefined;
    }

    let cancelled = false;
    fetchMyFamily()
      .then((payload) => {
        if (!cancelled) setFamilyPendingCount(payload?.family?.pending_requests_count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setFamilyPendingCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, familyMenuScope]);

  const openWellness = () => {
    navigateAndClose("/(tabs)/wellness");
  };

  return (
    <>
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { start: menuWidth }]}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t("nav.closeMenu")}
        />

        {/* White band behind status bar so icons stay readable on the drawer */}
        <View style={[styles.statusBarBand, { height: topInset, pointerEvents: "none" }]} />

        <Animated.View
          style={[
            styles.menuContainer,
            { width: menuWidth, transform: [{ translateX: slideAnim }] },
          ]}
        >
          <View style={styles.menuInner}>
            <View style={[styles.drawerHeader, { paddingTop: topInset }]}>
              <View style={styles.headerRow}>
                <View style={styles.brandBlock}>
                  <View style={styles.brandMark}>
                    <HavenaLogo size={36} compact />
                  </View>
                  <View style={styles.brandCopy}>
                    <HavenaWordmark height={20} />
                    <Text style={styles.brandSubtitle}>{t("nav.tagline")}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                  <Feather name="x" size={18} color="#0F172A" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
              style={styles.menuBody}
            >
            <TouchableOpacity style={styles.profileShell} activeOpacity={0.85} onPress={openProfile}>
              <ProfilePhotoAvatar avatarUrl={profile.avatarUrl} size={48} showEditBadge={false} />
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, profileLineText]} numberOfLines={1}>
                  {profile.displayName || profile.displayPhone || t("nav.welcome")}
                </Text>
                {placeLine ? (
                  <Text style={[styles.profileAddress, profileLineText]} numberOfLines={2}>
                    {placeLine}
                  </Text>
                ) : null}
                {!isNewProfile ? (
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText} numberOfLines={1}>
                      {t(roleLabelKey)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Feather name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>{t("nav.mainMenu")}</Text>
            <View style={styles.menuGroup}>
              {menuGroups.map((group) => {
                const open = expandedGroup === group.key;
                return (
                  <View key={group.key}>
                    <NavRow
                      iconName={group.iconName}
                      title={t(group.titleKey)}
                      active={activeMenu === group.key}
                      open={open}
                      onPress={() => {
                        if (!group.children) {
                          navigateAndClose(group.route);
                          return;
                        }
                        animateMenuChange();
                        setExpandedGroup((current) => (current === group.key ? null : group.key));
                        if (expandedGroup === group.key) setExpandedNested(null);
                      }}
                      trailing={group.children ? <DisclosureChevron open={open} /> : null}
                    />
                    {open ? (
                      <View style={styles.subMenu}>
                        {group.loading ? <SidebarWellnessHubSkeleton count={4} /> : null}
                        {group.empty ? <WellnessEmpty onExplore={openWellness} /> : null}
                        {group.children
                          ? group.children.map((child) =>
                              child.children ? (
                                <View key={child.key}>
                                  <NavRow
                                    depth={1}
                                    iconName={child.iconName}
                                    title={t(child.titleKey)}
                                    open={expandedNested === child.key}
                                    active={child.children.some((nested) => nested.key === activeMenu)}
                                    onPress={() => {
                                      animateMenuChange();
                                      setExpandedNested((current) =>
                                        current === child.key ? null : child.key,
                                      );
                                    }}
                                    trailing={<DisclosureChevron open={expandedNested === child.key} />}
                                  />
                                  {expandedNested === child.key ? (
                                    <View style={styles.subMenuDeep}>
                                      {child.children.map((nested) => (
                                        <NavRow
                                          key={nested.key}
                                          depth={2}
                                          iconName={nested.iconName}
                                          title={t(nested.titleKey)}
                                          badgeCount={nested.badgeCount ?? 0}
                                          active={activeMenu === nested.key}
                                          onPress={() => navigateAndClose(nested.route)}
                                        />
                                      ))}
                                    </View>
                                  ) : null}
                                </View>
                              ) : (
                                <NavRow
                                  key={child.key}
                                  depth={1}
                                  iconName={child.iconName}
                                  title={child.titleKey ? t(child.titleKey) : child.title}
                                  badgeCount={child.badgeCount ?? 0}
                                  active={activeMenu === child.key}
                                  onPress={() => navigateAndClose(child.route)}
                                />
                              ),
                            )
                          : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.footer}>
              {canSwitchModes(user) ? (
                <NavRow
                  iconName={isResidentMode(user) ? "shield" : "home"}
                  title={
                    canSwitchToAdminMode(user)
                      ? t("nav.returnToAdminMode")
                      : t("nav.switchToResidentMode")
                  }
                  onPress={() => {
                    const switchingToResident = !isResidentMode(user);
                    const communityId =
                      currentCommunityId(user) ?? user?.resident_mode_communities?.[0]?.id;

                    dismissImageSourcePicker();
                    slideAnim.stopAnimation();
                    slideAnim.setValue(-menuWidth);
                    onClose();

                    setTimeout(async () => {
                      const choice = await dialog.showConfirm(
                        switchingToResident
                          ? t("nav.switchToResidentTitle")
                          : t("nav.returnToAdminTitle"),
                        switchingToResident
                          ? t("nav.switchToResidentBody")
                          : t("nav.returnToAdminBody"),
                        {
                          confirmLabel: t("nav.switchModeConfirm"),
                          cancelLabel: t("common.cancel"),
                        },
                      );
                      if (choice !== "confirm") return;

                      try {
                        const next = await switchActiveContext(
                          switchingToResident ? "resident" : "community_admin",
                          communityId,
                        );
                        syncRoleFromUser(next);
                        setUser(next);
                        navigateAfterAuth(router, next, { mode: "login" });
                        setTimeout(() => {
                          void dialog.showSuccess(
                            switchingToResident
                              ? t("nav.switchedToResidentTitle")
                              : t("nav.switchedToAdminTitle"),
                            switchingToResident
                              ? t("nav.switchedToResidentBody")
                              : t("nav.switchedToAdminBody"),
                          );
                        }, 280);
                      } catch (err) {
                        await dialog.showError(
                          t("nav.couldNotSwitchMode"),
                          err?.message || t("common.tryAgain"),
                        );
                      }
                    }, 120);
                  }}
                />
              ) : null}
              <NavRow
                iconName="user"
                title={t("nav.profile")}
                active={activeMenu === "profile"}
                onPress={() => navigateAndClose("/(tabs)/profile")}
              />
              <NavRow
                iconName="settings"
                title={t("settings.title")}
                active={activeMenu === "settings"}
                onPress={() => navigateAndClose("/screens/settings")}
              />
              <NavRow
                danger
                iconName="log-out"
                title={t("settings.logOut")}
                onPress={() => {
                  dismissImageSourcePicker();
                  slideAnim.stopAnimation();
                  slideAnim.setValue(-menuWidth);
                  onClose();
                  setTimeout(() => confirmSignOut(dialog), 120);
                }}
              />
            </View>
          </ScrollView>
          </View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    end: 0,
    bottom: 0,
    start: MENU_WIDTH,
    zIndex: 3,
    ...Platform.select({
      android: { elevation: 3 },
      ios: {},
    }),
  },
  statusBarBand: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 4,
    ...Platform.select({
      android: { elevation: 4 },
      ios: {},
    }),
  },
  menuContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    width: MENU_WIDTH,
    backgroundColor: "#FFFFFF",
    zIndex: 5,
    borderEndWidth: StyleSheet.hairlineWidth,
    borderEndColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 4, height: 0 }, opacity: 0.1, radius: 12 }),
      },
      android: { elevation: 10 },
    }),
  },
  menuInner: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EEF5",
  },
  menuBody: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  profileShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EEF5",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 18,
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.04, radius: 10 }),
  },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    lineHeight: 14,
    color: "#047857",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  navRowNested: {
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navRowDeep: {
    minHeight: 40,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  navRowOpen: {
    backgroundColor: "#F8FAFC",
  },
  navRowActive: {
    backgroundColor: "#E7F8F4",
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  navIconNested: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EEF5",
  },
  navIconActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  navIconDanger: {
    backgroundColor: "#FEF2F2",
    borderWidth: 0,
  },
  subMenu: {
    marginStart: 22,
    marginTop: 2,
    marginBottom: 4,
    paddingStart: 8,
    paddingVertical: 2,
    gap: 2,
  },
  subMenuDeep: {
    marginStart: 34,
    marginTop: 2,
    marginBottom: 2,
    gap: 2,
  },
  navLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: "#1E293B",
  },
  navLabelNested: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    lineHeight: 18,
    color: "#475569",
  },
  navLabelActive: {
    color: "#0F172A",
    fontFamily: Fonts.semiBold,
  },
  navLabelDanger: {
    color: "#DC2626",
  },
  navTrailing: {
    width: 18,
    alignItems: "flex-end",
  },
  navBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  navBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    color: "#FFFFFF",
  },
  footer: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EEF5",
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  brandMark: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  brandCopy: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  brandSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 18,
    flexShrink: 1,
    includeFontPadding: true,
  },
  closeBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(11),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E8EEF5",
    alignItems: "center",
    justifyContent: "center",
  },

  profileGradient: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8EEF5",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  profileAvatarWrapper: {
    marginEnd: 12,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4,
  },
  profileLine: {
    alignSelf: "stretch",
    overflow: "hidden",
  },
  profileName: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 24,
  },
  profileAddress: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 20,
  },
  profileRole: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "#1B4F8A",
    fontWeight: "600",
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94A3B8",
    marginBottom: 8,
    marginStart: 12,
  },
  communitySwitch: {
    marginBottom: 16,
  },
  communityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  communityRowOn: {
    backgroundColor: "#F0FDFA",
    borderColor: "rgba(20, 184, 166, 0.4)",
  },
  communityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#CBD5E1",
  },
  communityDotOn: {
    backgroundColor: "#14B8A6",
  },
  communityRowText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#475569",
  },
  communityRowTextOn: {
    fontFamily: Fonts.semiBold,
    color: "#0F172A",
  },
  menuGroup: {
    marginBottom: 0,
    gap: 2,
  },
  wellnessGroup: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: "#FFFFFF",
    gap: 2,
  },
  wellnessEmpty: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  wellnessEmptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  wellnessEmptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  wellnessEmptyHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 12,
  },
  wellnessEmptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
  },
  wellnessEmptyCtaText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#1B4F8A",
    fontWeight: "600",
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  menuItemActive: {
    backgroundColor: "#1B4F8A",
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginEnd: 12,
    flexShrink: 0,
  },
  iconBoxInactive: {
    backgroundColor: "#F1F5F9",
  },
  iconBoxActive: {
    backgroundColor: "#FFFFFF",
  },
  iconBoxBlue: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  iconBoxTint: {
    borderWidth: 0,
  },
  menuItemLabel: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  menuItemText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    color: "#334155",
    includeFontPadding: true,
    textAlignVertical: "center",
    flexShrink: 1,
  },
  menuItemTextActive: {
    color: "#FFFFFF",
  },
  menuBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
  },

  bottomActions: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  actionRowLast: {
    borderBottomWidth: 0,
  },
  actionRowMode: {
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.roleAdminBg,
    borderWidth: 1,
    borderColor: Colors.borderInput,
  },
  actionIconMode: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderInput,
  },
  actionLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E8EEF5",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  actionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 20,
  },
  actionTextMode: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  actionTextDanger: {
    color: "#DC2626",
  },
});
