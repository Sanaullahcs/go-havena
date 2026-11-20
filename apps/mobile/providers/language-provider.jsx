import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, DevSettings, I18nManager, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
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
 * Native layout direction is fixed when the process starts. Changing language
 * updates the strings immediately, but I18nManager.isRTL stays at the old
 * value until the JS runtime loads again. Sync the flag, then reload once.
 */
function nativeDirectionMatches(lng) {
  return I18nManager.isRTL === languageNeedsRTL(lng);
}

function applyNativeDirection(lng) {
  const rtl = languageNeedsRTL(lng);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}

async function reloadApp() {
  if (typeof __DEV__ !== "undefined" && __DEV__ && DevSettings?.reload) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}

/** @returns {Promise<boolean>} true when a reload was started */
async function syncNativeDirection(lng) {
  if (nativeDirectionMatches(lng) || isExpoGo()) return false;
  applyNativeDirection(lng);
  try {
    await SecureStore.setItemAsync(STALE_RTL_KEY, languageNeedsRTL(lng) ? "rtl" : "ltr");
  } catch {
    // The direction flag is already stored by I18nManager.
  }
  try {
    await reloadApp();
    return true;
  } catch (err) {
    console.warn("[LanguageProvider] direction reload failed", err);
    return false;
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
        const lng = await initI18n();
        if (cancelled) return;
        if (await syncNativeDirection(lng)) return;

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
    setNativeAppLocale(lng);
    const rtl = languageNeedsRTL(lng);
    // Flip the font before React re-renders so Arabic and English share one layout pass.
    setArabicTextMetricsEnabled(rtl);
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    setIsRTL(rtl);
    if (await syncNativeDirection(lng)) return;
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
        <View style={[styles.directionRoot, isRTL ? styles.directionRtl : styles.directionLtr]}>
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
  directionLtr: {
    direction: "ltr",
  },
  directionRtl: {
    direction: "rtl",
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
