import { requireNativeModule } from "expo";

type AppLocaleNative = {
  setAppLocale(languageTag: string): boolean;
  getAppLocale(): string | null;
};

function loadModule(): AppLocaleNative {
  try {
    return requireNativeModule<AppLocaleNative>("AppLocale");
  } catch {
    // Expo Go / web without native binary — keyboard locale sync unavailable.
    return {
      setAppLocale: () => false,
      getAppLocale: () => null,
    };
  }
}

export default loadModule();
