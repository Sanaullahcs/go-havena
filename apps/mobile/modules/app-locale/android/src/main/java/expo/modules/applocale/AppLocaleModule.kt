package expo.modules.applocale

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.LocaleList
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppLocaleModule : Module() {
  companion object {
    private const val PREFS_NAME = "havena_app_locale"
    private const val PREFS_KEY = "language_tag"

    @JvmStatic
    fun applySavedLocale(context: Context) {
      val tag = context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PREFS_KEY, null)
      if (!tag.isNullOrBlank()) {
        applyAppLocales(tag)
      }
    }

    private fun applyAppLocales(languageTag: String) {
      // Primary tag first; language-only fallback helps Gboard match installed layouts.
      val languageCode = languageTag.substringBefore("-")
      val tags =
        if (languageCode.isNotEmpty() && languageCode != languageTag) {
          "$languageTag,$languageCode"
        } else {
          languageTag
        }
      AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tags))
    }

    private fun localeListFor(languageTag: String): LocaleList {
      val languageCode = languageTag.substringBefore("-")
      return if (languageCode.isNotEmpty() && languageCode != languageTag) {
        LocaleList.forLanguageTags("$languageTag,$languageCode")
      } else {
        LocaleList.forLanguageTags(languageTag)
      }
    }

    /**
     * Closest reliable Android API: tell the IME which language the focused
     * field expects. Gboard / Samsung Keyboard honor this when that layout
     * is installed. Requires API 24+.
     */
    private fun applyImeHintLocales(editText: EditText, languageTag: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
      val locales = localeListFor(languageTag)
      editText.imeHintLocales = locales
      editText.textLocales = locales
      val imm =
        editText.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      imm?.restartInput(editText)
    }

    private fun findFocusedEditText(root: View?): EditText? {
      if (root == null) return null
      if (root is EditText && root.isFocused) return root
      if (root is ViewGroup) {
        for (i in 0 until root.childCount) {
          val found = findFocusedEditText(root.getChildAt(i))
          if (found != null) return found
        }
      }
      return null
    }
  }

  private fun applyImeHintToFocused(languageTag: String): Boolean {
    val activity = appContext.currentActivity ?: return false
    val focused = activity.currentFocus as? EditText
      ?: findFocusedEditText(activity.window?.decorView)
      ?: return false

    activity.runOnUiThread {
      applyImeHintLocales(focused, languageTag)
    }
    return true
  }

  override fun definition() = ModuleDefinition {
    Name("AppLocale")

    Function("isAvailable") {
      true
    }

    Function("setAppLocale") { languageTag: String ->
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(PREFS_KEY, languageTag)
        .apply()
      applyAppLocales(languageTag)
      // Also nudge the currently focused field if any.
      applyImeHintToFocused(languageTag)
      true
    }

    Function("setImeHintLocales") { languageTag: String ->
      applyImeHintToFocused(languageTag)
    }

    Function("getAppLocale") {
      val context = appContext.reactContext?.applicationContext ?: return@Function null
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PREFS_KEY, null)
    }

    Function("openInputMethodPicker") {
      val activity: Activity = appContext.currentActivity ?: return@Function false
      val imm =
        activity.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
          ?: return@Function false
      activity.runOnUiThread {
        imm.showInputMethodPicker()
      }
      true
    }
  }
}
