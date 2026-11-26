import "react-native-gesture-handler";
import {
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "../global.css";
import "../nativewind-interop";
import "react-native-reanimated";

import { AppDialogProvider } from "../providers/app-dialog-provider";
import { ImageSourcePickerProvider } from "../providers/image-source-picker-provider";
import LanguageProvider from "../providers/language-provider";
import LocationScopeProvider from "../providers/location-scope-provider";
import GuestSessionGuard from "../components/auth/guest-session-guard";
import FeatureRouteGuard from "../components/account/feature-route-guard";
import PushNotificationBootstrap from "../components/notifications/push-notification-bootstrap";
import InAppNotificationMonitor from "../components/notifications/in-app-notification-monitor";
import AppUpdateGate from "../components/app-update/app-update-gate";
import { NotificationBannerProvider } from "../providers/notification-banner-provider";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import {
  applyMainAppChrome,
  applySplashChrome,
  SPLASH_CHROME_COLOR,
  SYSTEM_CHROME_COLOR,
} from "../components/layout/system-chrome";
import { registerScreenChrome } from "../components/layout/chrome-manager";
import BootSplash from "../components/layout/boot-splash";
import { BRAND_FONTS } from "../constants/font-map";
import { getSavedLanguage } from "../i18n";
import { setArabicTextMetricsEnabled } from "../utils/arabic-text-metrics";
import { isArabicLanguage } from "../constants/font";
import { isExpoGo } from "../utils/expo-runtime";
import SafeHardwareBack from "../components/navigation/safe-hardware-back";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [bootLang, setBootLang] = useState(null);

  // Resolve the saved language before first paint. Both font families are already loading.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getSavedLanguage();
        if (!cancelled) {
          const lng = saved || "en";
          setBootLang(lng);
          setArabicTextMetricsEnabled(isArabicLanguage(lng));
        }
      } catch {
        if (!cancelled) {
          setBootLang("en");
          setArabicTextMetricsEnabled(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [fontsLoaded, fontError] = useFonts(BRAND_FONTS);

  useEffect(() => {
    applySplashChrome();
  }, []);

  useEffect(() => {
    if (!bootLang) return;
    if (!fontsLoaded && !fontError) {
      return;
    }

    applySplashChrome();
    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(() => setReady(true));
  }, [bootLang, fontsLoaded, fontError]);

  // Never block forever on fonts — hide splash after 3s even if fonts lag.
  useEffect(() => {
    const timer = setTimeout(() => {
      applySplashChrome();
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setReady(true));
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Main app uses light surfaces — dark status icons (battery/wifi/time) must stay visible.
    registerScreenChrome({
      color: SYSTEM_CHROME_COLOR,
      barStyle: "dark-content",
      expoStyle: "dark",
      edgeToEdge: true,
      variant: "main",
    });
    applyMainAppChrome(SYSTEM_CHROME_COLOR);
  }, [ready]);

  if (!ready) {
    return <BootSplash />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
    <KeyboardProvider>
    <LanguageProvider>
    <LocationScopeProvider>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <AppDialogProvider>
    <NotificationBannerProvider>
    <ImageSourcePickerProvider>
    <GuestSessionGuard />
    <FeatureRouteGuard />
    <AppUpdateGate />
    {/* Expo Go cannot register a production push token. EAS development, preview, and production builds mount this. */}
    {isExpoGo() ? null : <PushNotificationBootstrap />}
    <InAppNotificationMonitor />
    <ThemeProvider value={DefaultTheme}>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <SafeHardwareBack />
        <Stack
          screenOptions={{
            contentStyle: styles.screen,
            animation: "default",
          }}
        >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: SPLASH_CHROME_COLOR },
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="screens/roles/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/invite-code/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/invite-guest/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/invite-guest-admin/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/guest-login/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/guest-approvals/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-units/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/landlord/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-community/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-family/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-family/tree"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-family/requests"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-family/add-member"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/my-family/member"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/admin-guests/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/admin-refer-and-earn/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/create-notice/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/create-event/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/create-alert/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/request-for-community/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/region/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/region/communities/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/join-community-units/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/signup/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/verifyregistration/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/pending-community/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/pending-family/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/pending-community-admin/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/complete-billing/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/adjust-features/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/resident-features/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/complete-profile/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/login/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="screens/login/verify-phone/index"
          options={{
            headerShown: false,
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/choose-login-community/index"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: "fade",
            contentStyle: { flex: 1, backgroundColor: "#F4FBFD" },
          }}
        />
        <Stack.Screen
          name="screens/community-welcome/index"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: "fade",
            contentStyle: { flex: 1, backgroundColor: "#E3EDF8" },
          }}
        />
        <Stack.Screen
          name="screens/event-detail/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/notice-detail/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/create-post/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/createListing/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/listing-detail/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/discover/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/discover-essential/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/discover-suggestions/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/discover-suggestion-detail/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/nearby-place-detail/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/community-listings/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/marketplace-listings/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/profile/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/profile/points-history/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/profile/rank-details/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/profile/my-posts/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/notification/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/achievements/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/settings/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/blocked-users/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/leaderboard/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-dashboard/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-members/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-units/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-service-bills/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-amenity-bills/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-service-form/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-listings/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-content-review/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/admin-community-events/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-bookings/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/chat"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/report"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/report-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin-complaints/report-chat"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/complaints"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/staff-tasks"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/staff-invite/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/admin-amenities/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity-form/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity/all-facilities/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity/all-facilities/reservation-calender/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity/all-facilities/reservation-calender/rule-details/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/community-rules/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/community-rules/rule-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/community-rules/rule-form"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/documents/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/documents/document-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/documents/document-form"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/documents/agreement-form"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/documents/sign-agreement"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/bills/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/payment-result/index"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="screens/payments-history/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/utilities/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/utilities/add"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="screens/community-feed/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/community-feed/comments"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/community-feed/search"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/resident-profile/index"
          options={{ headerShown: false, contentStyle: styles.screen }}
        />
        <Stack.Screen
          name="screens/help/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/my-booking/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/billing-contact/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/unit-bills/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/amenity-bills/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/property-management/available-services/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/messages/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/messages/chat"
          options={{ headerShown: false }}
        />
        </Stack>
        <NavigationBar style="dark" />
      </View>
    </ThemeProvider>
    </ImageSourcePickerProvider>
    </NotificationBannerProvider>
    </AppDialogProvider>
    </SafeAreaProvider>
    </LocationScopeProvider>
    </LanguageProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SYSTEM_CHROME_COLOR },
  screen: { flex: 1, backgroundColor: SYSTEM_CHROME_COLOR },
});
