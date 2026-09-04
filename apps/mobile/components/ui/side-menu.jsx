import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
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

import { useRouter } from "expo-router";
import { sw } from "../../utils/responsive";
import { chevronForward, arrowForward } from "../../utils/rtl";
import { navigateAppRoute } from "../../utils/app-navigation";
import { confirmSignOut } from "../../services/sign-out";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { getUser, getCachedUser } from "../../services/auth-session";
import { isGuestUser } from "../../services/community-access";
import { fetchMe } from "../../services/profile-api";
import { getProfileFields } from "../../utils/profile-display";
import ProfilePhotoAvatar from "../profile/profile-photo-avatar";
import HavenaLogo from "./havena-logo";
import HavenaWordmark from "./havena-wordmark";
import { useProfilePhoto } from "../../hooks/use-profile-photo";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { wellnessDetailRouteParams } from "../../constants/wellness-categories";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { fetchWellnessHub } from "../../services/wellness-api";
import { fetchMyFamily } from "../../services/family-api";
import { SidebarWellnessHubSkeleton } from "./skeleton-loader";
import { dismissImageSourcePicker } from "../../providers/image-source-picker-provider";
import { rnShadow } from "../../utils/shadow";


const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_WIDTH = Math.min(SCREEN_WIDTH * 0.86, 340);

const MenuItem = ({
  iconName,
  title,
  isActive,
  isBlueBox,
  iconColor,
  iconBg,
  badgeCount,
  onPress,
}) => {
  const tinted = Boolean(iconColor && iconBg);
  const boxStyle = isActive
    ? styles.iconBoxActive
    : tinted
      ? [styles.iconBoxTint, { backgroundColor: iconBg }]
      : isBlueBox
        ? styles.iconBoxBlue
        : styles.iconBoxInactive;
  const glyphColor = isActive
    ? "#1B4F8A"
    : tinted
      ? iconColor
      : isBlueBox
        ? "#0F172A"
        : "#475569";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.menuItem, isActive && styles.menuItemActive]}
    >
      <View style={[styles.iconBox, boxStyle]}>
        <Feather name={iconName} size={16} color={glyphColor} />
      </View>
      <View style={styles.menuItemLabel}>
        <Text
          style={[styles.menuItemText, isActive && styles.menuItemTextActive]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
      {badgeCount > 0 ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badgeCount > 99 ? "99+" : badgeCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

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
        <Feather name={arrowForward()} size={14} color="#1B4F8A" />
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

function getRoleLabelKey(user) {
  if (!user) return "roles.resident";
  if (isGuestUser(user)) return "roles.guest";
  if (user.role === "community_admin" || user.role === "admin") return "roles.admin";
  return "roles.resident";
}

function SideMenuPanel({ visible, onClose }) {
  const { t } = useTranslation();
  const dialog = useAppDialog();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = resolveTopInset(insets);

  const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
  const navigatingRef = useRef(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [user, setUser] = useState(() => getCachedUser());

  useEffect(() => {
    getUser().then((cached) => {
      if (cached) setUser(cached);
    });
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
  const roleLabelKey = getRoleLabelKey(user);
  const isNewProfile =
    !profile.avatarUrl ||
    profile.displayName === "My Profile" ||
    profile.displayName === "Neighbor";
  const { changePhoto, uploading } = useProfilePhoto({
    onUpdated: (data) => setUser(data),
  });

  const handleAvatarPress = () => {
    slideAnim.stopAnimation();
    slideAnim.setValue(-MENU_WIDTH);
    dismissImageSourcePicker();
    onClose();

    requestAnimationFrame(() => {
      setTimeout(() => {
        void changePhoto();
      }, 280);
    });
  };

  const handleClose = () => {
    dismissImageSourcePicker();
    Animated.timing(slideAnim, {
      toValue: -MENU_WIDTH,
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
    slideAnim.setValue(-MENU_WIDTH);
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

  const [wellnessHub, setWellnessHub] = useState([]);
  const [wellnessHubLoading, setWellnessHubLoading] = useState(false);
  const [familyPendingCount, setFamilyPendingCount] = useState(0);

  const menuItems = [
    {
      iconName: "message-circle",
      titleKey: "nav.communityFeed",
      route: "/screens/community-feed",
    },
    {
      iconName: "bell",
      titleKey: "nav.communityUpdates",
      route: "/(tabs)/notices",
    },
    {
      iconName: "shopping-bag",
      titleKey: "nav.marketplace",
      route: "/(tabs)/marketplace",
    },
    ...(user && !isGuestUser(user)
      ? [
          {
            iconName: "users",
            titleKey: "nav.myFamily",
            route: "/screens/my-family",
            badgeCount: familyPendingCount,
          },
          {
            iconName: "user-plus",
            titleKey: "nav.inviteGuest",
            route: "/screens/invite-guest",
          },
          {
            iconName: "user-check",
            titleKey: "nav.guestApprovals",
            route: "/screens/guest-approvals",
          },
        ]
      : []),
    {
      iconName: "home",
      titleKey: "nav.services",
      route: PropertyManagementRoutes.HOME,
    },
    {
      iconName: "user",
      titleKey: "nav.profile",
      route: "/(tabs)/profile",
    },
  ];

  const sidebarIconForKey = (key) => getWellnessCategoryMeta(key).icon;

  useEffect(() => {
    if (!visible) {
      slideAnim.setValue(-MENU_WIDTH);
      return undefined;
    }

    slideAnim.setValue(-MENU_WIDTH);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    return undefined;
  }, [visible, slideAnim]);

  useEffect(() => {
    if (!visible) {
      setWellnessHubLoading(false);
      return undefined;
    }

    setWellnessHubLoading(true);
    fetchWellnessHub()
      .then((hub) => setWellnessHub(hub.categories ?? []))
      .catch(() => setWellnessHub([]))
      .finally(() => setWellnessHubLoading(false));

    if (user && !isGuestUser(user)) {
      fetchMyFamily()
        .then((payload) => {
          setFamilyPendingCount(payload?.family?.pending_requests_count ?? 0);
        })
        .catch(() => setFamilyPendingCount(0));
    } else {
      setFamilyPendingCount(0);
    }

    return undefined;
  }, [visible, user]);

  const openWellness = () => {
    navigateAndClose("/(tabs)/wellness");
  };

  return (
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t("nav.closeMenu")}
        />

        {/* White band behind status bar so icons stay readable on the drawer */}
        <View style={[styles.statusBarBand, { height: topInset }]} pointerEvents="none" />

        <Animated.View
          style={[
            styles.menuContainer,
            { transform: [{ translateX: slideAnim }] },
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
                { paddingBottom: Math.max(insets.bottom, 24) },
              ]}
              style={styles.menuBody}
            >
            <View
              style={styles.profileGradient}
            >
              <View style={styles.profileCard}>
                <TouchableOpacity
                  style={styles.profileAvatarWrapper}
                  activeOpacity={0.85}
                  onPress={handleAvatarPress}
                  disabled={uploading}
                >
                  <ProfilePhotoAvatar
                    avatarUrl={profile.avatarUrl}
                    size={48}
                    uploading={uploading}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.profileInfo}
                  activeOpacity={0.8}
                  onPress={openProfile}
                >
                  <Text style={styles.profileName} numberOfLines={2}>
                    {profile.displayName || profile.displayPhone || t("nav.welcome")}
                  </Text>
                  <Text style={styles.profileAddress} numberOfLines={2}>
                    {profile.unitNumber
                      ? `${profile.communityName} · ${t("nav.unit", { number: profile.unitNumber })}`
                      : profile.communityName}
                  </Text>
                  {!isNewProfile ? (
                    <Text style={styles.profileRole} numberOfLines={2}>
                      {t(roleLabelKey)}
                    </Text>
                  ) : null}
                  {isNewProfile ? (
                    <Text style={styles.addPhotoHint}>{t("nav.completeProfile")}</Text>
                  ) : !profile.avatarUrl ? (
                    <Text style={styles.addPhotoHint}>{t("nav.addProfilePhoto")}</Text>
                  ) : null}
                </TouchableOpacity>

                <TouchableOpacity onPress={openProfile} activeOpacity={0.8} hitSlop={8}>
                  <Feather name={chevronForward()} size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t("nav.mainMenu")}</Text>
            <View style={styles.menuGroup}>
              {menuItems.map((item, index) => (
                <MenuItem
                  key={item.titleKey}
                  iconName={item.iconName}
                  title={t(item.titleKey)}
                  badgeCount={item.badgeCount ?? 0}
                  isActive={selectedMenu === `main-${index}`}
                  onPress={() => {
                    setSelectedMenu(`main-${index}`);
                    if (item.route) {
                      navigateAndClose(item.route);
                    }
                  }}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>{t("nav.wellnessPrograms")}</Text>
            <View style={styles.wellnessGroup}>
              {wellnessHubLoading ? (
                <SidebarWellnessHubSkeleton count={5} />
              ) : wellnessHub.length === 0 ? (
                <WellnessEmpty onExplore={openWellness} />
              ) : (
                wellnessHub.map((item, index) => {
                  const meta = getWellnessCategoryMeta(item.key);
                  return (
                    <MenuItem
                      key={item.key ?? index}
                      iconName={sidebarIconForKey(item.key)}
                      title={meta.titleKey ? t(meta.titleKey) : item.title}
                      iconColor={meta.color}
                      iconBg={meta.bg}
                      isActive={selectedMenu === `wellness-${index}`}
                      onPress={() => {
                        setSelectedMenu(`wellness-${index}`);
                        navigateAndClose({
                          pathname: "/(tabs)/wellness/wellness-detail",
                          params: wellnessDetailRouteParams(item),
                        });
                      }}
                    />
                  );
                })
              )}
            </View>

            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => {
                  navigateAndClose("/screens/settings");
                }}
              >
                <View style={styles.actionLeft}>
                  <View style={styles.actionIcon}>
                    <Feather name="settings" size={16} color="#475569" />
                  </View>
                  <Text style={styles.actionText}>{t("settings.title")}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, styles.actionRowLast]}
                activeOpacity={0.7}
                onPress={() => {
                  // Close the menu Modal fully before opening the confirm dialog
                  // (stacked RN Modals can swallow the sweet-alert confirm).
                  dismissImageSourcePicker();
                  slideAnim.stopAnimation();
                  slideAnim.setValue(-MENU_WIDTH);
                  onClose();
                  setTimeout(() => confirmSignOut(dialog), 120);
                }}
              >
                <View style={styles.actionLeft}>
                  <View style={[styles.actionIcon, styles.actionIconDanger]}>
                    <Feather name="log-out" size={16} color="#DC2626" />
                  </View>
                  <Text style={[styles.actionText, styles.actionTextDanger]}>
                    {t("settings.logOut")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </Animated.View>
      </View>
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
    paddingHorizontal: 16,
    paddingTop: 12,
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
    flex: 1,
    minWidth: 0,
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
    padding: 12,
  },
  profileAvatarWrapper: {
    marginEnd: 12,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 22,
    flexShrink: 1,
    includeFontPadding: true,
  },
  profileAddress: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 2,
    flexShrink: 1,
    includeFontPadding: true,
  },
  profileRole: {
    marginTop: 2,
    fontFamily: Fonts.semiBold,
    fontSize: 10,
    color: "#1B4F8A",
    fontWeight: "600",
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0,
    flexShrink: 1,
    includeFontPadding: true,
  },
  addPhotoHint: {
    marginTop: 4,
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 14,
    color: "#1B4F8A",
    fontWeight: "600",
  },

  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#94A3B8",
    marginBottom: 8,
  },
  menuGroup: {
    marginBottom: 16,
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
    paddingVertical: 18,
    paddingHorizontal: 12,
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
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    lineHeight: 18,
  },
  actionTextDanger: {
    color: "#DC2626",
  },
});
