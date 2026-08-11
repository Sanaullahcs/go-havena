import { requireNativeModule } from "expo";

type AppLocaleNative = {
  isAvailable(): boolean;
  setAppLocale(languageTag: string): boolean;
  setImeHintLocales(languageTag: string): boolean;
  getAppLocale(): string | null;
  openInputMethodPicker(): boolean;
};

const unavailable: AppLocaleNative = {
  isAvailable: () => false,
  setAppLocale: () => false,
  setImeHintLocales: () => false,
  getAppLocale: () => null,
  openInputMethodPicker: () => false,
};

function loadModule(): AppLocaleNative {
  try {
    return requireNativeModule<AppLocaleNative>("AppLocale");
  } catch {
    // Expo Go / web without native binary — keyboard locale sync unavailable.
    return unavailable;
  }
}

export default loadModule();
