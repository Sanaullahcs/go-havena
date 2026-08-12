const {
  withMainApplication,
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require("@expo/config-plugins");

const LOCALE_MODULE = "expo.modules.applocale.AppLocaleModule";

/**
 * Injects early app-locale application so soft keyboards (Gboard etc.)
 * match the in-app language on cold start.
 *
 * iOS uses AppLocaleAppDelegateSubscriber inside the AppLocale pod
 * (see modules/app-locale) — do not import AppLocale from AppDelegate.
 */
function withAppLocaleMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes(LOCALE_MODULE)) {
      contents = contents.replace(
        /package [^\n]+\n/,
        (pkg) => `${pkg}\nimport ${LOCALE_MODULE}\n`,
      );
    }

    if (!contents.includes("AppLocaleModule.applySavedLocale")) {
      contents = contents.replace(
        /override fun onCreate\(\) \{\s*\n\s*super\.onCreate\(\)/,
        `override fun onCreate() {
    super.onCreate()
    // Soft-keyboard locale (ar/es/en) — must run before React Native loads.
    AppLocaleModule.applySavedLocale(this)`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withAppLocaleAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    const serviceName =
      "androidx.appcompat.app.AppLocalesMetadataHolderService";
    const services = mainApplication.service ?? [];
    const hasService = services.some(
      (entry) => entry?.$?.["android:name"] === serviceName,
    );

    if (!hasService) {
      mainApplication.service = [
        ...services,
        {
          $: {
            "android:name": serviceName,
            "android:enabled": "false",
            "android:exported": "false",
          },
          "meta-data": [
            {
              $: {
                "android:name": "autoStoreLocales",
                "android:value": "true",
              },
            },
          ],
        },
      ];
    }

    config.modResults = manifest;
    return config;
  });
}

module.exports = createRunOncePlugin(
  (config) => {
    config = withAppLocaleMainApplication(config);
    config = withAppLocaleAndroidManifest(config);
    return config;
  },
  "with-app-locale",
  "1.2.0",
);
