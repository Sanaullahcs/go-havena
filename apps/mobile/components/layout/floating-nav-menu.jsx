import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { Colors } from "../../constants/tokens";
import { sw, sf } from "../../utils/responsive";
import { getUser } from "../../services/auth-session";
import { isGuestUser } from "../../services/community-access";
import { guestCanAccessFeature } from "../../constants/guest-permissions";
import { navigateAppRoute } from "../../utils/app-navigation";
import { useKeyboardVisible } from "./keyboard-safe-screen";
import { shouldHideTabBar } from "../../constants/tab-bar-visibility";

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
  const [guestUser, setGuestUser] = useState(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getUser();
      if (!cancelled) setGuestUser(user);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const filterTabs = useCallback(
    (tabs) => {
      if (!guestUser || !isGuestUser(guestUser)) return tabs;
      return tabs.filter((item) => {
        if (item.name === "community") {
          return (
            guestCanAccessFeature(guestUser, "feed") ||
            guestCanAccessFeature(guestUser, "marketplace")
          );
        }
        const permissionKey = GUEST_TAB_PERMISSIONS[item.name];
        if (!permissionKey) return true;
        return guestCanAccessFeature(guestUser, permissionKey);
      });
    },
    [guestUser],
  );

  const leftTabs = useMemo(
    () => filterTabs([HOME_TAB, COMMUNITY_TAB]),
    [filterTabs],
  );

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
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 4);

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
      // Prefer hub root for Services so nested amenity/docs screens don't stick.
      if (item.name === "services") {
        router.navigate("/(tabs)/services");
        return;
      }
      router.navigate(item.href);
    },
    [haptic, router],
  );

  const onCenterPress = useCallback(() => {
    haptic();
    onCreatePress?.();
  }, [haptic, onCreatePress]);

  const hideTabBar = shouldHideTabBar(pathname, { keyboardVisible });

  if (hideTabBar) {
    return null;
  }

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
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad }]}>
      <View style={styles.barContent}>
        {leftTabs.map(renderTab)}

        <Pressable
          style={styles.fabTab}
          onPress={onCenterPress}
          accessibilityRole="button"
          accessibilityLabel={t("nav.create")}
        >
          <View style={styles.fabShell}>
            <View style={styles.fabHalo} />
            <View style={styles.fabRing}>
              <LinearGradient
                colors={[BRAND, "#163A66"]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.fab}
              >
                <View style={styles.fabSheen} />
                <Ionicons name="add" size={sf(28)} color={T.white} />
              </LinearGradient>
            </View>
          </View>
          <Text style={styles.fabLabel}>{t("nav.create")}</Text>
        </Pressable>

        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: T.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        }
      : { elevation: 8 }),
  },
  barContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: sw(8),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(5),
  },
  label: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: LABEL_SIZE,
    // Noto Arabic clips with Inter-tuned 12px LH on small phones.
    lineHeight: sf(15),
    color: INACTIVE,
    fontWeight: "500",
    textAlign: "center",
    includeFontPadding: true,
  },
  labelActive: {
    color: ACTIVE,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  fabTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: -sw(10),
    paddingBottom: sw(2),
  },
  fabShell: {
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
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
    backgroundColor: "#E8F0F7",
    borderWidth: 2,
    borderColor: T.white,
  },
  fab: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(15),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fabSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  fabLabel: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: LABEL_SIZE,
    lineHeight: sf(15),
    color: BRAND,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: true,
  },
});
