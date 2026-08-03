import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import AppModal from "./app-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { sw, sf } from "../../utils/responsive";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { getUser } from "../../services/auth-session";
import { isGuestUser } from "../../services/community-access";
import { guestCanAccessFeature } from "../../constants/guest-permissions";

const ACTIVE = Colors.brandPrimary;
const INACTIVE = "#6B7280";
const FAB_SIZE = sw(58);
const FAB_MARGIN = sw(16);
const DRAG_THRESHOLD = 6;
const ICON_SIZE = sf(22);
const LABEL_SIZE = sf(9);
const LABEL_LINE = sf(11);

const BASE_NAV_ITEMS = [
  {
    name: "home",
    label: "Home",
    href: "/(tabs)/home",
    icon: { set: "ion", active: "home", inactive: "home-outline" },
  },
  {
    name: "marketplace",
    label: "Market",
    href: "/(tabs)/marketplace",
    icon: { set: "ion", active: "storefront", inactive: "storefront-outline" },
  },
  {
    name: "manage",
    label: "Manage",
    href: PropertyManagementRoutes.HOME,
    icon: { set: "ion", active: "business", inactive: "business-outline" },
  },
  {
    name: "admin",
    label: "Admin",
    href: "/screens/admin-dashboard",
    icon: { set: "ion", active: "shield", inactive: "shield-outline" },
    adminOnly: true,
  },
  {
    name: "create",
    label: "Create",
    isCreate: true,
    icon: { set: "ion", active: "add-circle", inactive: "add-circle-outline" },
  },
  {
    name: "wellness",
    label: "Wellness",
    href: "/(tabs)/wellness",
    icon: { set: "mci", active: "yoga", inactive: "yoga" },
  },
  {
    name: "notices",
    label: "Notice",
    href: "/(tabs)/notices",
    icon: { set: "ion", active: "clipboard", inactive: "clipboard-outline" },
  },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function NavIcon({ item, focused }) {
  const color = focused ? ACTIVE : INACTIVE;
  const { set, active, inactive } = item.icon;
  const name = focused ? active : inactive;

  return (
    <View style={styles.iconSlot}>
      {set === "mci" ? (
        <MaterialCommunityIcons name={name} size={ICON_SIZE} color={color} />
      ) : (
        <Ionicons name={name} size={ICON_SIZE} color={color} />
      )}
    </View>
  );
}

function getActiveTab(segments, pathname) {
  if (pathname?.includes("admin-dashboard") || pathname?.includes("admin-members") || pathname?.includes("admin-listings")) {
    return "admin";
  }
  if (pathname?.includes("property-management")) return "manage";
  const tabIndex = segments[0] === "(tabs)" ? 1 : 0;
  const tab = segments[tabIndex];
  if (!tab || tab === "home") return "home";
  if (tab === "marketplace") return "marketplace";
  if (tab === "wellness") return "wellness";
  if (tab === "notices") return "notices";
  return "home";
}

const FAB_REOPEN_GUARD_MS = 450;

const GUEST_TAB_PERMISSIONS = {
  home: "feed",
  marketplace: "marketplace",
  wellness: "wellness",
  notices: "notices",
};

export default function FloatingNavMenu({ onCreatePress, isCommunityAdmin = false }) {
  const [expanded, setExpanded] = useState(false);
  const [fabSuppressed, setFabSuppressed] = useState(false);
  const [guestUser, setGuestUser] = useState(null);
  const fabGuardTimerRef = useRef(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { width: screenW, height: screenH } = useWindowDimensions();

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

  const navItems = useMemo(() => {
    let items = isCommunityAdmin
      ? BASE_NAV_ITEMS.filter((item) => item.name !== "manage")
      : BASE_NAV_ITEMS.filter((item) => !item.adminOnly);

    if (guestUser && isGuestUser(guestUser)) {
      items = items.filter((item) => {
        if (item.isCreate || item.name === "manage" || item.adminOnly) return false;
        const permissionKey = GUEST_TAB_PERMISSIONS[item.name];
        if (!permissionKey) return true;
        return guestCanAccessFeature(guestUser, permissionKey);
      });
    }

    return items;
  }, [isCommunityAdmin, guestUser]);

  const activeTab = useMemo(() => getActiveTab(segments, pathname), [segments, pathname]);

  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 16 : 10);

  const bounds = useMemo(
    () => ({
      minRight: FAB_MARGIN,
      maxRight: Math.max(FAB_MARGIN, screenW - FAB_SIZE - FAB_MARGIN),
      minBottom: bottomPad + FAB_MARGIN,
      maxBottom: Math.max(bottomPad + FAB_MARGIN, screenH - FAB_SIZE - insets.top - FAB_MARGIN),
    }),
    [screenW, screenH, insets.top, bottomPad],
  );

  const [fabPos, setFabPos] = useState({ right: FAB_MARGIN, bottom: bottomPad + 100 });
  const fabPosRef = useRef(fabPos);
  const dragStartRef = useRef(fabPos);
  const dragMovedRef = useRef(false);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  fabPosRef.current = fabPos;

  const haptic = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const suppressFab = useCallback(() => {
    setFabSuppressed(true);
    if (fabGuardTimerRef.current) {
      clearTimeout(fabGuardTimerRef.current);
    }
    fabGuardTimerRef.current = setTimeout(() => {
      setFabSuppressed(false);
      fabGuardTimerRef.current = null;
    }, FAB_REOPEN_GUARD_MS);
  }, []);

  useEffect(
    () => () => {
      if (fabGuardTimerRef.current) {
        clearTimeout(fabGuardTimerRef.current);
      }
    },
    [],
  );

  const openMenu = useCallback(() => {
    if (fabSuppressed) return;
    haptic();
    setExpanded(true);
  }, [fabSuppressed, haptic]);

  const closeMenu = useCallback(() => {
    haptic();
    setExpanded(false);
    suppressFab();
  }, [haptic, suppressFab]);

  const onPressItem = useCallback(
    (item) => {
      haptic();
      setExpanded(false);
      suppressFab();

      requestAnimationFrame(() => {
        if (item.isCreate) {
          onCreatePress?.();
          return;
        }
        if (item.href) {
          router.push(item.href);
        }
      });
    },
    [haptic, onCreatePress, router, suppressFab],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        dragMovedRef.current = false;
        dragStartRef.current = fabPosRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        dragMovedRef.current = true;
        const { minRight, maxRight, minBottom, maxBottom } = boundsRef.current;
        const start = dragStartRef.current;
        setFabPos({
          right: clamp(start.right - gesture.dx, minRight, maxRight),
          bottom: clamp(start.bottom - gesture.dy, minBottom, maxBottom),
        });
      },
      onPanResponderRelease: () => {
        if (dragMovedRef.current) haptic();
      },
    }),
  ).current;

  const pos = useMemo(
    () => ({
      right: clamp(fabPos.right, bounds.minRight, bounds.maxRight),
      bottom: clamp(fabPos.bottom, bounds.minBottom, bounds.maxBottom),
    }),
    [fabPos, bounds],
  );

  return (
    <>
      {!expanded && !fabSuppressed ? (
        <View
          style={[styles.fab, { right: pos.right, bottom: pos.bottom }]}
          {...panResponder.panHandlers}
        >
          <Pressable
            style={styles.fabPress}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
          >
            <Feather name="menu" size={sf(22)} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      <AppModal visible={expanded} onRequestClose={closeMenu} animationType="fade">
        <Pressable
          style={styles.backdrop}
          onPress={closeMenu}
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
        >
          <View
            pointerEvents="box-none"
            style={[styles.expandedWrap, { paddingBottom: bottomPad + 16 }]}
          >
            <View pointerEvents="auto" style={styles.menuBarRow}>
              <View style={styles.pill}>
                <View style={styles.pillContent}>
                  {navItems.map((item) => {
                    const focused = !item.isCreate && activeTab === item.name;
                    return (
                      <Pressable
                        key={item.name}
                        style={styles.tab}
                        onPress={() => onPressItem(item)}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                      >
                        <NavIcon item={item} focused={focused} />
                        <Text
                          style={[styles.label, focused && styles.labelActive]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {focused ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable style={styles.closeBtn} onPress={closeMenu} accessibilityLabel="Close menu">
                <Feather name="x" size={sf(20)} color="#000000" />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.brandPrimary,
    borderWidth: 0,
    shadowColor: "#148BA6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPress: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "flex-end",
  },
  expandedWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
  },
  menuBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pill: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 16,
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(4),
    paddingVertical: sw(8),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: sw(1),
    paddingVertical: sw(2),
  },
  iconSlot: {
    width: sw(24),
    height: sw(24),
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: sw(3),
    width: "100%",
    textAlign: "center",
    fontFamily: Fonts.medium,
    fontSize: LABEL_SIZE,
    lineHeight: LABEL_LINE,
    color: INACTIVE,
    fontWeight: "500",
    letterSpacing: -0.2,
    ...Platform.select({
      ios: {
        marginTop: sw(2),
      },
      android: {
        includeFontPadding: false,
      },
    }),
  },
  labelActive: {
    color: ACTIVE,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  dot: {
    marginTop: sw(3),
    width: sw(5),
    height: sw(5),
    borderRadius: sw(3),
    backgroundColor: ACTIVE,
  },
  dotSpacer: {
    marginTop: sw(3),
    width: sw(5),
    height: sw(5),
  },
  closeBtn: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(26),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
});
