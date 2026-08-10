const {
  withMainApplication,
  createRunOncePlugin,
} = require("@expo/config-plugins");

/**
 * Injects early app-locale application in MainApplication.onCreate so
 * soft keyboards (Gboard etc.) match the in-app language on cold start.
 */
function withAppLocaleMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes("expo.modules.applocale.AppLocaleModule")) {
      contents = contents.replace(
        /package [^\n]+\n/,
        (pkg) =>
          `${pkg}\nimport expo.modules.applocale.AppLocaleModule\n`,
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

module.exports = createRunOncePlugin(
  withAppLocaleMainApplication,
  "with-app-locale",
  "1.0.0",
);
