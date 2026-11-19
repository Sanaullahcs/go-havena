import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { Colors } from "../../constants/tokens";
import { sw, sf } from "../../utils/responsive";
import { homeSize } from "../../constants/home-styles";
import { isGuestUser, canAccessDashboard } from "../../services/community-access";
import { useSessionUser } from "../../hooks/use-session-user";
import { canOfferCreateAction } from "../../constants/resident-features";
import { guestCanAccessFeature } from "../../constants/guest-permissions";
import { navigateAppRoute } from "../../utils/app-navigation";
import { useKeyboardVisible } from "./keyboard-safe-screen";
import { shouldHideTabBar } from "../../constants/tab-bar-visibility";
import { isPropertyManagementRootPath } from "../../constants/property-management-routes";
import { rnShadow } from "../../utils/shadow";


const BRAND = Colors.brandPrimary;
const ACTIVE = BRAND;
const INACTIVE = T.gray;
const ICON_SIZE = sf(22);
const LABEL_SIZE = sf(9);

const HOME_TAB = {
  name: "home",
  labelKey: "nav.home",
  href: "/home",
  icon: { set: "ion", active: "home", inactive: "home-outline" },
};

const COMMUNITY_TAB = {
  name: "community",
  labelKey: "nav.community",
  href: "/community",
  icon: { set: "ion", active: "people", inactive: "people-outline" },
};

const SERVICES_TAB = {
  name: "services",
  labelKey: "nav.services",
  href: "/(tabs)/services",
  icon: { set: "ion", active: "grid", inactive: "grid-outline" },
};

const PROFILE_TAB = {
  name: "profile",
  labelKey: "nav.profile",
  href: "/(tabs)/profile",
  icon: { set: "ion", active: "person", inactive: "person-outline" },
};

const ADMIN_TAB = {
  name: "admin",
  labelKey: "nav.admin",
  href: "/screens/admin-dashboard",
  icon: { set: "ion", active: "shield", inactive: "shield-outline" },
};

const GUEST_TAB_PERMISSIONS = {
  home: "feed",
  community: "feed",
};

function NavIcon({ item, focused }) {
  const color = focused ? ACTIVE : INACTIVE;
  const { set, active, inactive } = item.icon;
  const name = focused ? active : inactive;

  if (set === "mci") {
    return <MaterialCommunityIcons name={name} size={ICON_SIZE} color={color} />;
  }
  return <Ionicons name={name} size={ICON_SIZE} color={color} />;
}

function getActiveTab(segments, pathname) {
  if (pathname?.includes("admin-dashboard") || pathname?.includes("admin-members")) {
    return "admin";
  }
  if (
    segments.includes("services") ||
    pathname?.includes("property-management") ||
    pathname?.includes("admin-bookings") ||
    pathname?.includes("admin-amenities")
  ) {
    return "services";
  }

  const tabIndex = segments[0] === "(tabs)" ? 1 : 0;
  const tab = segments[tabIndex];

  if (!tab || tab === "home") return "home";
  if (tab === "community") return "community";
  if (tab === "marketplace") return "community";
  if (tab === "services") return "services";
  if (tab === "profile") return "profile";
  if (tab === "notices" || tab === "wellness") return "home";

  if (
    pathname === "/profile" ||
    pathname === "/(tabs)/profile" ||
    pathname?.startsWith("/screens/profile")
  ) {
    return "profile";
  }

  return "home";
}

/**
 * Bottom tabs by role:
 * Resident — Home | Community | Create | Services | Profile
 * Admin    — Home | Community | Create | Admin | Services
 */
export default function FloatingNavMenu({ onCreatePress, isCommunityAdmin = false }) {
  const { t } = useTranslation();
  const keyboardVisible = useKeyboardVisible();
  const sessionUser = useSessionUser();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fabSize = homeSize(48, screenWidth);
  const fabRadius = homeSize(15, screenWidth);
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  const isGuest = Boolean(sessionUser && isGuestUser(sessionUser));

  const filterTabs = useCallback(
    (tabs) => {
      if (!isGuest) return tabs;
      return tabs.filter((item) => {
        if (item.name === "home") {
          return true;
        }
        if (item.name === "community") {
          return (
            guestCanAccessFeature(sessionUser, "feed") ||
            guestCanAccessFeature(sessionUser, "marketplace")
          );
        }
        const permissionKey = GUEST_TAB_PERMISSIONS[item.name];
        if (!permissionKey) return true;
        return guestCanAccessFeature(sessionUser, permissionKey);
      });
    },
    [sessionUser, isGuest],
  );

  const leftTabs = useMemo(
    () => filterTabs([HOME_TAB, COMMUNITY_TAB]),
    [filterTabs],
  );

  const showCreate = canOfferCreateAction(sessionUser, {
    isAdmin: isCommunityAdmin,
    allowResidentEvent: !isCommunityAdmin && canAccessDashboard(sessionUser),
  });

  const rightTabs = useMemo(() => {
    const tabs = isCommunityAdmin
      ? [ADMIN_TAB, SERVICES_TAB]
      : [SERVICES_TAB, PROFILE_TAB];
    return filterTabs(tabs);
  }, [isCommunityAdmin, filterTabs]);

  const activeTab = useMemo(
    () => getActiveTab(segments, pathname),
    [segments, pathname],
  );
  const bottomPad = Math.max(insets.bottom, 8);

  const haptic = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const onTabPress = useCallback(
    (item) => {
      haptic();
      if (!item.href) return;
      // Always navigate for tab switches — dismissTo fails across sibling tabs.
      if (item.name === "admin") {
        navigateAppRoute(router, item.href);
        return;
      }
      // Always land on the Services hub, not a leftover amenity/booking screen.
      if (item.name === "services") {
        const path = String(pathname ?? "");
        const insideServices =
          path.includes("/services/") ||
          /\/services$/.test(path) ||
          isPropertyManagementRootPath(path);
        if (insideServices && path !== "/services" && !path.endsWith("/services/index")) {
          try {
            router.dismissTo("/(tabs)/services");
            return;
          } catch {
            // The hub is not in this stack. Open the tab directly.
          }
        }
        navigateAppRoute(router, item.href);
        return;
      }
      navigateAppRoute(router, item.href);
    },
    [haptic, router, pathname],
  );

  const onCenterPress = useCallback(() => {
    haptic();
    onCreatePress?.();
  }, [haptic, onCreatePress]);

  const hideTabBar = shouldHideTabBar(pathname, { keyboardVisible });

  if (hideTabBar) {
    return null;
  }

  const renderCreateButton = () => (
    <View style={[styles.fabShell, Platform.OS === "ios" && styles.fabShellIos]}>
      {Platform.OS === "ios" ? null : <View style={styles.fabHalo} />}
      <View style={[styles.fabRing, Platform.OS === "ios" && styles.fabRingIos]}>
        <View style={[styles.fab, { width: fabSize, height: fabSize, borderRadius: fabRadius }]}>
          <Ionicons name="add" size={sf(28)} color={T.white} />
        </View>
      </View>
    </View>
  );

  const renderTab = (item) => {
    const focused = activeTab === item.name;
    const label = t(item.labelKey);
    return (
      <Pressable
        key={item.name}
        style={styles.tab}
        onPress={() => onTabPress(item)}
        accessibilityRole="tab"
        accessibilityLabel={label}
      >
        <NavIcon item={item} focused={focused} />
        <Text
          style={[styles.label, focused && styles.labelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const leftSpacerCount = Math.max(0, 2 - leftTabs.length);
  const rightSpacerCount = Math.max(0, 2 - rightTabs.length);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad }]}>
      <View style={styles.barContent}>
        {leftTabs.map(renderTab)}
        {Array.from({ length: leftSpacerCount }).map((_, index) => (
          <View key={`left-spacer-${index}`} style={styles.tabSpacer} />
        ))}

        {showCreate ? (
          <Pressable
            style={[styles.fabTab, Platform.OS === "ios" && styles.fabTabIos]}
            onPress={onCenterPress}
            hitSlop={Platform.OS === "ios" ? { top: sw(28), left: sw(8), right: sw(8) } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t("nav.create")}
          >
            {Platform.OS === "ios" ? (
              <View style={styles.fabSlotIos} pointerEvents="none" collapsable={false}>
                {renderCreateButton()}
              </View>
            ) : (
              renderCreateButton()
            )}
            <Text style={styles.fabLabel} numberOfLines={1}>{t("nav.create")}</Text>
          </Pressable>
        ) : null}

        {Array.from({ length: rightSpacerCount }).map((_, index) => (
          <View key={`right-spacer-${index}`} style={styles.tabSpacer} />
        ))}
        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: T.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
    ...(Platform.OS === "ios"
      ? {
          width: "100%",
          alignSelf: "stretch",
          marginHorizontal: 0,
          paddingHorizontal: 0,
          borderRadius: 0,
          overflow: "visible",
        }
      : { elevation: 8 }),
  },
  barContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: sw(8),
    paddingHorizontal: sw(4),
  },
  tab: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(5),
  },
  tabSpacer: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  label: {
    marginTop: sw(2),
    maxWidth: "100%",
    fontFamily: Fonts.medium,
    fontSize: LABEL_SIZE,
    lineHeight: sf(16),
    color: INACTIVE,
    fontWeight: "500",
    textAlign: "center",
    includeFontPadding: true,
    paddingHorizontal: 1,
  },
  labelActive: {
    color: ACTIVE,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  fabTab: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: -sw(10),
    paddingBottom: sw(2),
  },
  fabTabIos: {
    marginTop: 0,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  fabSlotIos: {
    height: ICON_SIZE,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
    overflow: "visible",
  },
  fabShell: {
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        backgroundColor: "transparent",
      },
      android: { elevation: 6 },
    }),
  },
  fabShellIos: {
    position: "absolute",
    bottom: 0,
    transform: [{ translateY: sw(2) }],
    backgroundColor: "transparent",
    overflow: "visible",
  },
  fabHalo: {
    position: "absolute",
    width: sw(62),
    height: sw(62),
    borderRadius: sw(20),
    backgroundColor: "rgba(27, 79, 138, 0.14)",
  },
  fabRing: {
    padding: sw(3),
    borderRadius: sw(18),
    backgroundColor: "#E6F1F3",
    borderWidth: 2,
    borderColor: "#B4CED6",
  },
  fabRingIos: {
    backgroundColor: "transparent",
    borderColor: "#B4CED6",
    ...rnShadow({ color: "#163A66", offset: { width: 0, height: 5 }, opacity: 0.18, radius: 12 }),
  },
  fab: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(15),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#163A66",
  },
  fabLabel: {
    marginTop: sw(4),
    maxWidth: "100%",
    fontFamily: Fonts.bold,
    fontSize: LABEL_SIZE,
    lineHeight: sf(15),
    color: BRAND,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: true,
  },
});
