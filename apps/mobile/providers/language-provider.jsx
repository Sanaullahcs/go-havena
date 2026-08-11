import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, Platform, StyleSheet, View } from "react-native";
import { reloadAppAsync } from "expo";
import * as SecureStore from "expo-secure-store";
import i18n, { initI18n, saveLanguage, SUPPORTED } from "../i18n";
import { Colors } from "../constants/tokens";
import { setNativeAppLocale } from "../utils/native-app-locale";

const LanguageContext = createContext({
  language: "en",
  isRTL: false,
  changeLanguage: async () => {},
  ready: false,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

const RTL_LANGUAGES = ["ar"];
const STALE_RTL_KEY = "nbr_rtl_cleared_v2";

function languageNeedsRTL(lng) {
  return RTL_LANGUAGES.includes(lng);
}

/**
 * Layout stays LTR app-wide (no I18nManager.forceRTL) so screens are not
 * double-mirrored. Arabic RTL for typing is handled by LocaleTextInput
 * (writingDirection + textAlign) and icon helpers in utils/rtl.js.
 *
 * I18nManager.forceRTL must stay false. If a previous build left native
 * isRTL=true, clear it once with forceRTL(false) + reload.
 */
async function ensureNativeRtlIsOff() {
  if (!I18nManager.isRTL) return;

  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);

  try {
    const alreadyCleared = await SecureStore.getItemAsync(STALE_RTL_KEY);
    if (alreadyCleared === "done") return;

    await SecureStore.setItemAsync(STALE_RTL_KEY, "done");
    await reloadAppAsync("Clearing stale native RTL");
  } catch {
    // reload failed (Expo Go) — the forceRTL(false) will apply next cold start
  }
}

export default function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("en");
  const [isRTL, setIsRTL] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await ensureNativeRtlIsOff();

        const lng = await initI18n();
        if (cancelled) return;

        setLanguage(lng);
        setIsRTL(languageNeedsRTL(lng));
        // Sync OS app-locale so soft keyboards match (Arabic → Arabic keyboard).
        setNativeAppLocale(lng);
      } catch (err) {
        console.warn("[LanguageProvider] init failed", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const changeLanguage = useCallback(async (lng) => {
    if (!SUPPORTED.includes(lng) || lng === language) return;

    await saveLanguage(lng);
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    setIsRTL(languageNeedsRTL(lng));

    const applied = setNativeAppLocale(lng);
    if (!applied && __DEV__) {
      console.warn(
        "[LanguageProvider] Keyboard locale module missing. Expo Go cannot switch keyboards — rebuild with `npx expo run:android` or `npx expo run:ios`.",
      );
    }
    // Android: recreate so application locales + IME pick up the new language.
    // iOS: reload applies AppleLanguages preference (keyboard still user-controlled).
    if (applied && Platform.OS !== "web") {
      try {
        await reloadAppAsync("Apply keyboard language");
      } catch {
        // Expo Go / reload unavailable
      }
    }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, isRTL, changeLanguage, ready }}>
      {ready ? (
        <View style={styles.directionRoot}>
          {children}
        </View>
      ) : (
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep ?? "#0A2A43"} />
        </View>
      )}
    </LanguageContext.Provider>
  );
}

const styles = StyleSheet.create({
  directionRoot: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
