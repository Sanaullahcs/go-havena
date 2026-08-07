import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, Platform, StyleSheet, View } from "react-native";
import { reloadAppAsync } from "expo";
import * as SecureStore from "expo-secure-store";
import i18n, { initI18n, saveLanguage, SUPPORTED } from "../i18n";
import { Colors } from "../constants/tokens";

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
const DIRECTION_SYNC_KEY = "nbr_direction_sync_v1";

/**
 * Module-level flag: once direction has been verified this JS session,
 * never touch I18nManager again until the user explicitly changes language.
 * Survives Fast Refresh (module is not re-evaluated) and prevents any
 * effect re-run, remount, or background/foreground cycle from flipping direction.
 */
let directionLockedThisSession = false;

function languageNeedsRTL(lng) {
  return RTL_LANGUAGES.includes(lng);
}

async function readSyncToken() {
  try {
    if (Platform.OS === "web") return null;
    return await SecureStore.getItemAsync(DIRECTION_SYNC_KEY);
  } catch {
    return null;
  }
}

async function writeSyncToken(token) {
  try {
    if (Platform.OS === "web") return;
    if (token == null) {
      await SecureStore.deleteItemAsync(DIRECTION_SYNC_KEY);
    } else {
      await SecureStore.setItemAsync(DIRECTION_SYNC_KEY, token);
    }
  } catch {}
}

/**
 * Called ONCE per JS session on startup. If native direction disagrees with
 * the persisted language, attempt a single reload. The sync token prevents
 * infinite reload loops across app restarts.
 */
async function ensureNativeDirectionOnce(needsRTL) {
  if (directionLockedThisSession) return false;
  directionLockedThisSession = true;

  if (I18nManager.isRTL === needsRTL) {
    return false;
  }

  // Always force the correct direction — even if we already tried before.
  // On Expo Go, reloadAppAsync often fails, so we must set it every startup.
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(needsRTL);

  const token = needsRTL ? "rtl" : "ltr";
  const alreadyTried = await readSyncToken();
  if (alreadyTried === token) {
    // Already tried reload for this direction — don't loop, just force and continue
    return false;
  }

  await writeSyncToken(token);
  return true;
}

async function reloadForDirection(reason) {
  try {
    await reloadAppAsync(reason);
    return true;
  } catch {
    return false;
  }
}

export default function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("en");
  const [isRTL, setIsRTL] = useState(() => I18nManager.isRTL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const lng = await initI18n();
        if (cancelled) return;

        const needsRTL = languageNeedsRTL(lng);
        setLanguage(lng);
        setIsRTL(needsRTL);

        const shouldReload = await ensureNativeDirectionOnce(needsRTL);

        if (!cancelled) setReady(true);

        if (shouldReload && !cancelled) {
          await reloadForDirection("Fix RTL direction on startup");
        }
      } catch (err) {
        console.warn("[LanguageProvider] init failed", err);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const changeLanguage = useCallback(async (lng) => {
    if (!SUPPORTED.includes(lng) || lng === language) return;

    const needsRTL = languageNeedsRTL(lng);
    const directionChanged = isRTL !== needsRTL;

    await saveLanguage(lng);
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    setIsRTL(needsRTL);

    if (directionChanged) {
      directionLockedThisSession = false;
      await writeSyncToken(null);
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(needsRTL);
      await writeSyncToken(needsRTL ? "rtl" : "ltr");

      const reloaded = await reloadForDirection("Language direction changed");
      if (!reloaded) {
        directionLockedThisSession = true;
      }
    }
  }, [language, isRTL]);

  return (
    <LanguageContext.Provider value={{ language, isRTL, changeLanguage, ready }}>
      {ready ? (
        <View style={[styles.directionRoot, { direction: isRTL ? "rtl" : "ltr" }]}>
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
