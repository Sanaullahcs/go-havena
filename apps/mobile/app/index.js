import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import AuthLogo from "../components/ui/auth-logo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useRootNavigationState } from "expo-router";
import { Fonts } from "../constants/font";
import { Gradients } from "../constants/tokens";
import { isAuthenticated, getUser, clearSession } from "../services/auth-session";
import { fetchMe } from "../services/auth-api";
import { navigateFromColdStart, Routes } from "../constants/onboarding-routes";
import { isAccountSuspendedError, loginRouteWithSuspendedNotice, persistBlockedAccountNotice } from "../utils/auth-errors";
import { handleGuestAccessScheduleError } from "../utils/guest-access-schedule";
import ScreenStatusBar from "../components/layout/screen-status-bar";
import { prepareAuthScreenChrome } from "../components/layout/chrome-manager";

const MIN_SPLASH_MS = 1400;
const AUTH_CHECK_MS = 3500;
const STORAGE_READ_MS = 3500;
const PROFILE_FETCH_MS = 6000;
const HARD_STOP_MS = 10000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]);
}

export default function WelcomeScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const loaderSpin = useRef(new Animated.Value(0)).current;
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    navigatedRef.current = false;

    const loaderLoop = Animated.loop(
      Animated.timing(loaderSpin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loaderLoop.start();

    let cancelled = false;

    const goLogin = (suspended = false, { force = false } = {}) => {
      if (cancelled || (navigatedRef.current && !force)) return;
      navigatedRef.current = true;
      prepareAuthScreenChrome();
      router.replace(suspended ? loginRouteWithSuspendedNotice() : Routes.LOGIN);
    };

    const goApp = (user) => {
      if (cancelled || navigatedRef.current) return;
      navigatedRef.current = true;
      try {
        navigateFromColdStart(router, user);
      } catch {
        navigatedRef.current = false;
        goLogin();
      }
    };

    const hardStop = setTimeout(() => goLogin(false, { force: true }), HARD_STOP_MS);

    (async () => {
      const started = Date.now();

      try {
        let authed = false;
        try {
          authed = await withTimeout(isAuthenticated(), AUTH_CHECK_MS, "auth");
        } catch {
          authed = false;
        }

        const elapsed = Date.now() - started;
        await delay(Math.max(0, MIN_SPLASH_MS - elapsed));
        if (cancelled) return;

        if (!authed) {
          goLogin();
          return;
        }

        try {
          await withTimeout(getUser(), STORAGE_READ_MS, "user");
        } catch {
          await clearSession();
          if (cancelled) return;
          goLogin();
          return;
        }

        let user;
        try {
          user = await withTimeout(fetchMe(), PROFILE_FETCH_MS, "profile");
        } catch (err) {
          if (await handleGuestAccessScheduleError(err, router)) {
            return;
          }

          const suspended = isAccountSuspendedError(err);
          if (suspended) {
            await persistBlockedAccountNotice(err);
          }
          await clearSession();
          if (cancelled) return;
          goLogin(suspended);
          return;
        }

        if (cancelled) return;
        goApp(user);
      } catch {
        goLogin(undefined, { force: true });
      } finally {
        clearTimeout(hardStop);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(hardStop);
      loaderLoop.stop();
    };
  }, [loaderSpin, rootNavigationState?.key, router]);

  const loaderRotation = loaderSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <>
      <ScreenStatusBar style="light" variant="splash" />
      <LinearGradient colors={Gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <AuthLogo size={86} compact variant="splash" />
          <Text style={styles.title}>Havena</Text>
          <Text style={styles.subtitle}>Community & Wellness Platform</Text>
        </View>
        <Animated.View style={[styles.loader, { transform: [{ rotate: loaderRotation }] }]} />
      </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { flex: 1, justifyContent: "center", alignItems: "center" },
  brand: { alignItems: "center", gap: 10 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 18,
  },
  loader: {
    marginTop: 42,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.35)",
    borderTopColor: "rgba(255,255,255,0.85)",
  },
});
