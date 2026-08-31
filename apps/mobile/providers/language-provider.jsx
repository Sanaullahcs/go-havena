import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, StyleSheet, View } from "react-native";
import * as Font from "expo-font";
import * as SecureStore from "expo-secure-store";
import i18n, { initI18n, saveLanguage, SUPPORTED } from "../i18n";
import { Colors } from "../constants/tokens";
import { fontMapForLanguage } from "../constants/font-map";
import { setNativeAppLocale } from "../utils/native-app-locale";
import { setArabicTextMetricsEnabled } from "../utils/arabic-text-metrics";

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
 * Layout stays LTR app-wide (no I18nManager.forceRTL / no root `direction:'rtl'`)
 * so screens are not mirrored. Arabic uses Noto Sans Arabic (loaded under Inter-*
 * keys) plus LocaleTextInput writingDirection for typing. LTR uses Nunito. Text clip fixes run from
 * index.js / setArabicTextMetricsEnabled so Noto glyphs are not cropped on top.
 *
 * I18nManager.forceRTL must stay false. If a previous build left native
 * isRTL=true, clear it with forceRTL(false) (applies fully on the next cold start).
 */
async function ensureNativeRtlIsOff() {
  if (!I18nManager.isRTL) return;

  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);

  try {
    await SecureStore.setItemAsync(STALE_RTL_KEY, "done");
  } catch {
    // forceRTL(false) still applies on the next cold start
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
        // Noto Arabic needs looser line metrics than Inter — avoid top clipping.
        setArabicTextMetricsEnabled(languageNeedsRTL(lng));
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
    setArabicTextMetricsEnabled(languageNeedsRTL(lng));

    setNativeAppLocale(lng);

    try {
      await Font.loadAsync(fontMapForLanguage(lng));
    } catch {
      // Fonts already registered, or Expo Go cannot swap families mid-session.
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
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep ?? "#1B4F8A"} />
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
