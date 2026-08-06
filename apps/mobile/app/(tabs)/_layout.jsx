import { Tabs, useRouter } from "expo-router";

import React, { useEffect, useState } from "react";

import { View, StyleSheet, ActivityIndicator } from "react-native";

import FloatingNavMenu from "../../components/layout/floating-nav-menu";

import CreateNewModal from "../../components/ui/CreateNewModal";

import { getUser, getToken, clearSession } from "../../services/auth-session";

import { fetchMe } from "../../services/auth-api";

import { canAccessDashboard, isCommunityAdmin, isGuestUser } from "../../services/community-access";

import { getPostAuthRoute, Routes } from "../../constants/onboarding-routes";
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [communityAdminUser, setCommunityAdminUser] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const goLogin = (suspended = false) => {
      if (!cancelled) {
        if (suspended) {
          router.replace(loginRouteWithSuspendedNotice());
        } else {
          router.replace(Routes.LOGIN);
        }
      }
    };

    (async () => {
      const token = await getToken();
      if (!token) {
        goLogin();
        return;
      }

      let user = await getUser();

      try {
        user = await withTimeout(fetchMe(), 8000);
      } catch (err) {
        if (await handleGuestAccessTerminationError(err, router)) return;
        if (await handleGuestAccessScheduleError(err, router)) return;
        if (await handleGuestUnauthorized(err, router)) return;

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

      if (canAccessDashboard(user)) {
        syncRoleFromUser(user);
        setCommunityAdminUser(isCommunityAdmin(user));
        setAccessChecked(true);
        return;
      }

      const route = getPostAuthRoute(user);
      router.replace({ pathname: route.pathname, params: route.params });
    })();

    return () => { cancelled = true; };
  }, [router]);

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
        if (!cancelled) await revokeGuestSessionAndRedirect(router);
        return;
      }

      expiryTimer = setTimeout(async () => {
        if (!cancelled) await revokeGuestSessionAndRedirect(router);
      }, delay);
    })();

    return () => {
      cancelled = true;
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [router]);

  if (!accessChecked) {
    return (
      <>
        <ScreenStatusBar style="dark" />
        <View style={styles.guard}>
          <ActivityIndicator size="large" color="#14B8A6" />
        </View>
      </>
    );
  }

  return (
    <>
      <ScreenStatusBar style="dark" />
      <Tabs
        tabBar={(props) => {
          if (props.style?.display === "none") return null;
          return (
            <FloatingNavMenu
              onCreatePress={() => setShowCreateModal(true)}
              isCommunityAdmin={communityAdminUser}
            />
          );
        }}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="community" options={{ title: "Community" }} />
        <Tabs.Screen name="marketplace" options={{ href: null, title: "Marketplace" }} />
        <Tabs.Screen name="services" options={{ title: "Services" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="create-post" options={{ href: null }} />
        <Tabs.Screen name="wellness" options={{ href: null }} />
        <Tabs.Screen name="notices" options={{ href: null, title: "Updates" }} />
      </Tabs>
      <CreateNewModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onOpen={() => setShowCreateModal(true)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  guard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
