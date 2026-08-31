import { requireOptionalNativeModule } from "expo";

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
    // Optional: Expo Go does not ship this native module. requireNativeModule
    // can take down the Go process instead of throwing a JS error.
    return requireOptionalNativeModule<AppLocaleNative>("AppLocale") ?? unavailable;
  } catch {
    return unavailable;
  }
}

export default loadModule();
