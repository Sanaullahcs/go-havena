import { Tabs, useRouter } from "expo-router";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { View, StyleSheet, Platform } from "react-native";

import FloatingNavMenu from "../../components/layout/floating-nav-menu";

import CreateNewModal from "../../components/ui/CreateNewModal";

import { getUser, getToken, getCachedUser, clearSession, subscribeSessionUser } from "../../services/auth-session";

import { fetchMe } from "../../services/auth-api";

import { canAccessDashboard, currentCommunityId, isCommunityAdmin, isGuestUser } from "../../services/community-access";
import { getPostAuthRoute, hasPendingStaffInvite, isStaffOnlyUser, needsCompleteProfile, Routes, STAFF_HOME, STAFF_INVITES } from "../../constants/onboarding-routes";
import { syncRoleFromUser } from "../../constants/role-session";

import { isAccountSuspendedError, loginRouteWithSuspendedNotice, persistBlockedAccountNotice } from "../../utils/auth-errors";
import {
  handleGuestAccessScheduleError,
  handleGuestAccessTerminationError,
  handleGuestUnauthorized,
  msUntil,
  revokeGuestSessionAndRedirect,
} from "../../utils/guest-access-schedule";
import ScreenStatusBar from "../../components/layout/screen-status-bar";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

export default function TabLayout() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [communityAdminUser, setCommunityAdminUser] = useState(false);
  const [activeCommunityId, setActiveCommunityId] = useState(
    () => currentCommunityId(getCachedUser()) ?? 0,
  );

  useEffect(() => {
    let cancelled = false;

    const goLogin = (suspended = false) => {
      if (cancelled) return;
      const nav = routerRef.current;
      if (suspended) {
        nav.replace(loginRouteWithSuspendedNotice());
      } else {
        nav.replace(Routes.LOGIN);
      }
    };

    const applyUser = (user) => {
      if (!user || cancelled) return;
      syncRoleFromUser(user);
      setCommunityAdminUser(isCommunityAdmin(user));
      setActiveCommunityId(currentCommunityId(user) ?? 0);
    };

    const redirectIfBlocked = (user) => {
      if (!user || cancelled) return false;
      if (canAccessDashboard(user) && !needsCompleteProfile(user)) {
        return false;
      }
      if (isStaffOnlyUser(user)) {
        routerRef.current.replace(STAFF_HOME);
        return true;
      }
      if (hasPendingStaffInvite(user)) {
        routerRef.current.replace(STAFF_INVITES);
        return true;
      }
      const route = getPostAuthRoute(user);
      routerRef.current.replace({ pathname: route.pathname, params: route.params });
      return true;
    };

    (async () => {
      const token = await getToken();
      if (!token) {
        goLogin();
        return;
      }

      let user = await getUser();
      applyUser(user);

      try {
        user = await withTimeout(fetchMe(), 8000);
        applyUser(user);
      } catch (err) {
        const nav = routerRef.current;
        if (await handleGuestAccessTerminationError(err, nav)) return;
        if (await handleGuestAccessScheduleError(err, nav)) return;
        if (await handleGuestUnauthorized(err, nav)) return;

        if (err?.status === 401) {
          await clearSession();
          goLogin();
          return;
        }

        if (isAccountSuspendedError(err)) {
          await persistBlockedAccountNotice(err);
          await clearSession();
          goLogin(true);
          return;
        }

        user = user ?? (await getUser());
        if (!user) {
          goLogin();
          return;
        }
      }

      if (cancelled) return;

      if (!user) {
        goLogin();
        return;
      }

      redirectIfBlocked(user);
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return subscribeSessionUser((user) => {
      if (!user) {
        setCommunityAdminUser(false);
        setActiveCommunityId(0);
        return;
      }
      syncRoleFromUser(user);
      setCommunityAdminUser(isCommunityAdmin(user));
      setActiveCommunityId(currentCommunityId(user) ?? 0);
    });
  }, []);

  useEffect(() => {
    let expiryTimer;
    let cancelled = false;

    (async () => {
      const user = await getUser();
      if (!user || !isGuestUser(user)) return;

      const endsAt = user?.guest_access?.ends_at;
      const delay = msUntil(endsAt);
      if (delay == null) return;

      if (delay <= 0) {
        if (!cancelled) await revokeGuestSessionAndRedirect(routerRef.current);
        return;
      }

      expiryTimer = setTimeout(async () => {
        if (!cancelled) await revokeGuestSessionAndRedirect(routerRef.current);
      }, delay);
    })();

    return () => {
      cancelled = true;
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, []);

  const renderTabBar = (props) => {
    const hideNav = props?.style?.display === "none";

    return (
      <>
        <ScreenStatusBar style="dark" />
        {!hideNav ? (
          <View
            style={Platform.OS === "ios" ? styles.iosTabDock : undefined}
            collapsable={false}
          >
            <FloatingNavMenu
              onCreatePress={() => setShowCreateModal(true)}
              isCommunityAdmin={communityAdminUser}
            />
          </View>
        ) : null}
        <CreateNewModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onOpen={() => setShowCreateModal(true)}
        />
      </>
    );
  };

  return (
    <Tabs
      key={`community-${activeCommunityId || "none"}`}
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("nav.home") }} />
      <Tabs.Screen name="community" options={{ title: t("nav.community") }} />
      <Tabs.Screen name="marketplace" options={{ href: null, title: t("nav.marketplace") }} />
      <Tabs.Screen name="services" options={{ title: t("nav.services") }} />
      <Tabs.Screen name="profile" options={{ title: t("nav.profile") }} />
      <Tabs.Screen name="create-post" options={{ href: null }} />
      <Tabs.Screen name="wellness" options={{ href: null }} />
      <Tabs.Screen name="notices" options={{ href: null, title: t("nav.updates") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iosTabDock: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    marginHorizontal: 0,
    paddingHorizontal: 0,
    overflow: "visible",
  },
});

