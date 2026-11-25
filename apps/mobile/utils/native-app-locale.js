import { Platform } from "react-native";
import AppLocale from "../modules/app-locale";

const LANG_TAGS = {
  en: "en-US",
  es: "es-ES",
  ar: "ar-SA",
};

/**
 * Soft-keyboard language switching is OS-limited:
 *
 * Android (native build):
 *   1) AppCompat application locales
 *   2) EditText.setImeHintLocales + InputMethodManager.restartInput on focus
 *   Gboard/Samsung Keyboard may switch only if that language layout is installed.
 *
 * iOS:
 *   Apps cannot force the system keyboard language. We still set AppleLanguages
 *   (best-effort after reload) and apply RTL/LTR on text fields in JS.
 *   Users must enable Arabic/Spanish under Settings → General → Keyboard.
 *
 * Expo Go: native module missing → all calls return false. Use
 * `npx expo run:android` / `npx expo run:ios`.
 */
export function getLanguageTag(lang) {
  return LANG_TAGS[lang] ?? String(lang || "en");
}

export function isNativeAppLocaleAvailable() {
  try {
    return Boolean(AppLocale?.isAvailable?.());
  } catch {
    return false;
  }
}

export function setNativeAppLocale(lang) {
  const tag = getLanguageTag(lang);

  if (Platform.OS === "web") {
    try {
      if (typeof document !== "undefined") {
        document.documentElement.lang = String(lang || "en");
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      }
      return Boolean(AppLocale?.setAppLocale?.(tag));
    } catch {
      return false;
    }
  }

  try {
    return Boolean(AppLocale?.setAppLocale?.(tag));
  } catch {
    if (__DEV__) {
      console.log(
        "[app-locale] Native module unavailable (Expo Go?). Rebuild with: npx expo run:android",
      );
    }
    return false;
  }
}

/**
 * Call after a TextInput is focused. On Android this applies IME hint locales
 * to the focused EditText and restarts the input connection so Gboard can switch.
 */
export function syncKeyboardForFocusedInput(lang) {
  const tag = getLanguageTag(lang);

  try {
    setNativeAppLocale(lang);
  } catch {
    // ignore
  }

  const applyHint = () => {
    try {
      return Boolean(AppLocale?.setImeHintLocales?.(tag));
    } catch {
      return false;
    }
  };

  // Focus lands on the native EditText slightly after the JS onFocus event.
  const immediate = applyHint();
  requestAnimationFrame(applyHint);
  setTimeout(applyHint, 32);
  setTimeout(applyHint, 120);

  return immediate;
}

export function openKeyboardLanguagePicker() {
  try {
    return Boolean(AppLocale?.openInputMethodPicker?.());
  } catch {
    return false;
  }
}
