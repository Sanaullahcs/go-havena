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
import * as Haptics from "expo-haptics";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf } from "../../utils/responsive";
import { getUser } from "../../services/auth-session";
import { isGuestUser } from "../../services/community-access";
import { guestCanAccessFeature } from "../../constants/guest-permissions";
import { navigateAppRoute } from "../../utils/app-navigation";

const ACTIVE = T.teal;
const INACTIVE = T.gray;
const ICON_SIZE = sf(22);
const LABEL_SIZE = sf(9);

const HOME_TAB = {
  name: "home",
  label: "Home",
  href: "/home",
  icon: { set: "ion", active: "home", inactive: "home-outline" },
};

const COMMUNITY_TAB = {
  name: "community",
  label: "Community",
  href: "/community",
  icon: { set: "ion", active: "people", inactive: "people-outline" },
};

const SERVICES_TAB = {
  name: "services",
  label: "Services",
  href: "/services",
  icon: { set: "ion", active: "grid", inactive: "grid-outline" },
};

const PROFILE_TAB = {
  name: "profile",
  label: "Profile",
  href: "/profile",
  icon: { set: "ion", active: "person", inactive: "person-outline" },
};

const ADMIN_TAB = {
  name: "admin",
  label: "Admin",
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
      router.navigate(item.href);
    },
    [haptic, router],
  );

  const onCenterPress = useCallback(() => {
    haptic();
    onCreatePress?.();
  }, [haptic, onCreatePress]);

  const renderTab = (item) => {
    const focused = activeTab === item.name;
    return (
      <Pressable
        key={item.name}
        style={styles.tab}
        onPress={() => onTabPress(item)}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
      >
        <NavIcon item={item} focused={focused} />
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
          {item.label}
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
          accessibilityLabel="Create new"
        >
          <View style={styles.fab}>
            <Ionicons name="add" size={sf(26)} color="#FFFFFF" />
          </View>
          <Text style={styles.fabLabel}>Create</Text>
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
    paddingTop: sw(6),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(4),
  },
  label: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: LABEL_SIZE,
    lineHeight: sf(12),
    color: INACTIVE,
    fontWeight: "500",
    textAlign: "center",
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  labelActive: {
    color: ACTIVE,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  fabTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(4),
  },
  fab: {
    width: sw(42),
    height: sw(42),
    borderRadius: sw(21),
    backgroundColor: T.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  fabLabel: {
    fontFamily: Fonts.medium,
    fontSize: LABEL_SIZE,
    lineHeight: sf(12),
    color: T.teal,
    fontWeight: "500",
    textAlign: "center",
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
});
