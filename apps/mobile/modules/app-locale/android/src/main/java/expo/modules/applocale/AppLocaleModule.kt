package expo.modules.applocale

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppLocaleModule : Module() {
  companion object {
    const val PREFS = "havena_app_locale"
    const val KEY_TAG = "language_tag"

    /** Apply a persisted locale early (called from MainApplication.onCreate). */
    @JvmStatic
    fun applySavedLocale(context: Context) {
      val tag = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_TAG, null)
        ?.trim()
        .orEmpty()
      if (tag.isEmpty()) return
      AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val localeManager = context.getSystemService(android.app.LocaleManager::class.java)
        localeManager?.applicationLocales = android.os.LocaleList.forLanguageTags(tag)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AppLocale")

    /**
     * Sets the Android per-app locale so IMEs (Gboard, Samsung Keyboard, etc.)
     * open the matching keyboard language when a TextInput is focused.
     */
    Function("setAppLocale") { languageTag: String ->
      val tag = languageTag.trim()
      if (tag.isEmpty()) return@Function false

      val context = appContext.reactContext?.applicationContext
        ?: appContext.currentActivity?.applicationContext
        ?: return@Function false

      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_TAG, tag)
        .apply()

      val main = Handler(Looper.getMainLooper())
      main.post {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          val localeManager = context.getSystemService(android.app.LocaleManager::class.java)
          localeManager?.applicationLocales = android.os.LocaleList.forLanguageTags(tag)
        }
      }
      true
    }

    Function("getAppLocale") {
      val locales = AppCompatDelegate.getApplicationLocales()
      val tags = locales.toLanguageTags()
      if (tags.isNotEmpty()) return@Function tags

      val context = appContext.reactContext?.applicationContext ?: return@Function null
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TAG, null)
    }
  }
}
