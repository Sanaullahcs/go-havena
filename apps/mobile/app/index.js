import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import AuthLogo from "../components/ui/auth-logo";
import HavenaWordmark from "../components/ui/havena-wordmark";
import { useRouter, useRootNavigationState } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../constants/font";
import { SolidFills } from "../constants/tokens";
import { getUser, getToken, clearSession } from "../services/auth-session";
import { fetchMe } from "../services/auth-api";
import { navigateFromColdStart, Routes } from "../constants/onboarding-routes";
import { isAccountSuspendedError, loginRouteWithSuspendedNotice, persistBlockedAccountNotice } from "../utils/auth-errors";
import { handleGuestAccessScheduleError } from "../utils/guest-access-schedule";
import ScreenStatusBar from "../components/layout/screen-status-bar";
import { prepareAuthScreenChrome } from "../components/layout/chrome-manager";

const MIN_SPLASH_MS = 600;
const PROFILE_FETCH_MS = 5000;
const HARD_STOP_MS = 8000;

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
  const { t } = useTranslation();
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
      const minSplash = delay(MIN_SPLASH_MS);

      try {
        let token = null;
        try {
          token = await getToken();
        } catch {
          token = null;
        }

        if (!token) {
          await minSplash;
          if (cancelled) return;
          goLogin();
          return;
        }

        let user;
        try {
          const [, fetched] = await Promise.all([
            minSplash,
            withTimeout(fetchMe(), PROFILE_FETCH_MS, "profile"),
          ]);
          user = fetched;
        } catch (err) {
          if (await handleGuestAccessScheduleError(err, router)) {
            return;
          }

          const suspended = isAccountSuspendedError(err);
          if (suspended) {
            await persistBlockedAccountNotice(err);
          }

          // Offline / slow API — use cached session when possible.
          user = await getUser();
          if (!user) {
            await clearSession();
            if (cancelled) return;
            goLogin(suspended);
            return;
          }
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
      <ScreenStatusBar style="dark" variant="splash" />
      <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <AuthLogo size={86} compact variant="splash" />
          <HavenaWordmark height={32} />
          <Text style={styles.subtitle}>{t("nav.tagline")}</Text>
        </View>
        <Animated.View style={[styles.loader, { transform: [{ rotate: loaderRotation }] }]} />
      </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: SolidFills.splash },
  content: { flex: 1, justifyContent: "center", alignItems: "center" },
  brand: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "rgba(27,79,138,0.62)",
    lineHeight: 20,
    textAlign: "center",
    includeFontPadding: true,
  },
  loader: {
    marginTop: 42,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "rgba(27,79,138,0.22)",
    borderTopColor: "#1B4F8A",
  },
});
