import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { navigateAppRoute } from "../../utils/app-navigation";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getProfileFields, getRoleLabel } from "../../utils/profile-display";
import {
  canSwitchCommunities,
  getPrimaryMembership,
  isCommunityAdmin,
  isGuestUser,
} from "../../services/community-access";
import { fetchMe, fetchMyCommunities, switchActiveCommunity } from "../../services/profile-api";
import {
  promptAddUnitsBeforeSwitch,
  showSwitchCommunityFailure,
} from "../../utils/switch-community-errors";
import { getCommunityId, getUser, setCommunityId, subscribeSessionUser } from "../../services/auth-session";
import { HeaderShell } from "../layout/header-chrome";
import { sw, sf } from "../../utils/responsive";
import { navigateAfterAuth } from "../../constants/onboarding-routes";
import { useNotificationUnread } from "../../hooks/use-notification-unread";
import { useMessageUnread } from "../../hooks/use-message-unread";
import { useApiAction } from "../../hooks/use-api-action";
import NotificationCountBadge from "./notification-count-badge";
import LanguageToggle from "./language-toggle";
import CommunityLocationMenu from "./community-location-menu";
import LocationPickerSheet from "./location-picker-sheet";
import SwitchCommunitySheet from "./switch-community-sheet";
import { isResidentFeatureEnabled } from "../../constants/resident-features";

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const compactLang = windowWidth < 360;
  const [user, setUser] = useState(null);
  const { unread, messageAlerts } = useNotificationUnread();
  const { unread: messageUnread } = useMessageUnread();
  const { dialog, showFailure } = useApiAction();
  const headerRef = useRef(null);
  const locationBtnRef = useRef(null);
  const [communityMenuOpen, setCommunityMenuOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationFresh, setLocationFresh] = useState(true);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchRows, setSwitchRows] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [activeCommunityId, setActiveCommunityId] = useState(null);
  const menuActionRef = useRef(false);

  const afterMenuClose = useCallback((action) => {
    if (menuActionRef.current) return;
    menuActionRef.current = true;
    requestAnimationFrame(() => {
      setCommunityMenuOpen(false);
      setTimeout(() => {
        menuActionRef.current = false;
        action();
      }, 280);
    });
  }, []);

  const openDiscoverNearby = useCallback(() => {
    afterMenuClose(() => {
      router.push("/screens/discover");
    });
  }, [afterMenuClose, router]);

  const loadSwitchCommunities = useCallback(async () => {
    try {
      const payload = await fetchMyCommunities();
      const currentId = payload.activeCommunityId ?? activeCommunityId;
      const rows = (payload.communities || []).filter((row) => {
        if (row.needs_units) return Number(row.community_id) !== Number(currentId);
        if (String(row.status || "").toLowerCase() !== "approved") return false;
        if (Number(row.community_id) === Number(currentId)) return false;
        const community = row.community;
        if (!community) return true;
        if (community.review_status === "pending" || community.review_status === "rejected") return false;
        if (community.status && community.status !== "active") return false;
        return true;
      });
      if (rows.length === 0) {
        await dialog.showError(t("topBar.switchCommunity"), t("myCommunity.noApprovedToSwitch"));
        return;
      }
      setSwitchRows(rows);
      setSwitchOpen(true);
    } catch (err) {
      await showFailure(t("nav.couldNotSwitchCommunity"), err);
    }
  }, [activeCommunityId, dialog, showFailure, t]);

  const openSwitchCommunity = useCallback(() => {
    afterMenuClose(() => {
      void loadSwitchCommunities();
    });
  }, [afterMenuClose, loadSwitchCommunities]);

  const confirmSwitch = useCallback(
    async (row) => {
      const name = row.community?.name || t("community.myCommunity");
      setSwitchOpen(false);
      if (row.needs_units) {
        await promptAddUnitsBeforeSwitch(dialog, router, {
          communityId: row.community_id,
          communityName: name,
        });
        return;
      }
      const choice = await dialog.showConfirm(
        t("nav.switchCommunityTitle"),
        t("nav.switchCommunityBody", { name }),
        {
          confirmLabel: t("nav.switchCommunityConfirm"),
          cancelLabel: t("common.cancel"),
        },
      );
      if (choice !== "confirm") {
        setSwitchOpen(true);
        return;
      }

      setSwitching(true);
      try {
        const next = await switchActiveCommunity(row.community_id);
        setActiveCommunityId(row.community_id);
        navigateAfterAuth(router, next, { mode: "login" });
      } catch (err) {
        await showSwitchCommunityFailure(
          dialog,
          router,
          t("nav.couldNotSwitchCommunity"),
          err,
          {
            communityId: row.community_id,
            communityName: row.community?.name,
          },
        );
      } finally {
        setSwitching(false);
      }
    },
    [dialog, router, t],
  );

  useEffect(() => subscribeSessionUser((next) => {
    if (next) setUser(next);
  }), []);

  useFocusEffect(
    useCallback(() => {
      const applyCommunityContext = async (next) => {
        setUser(next);
        const membership = getPrimaryMembership(next);
        const membershipCommunityId = membership?.community_id ?? null;
        const storedId = await getCommunityId();
        const resolvedId = membershipCommunityId ?? storedId ?? null;
        if (membershipCommunityId && String(membershipCommunityId) !== String(storedId ?? "")) {
          await setCommunityId(membershipCommunityId);
        }
        setActiveCommunityId(resolvedId != null ? String(resolvedId) : null);
      };

      fetchMe()
        .then(applyCommunityContext)
        .catch(async () => {
          const cached = await getUser();
          await applyCommunityContext(cached);
        });
    }, []),
  );

  const guestUser = isGuestUser(user);
  const adminUser = isCommunityAdmin(user);
  const { communityName } = getProfileFields(user, activeCommunityId);
  const roleLabel = getRoleLabel(user);
  const hasCommunity = Boolean(user?.memberships?.some((m) => m?.community?.name));
  const title = hasCommunity ? communityName : t("topBar.chooseYourCommunity");
  const showNearby = isResidentFeatureEnabled(user, "nearby_places");
  // Community admins manage one community; switch is residents-only when multi-approved.
  const showSwitch = !guestUser && !adminUser && canSwitchCommunities(user);
  const showLocationMenu = showNearby || showSwitch;
  const showMessages = isResidentFeatureEnabled(user, "messages");
  const notificationOnly = Math.max(0, (unread || 0) - (messageAlerts || 0));

  const onLocationPress = () => {
    if (!showLocationMenu) return;
    if (showNearby && showSwitch) {
      setCommunityMenuOpen((open) => !open);
      return;
    }
    if (showNearby) {
      router.push("/screens/discover");
      return;
    }
    void loadSwitchCommunities();
  };

  return (
    <View ref={headerRef} collapsable={false}>
      <HeaderShell padded dense>
        <View style={styles.row}>
          <View style={styles.left}>
            <BurgerButton onPress={onMenuPress} compact plain iconColor={T.navy} />
            <Pressable
              ref={locationBtnRef}
              collapsable={false}
              style={styles.location}
              accessibilityRole="button"
              accessibilityLabel={
                showLocationMenu
                  ? t("topBar.communityMenu", { name: title })
                  : t("topBar.communityLocation", { name: title })
              }
              onPress={onLocationPress}
              disabled={!showLocationMenu}
            >
              <View style={styles.pinWrap}>
                <Feather name="map-pin" size={sf(12)} color={T.white} />
              </View>
              <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                {title}
              </Text>
              {guestUser ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleLabel}</Text>
                </View>
              ) : null}
              {showLocationMenu ? <Feather name="chevron-down" size={sf(14)} color={T.navy} /> : null}
            </Pressable>
          </View>

          <View style={styles.right}>
            <LanguageToggle headerRef={headerRef} compact={compactLang} />
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
                onPress={() => navigateAppRoute(router, "/screens/notification")}
                accessibilityRole="button"
                accessibilityLabel={t("notifications.title")}
                hitSlop={6}
              >
                <Ionicons name="notifications-outline" size={sf(18)} color={T.navy} />
                <NotificationCountBadge count={notificationOnly} size="sm" label={t("notifications.title")} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
                onPress={() => navigateAppRoute(router, "/screens/messages")}
                accessibilityRole="button"
                accessibilityLabel={t("notifications.messages")}
                hitSlop={6}
              >
                <Ionicons name="chatbubble-outline" size={sf(17)} color={T.navy} />
                <NotificationCountBadge count={showMessages ? messageUnread || 0 : 0} size="sm" label={t("notifications.messages")} />
              </Pressable>
            </View>
          </View>
        </View>
      </HeaderShell>

      <CommunityLocationMenu
        visible={communityMenuOpen && showNearby && showSwitch}
        onClose={() => setCommunityMenuOpen(false)}
        headerRef={headerRef}
        triggerRef={locationBtnRef}
        showDiscoverNearby={showNearby}
        showSwitchCommunity={showSwitch}
        onDiscoverNearby={openDiscoverNearby}
        onSwitchCommunity={openSwitchCommunity}
      />

      <LocationPickerSheet
        visible={locationOpen}
        freshOpen={locationFresh}
        onClose={() => setLocationOpen(false)}
        communityName={hasCommunity ? communityName : title}
        communityId={activeCommunityId}
      />

      <SwitchCommunitySheet
        visible={switchOpen}
        communities={switchRows}
        switching={switching}
        onClose={() => setSwitchOpen(false)}
        onSelect={confirmSwitch}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    minHeight: sw(44),
    direction: "ltr",
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    minWidth: 0,
  },
  pinWrap: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(7),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    minWidth: 0,
    minHeight: sw(36),
    direction: "ltr",
  },
  locationText: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(22),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },
  rolePill: {
    flexShrink: 0,
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(13),
    color: T.deepTeal,
    textTransform: "uppercase",
  },
  right: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: sw(16),
    marginStart: sw(8),
    flexShrink: 0,
    flexGrow: 0,
    direction: "ltr",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: sw(14),
    flexShrink: 0,
    direction: "ltr",
  },
  iconBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(12),
    backgroundColor: "#F4F8FB",
    borderWidth: 1,
    borderColor: "#E3EAF1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
    flexShrink: 0,
  },
  iconPressed: {
    backgroundColor: "#FFFFFF",
    borderColor: T.teal,
  },
});
