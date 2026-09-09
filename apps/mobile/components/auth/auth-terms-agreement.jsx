import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../constants/legal";
import { ScreenBrand } from "../../constants/screen-brand";
import { Fonts } from "../../constants/font";

async function openLegalUrl(url) {
  try {
    await WebBrowser.openBrowserAsync(url, {
      enableBarCollapsing: true,
      showTitle: true,
    });
    return;
  } catch {
    // Fall through to the system browser if the in-app browser is unavailable.
  }
  try {
    await Linking.openURL(url);
  } catch {
    // Keep the auth flow usable if the browser cannot open.
  }
}

export default function AuthTermsAgreement({ agreed, onAgreedChange, error = false }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onAgreedChange(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel={`${t("auth.agreeToTermsPrefix")}${t("auth.termsOfUse")}${t("auth.agreeToTermsConjunction")}${t("auth.privacyPolicy")}`}
          hitSlop={8}
          style={[styles.checkbox, agreed && styles.checkboxChecked, error && !agreed && styles.checkboxError]}
        >
          {agreed ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
        </Pressable>
        <Text
          style={styles.label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          ellipsizeMode="clip"
        >
          {t("auth.agreeToTermsPrefix")}
          <Text style={styles.link} onPress={() => openLegalUrl(TERMS_OF_SERVICE_URL)}>
            {t("auth.termsOfUse")}
          </Text>
          {t("auth.agreeToTermsConjunction")}
          <Text style={styles.link} onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}>
            {t("auth.privacyPolicy")}
          </Text>
        </Text>
      </View>
      {error ? <Text style={styles.error}>{t("auth.agreeToTermsRequired")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: ScreenBrand.border,
    backgroundColor: ScreenBrand.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: ScreenBrand.cta,
    backgroundColor: ScreenBrand.cta,
  },
  checkboxError: {
    borderColor: "#DC2626",
  },
  label: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: ScreenBrand.textSecondary,
    fontFamily: Fonts.regular,
  },
  link: {
    fontWeight: "600",
    color: ScreenBrand.link,
    fontFamily: Fonts.semiBold,
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    fontFamily: Fonts.regular,
    paddingLeft: 28,
  },
});
