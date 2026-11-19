import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import i18n, { initI18n, saveLanguage, SUPPORTED } from "../i18n";
import { Colors } from "../constants/tokens";
import { setNativeAppLocale } from "../utils/native-app-locale";
import { setArabicTextMetricsEnabled } from "../utils/arabic-text-metrics";
import { isExpoGo } from "../utils/expo-runtime";
import { subscribeSessionUser } from "../services/auth-session";
import { currentCommunityId } from "../services/community-access";
import { communityPrefersArabic } from "../utils/community-language";

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
 * so screens are not mirrored. Poppins and Noto Sans Arabic are both loaded at
 * boot, and line heights stay the same so a language switch does not reflow
 * the screen. Text clip fixes run from index.js.
 *
 * I18nManager.forceRTL must stay false. If a previous build left native
 * isRTL=true, clear it with forceRTL(false) (applies fully on the next cold start).
 */
async function ensureNativeRtlIsOff() {
  if (!I18nManager.isRTL) return;
  // forceRTL() reloads the native host. On Expo Go (especially SDK 56) that
  // reload often kills the process right after the first screen appears.
  if (isExpoGo()) return;

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

  const languageRef = React.useRef(language);
  languageRef.current = language;
  const seenCommunityRef = React.useRef(null);
  const restoreLangRef = React.useRef(null);

  const changeLanguage = useCallback(async (lng) => {
    if (!SUPPORTED.includes(lng) || lng === language) return;

    await saveLanguage(lng);
    // Flip the font before React re-renders so Arabic and English share one layout pass.
    setArabicTextMetricsEnabled(languageNeedsRTL(lng));
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    setIsRTL(languageNeedsRTL(lng));
    setNativeAppLocale(lng);
  }, [language]);

  useEffect(() => {
    return subscribeSessionUser((user) => {
      const id = currentCommunityId(user);
      if (!id) return;
      const membership = (user?.memberships || []).find(
        (row) => Number(row?.community_id) === Number(id),
      );
      const community = membership?.community;
      if (!community || seenCommunityRef.current === id) return;
      const previousId = seenCommunityRef.current;
      seenCommunityRef.current = id;
      const arabicHome = communityPrefersArabic(community);
      if (arabicHome && languageRef.current !== "ar") {
        restoreLangRef.current = languageRef.current;
        void changeLanguage("ar");
        return;
      }
      if (!arabicHome && previousId != null && restoreLangRef.current && languageRef.current === "ar") {
        const restore = restoreLangRef.current;
        restoreLangRef.current = null;
        void changeLanguage(restore);
      }
    });
  }, [changeLanguage]);

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
    direction: "ltr",
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
