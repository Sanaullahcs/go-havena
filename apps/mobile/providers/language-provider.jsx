import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { I18nManager, StyleSheet, View, ActivityIndicator } from "react-native";
import i18n, { initI18n, saveLanguage, SUPPORTED } from "../i18n";
import { Colors } from "../constants/tokens";
import { prepareNativeLocaleForSystemUI, setNativeAppLocale } from "../utils/native-app-locale";
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

function languageNeedsRTL(lng) {
  return RTL_LANGUAGES.includes(String(lng || "").toLowerCase());
}

/**
 * Arabic changes the copy, not the chrome. The menu, header, and tabs stay
 * on the same side as English. Forcing RTL moves that chrome and looks wrong.
 */
function publishDirection() {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(false);
  I18nManager.swapLeftAndRightInRTL(false);
  try {
    I18nManager.isRTL = false;
    I18nManager.doLeftAndRightSwapInRTL = false;
    const constants = I18nManager.getConstants?.();
    if (constants) {
      constants.isRTL = false;
      constants.doLeftAndRightSwapInRTL = false;
    }
  } catch {
    // Layout stays left-to-right either way.
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
        const rtl = languageNeedsRTL(lng);
        publishDirection();
        setLanguage(lng);
        setIsRTL(rtl);
        setArabicTextMetricsEnabled(rtl);
        setNativeAppLocale(lng);
        prepareNativeLocaleForSystemUI(lng);
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
    setNativeAppLocale(lng);
    prepareNativeLocaleForSystemUI(lng);
    const rtl = languageNeedsRTL(lng);
    publishDirection();
    setArabicTextMetricsEnabled(rtl);
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    setIsRTL(rtl);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, isRTL, changeLanguage, ready }}>
      {ready ? (
        <View collapsable={false} style={[styles.directionRoot, styles.directionLtr]}>
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
