import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import BackButton from "../../../components/ui/back-button";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import AuthLogo from "../../../components/ui/auth-logo";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { Fonts } from "../../../constants/font";
import RoleIcon from "../../../components/ui/role-icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { setCurrentRole } from "../../../constants/role-session";
import { EMAIL_RE } from "../../../utils/form-validation";
import { requestOtp } from "../../../services/auth-api";
import { handleAuthApiError, showApiSuccess } from "../../../utils/auth-errors";
import { encodeRouteEmail, paramString } from "../../../utils/route-params";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { ScreenBrand } from "../../../constants/screen-brand";

const ROLE_BADGE = {
  admin: {
    bg: ScreenBrand.softMint,
    text: ScreenBrand.primary,
    border: "rgba(10, 42, 67, 0.12)",
  },
  resident: {
    bg: "rgba(13, 148, 136, 0.12)",
    text: ScreenBrand.deepTeal,
    border: "rgba(13, 148, 136, 0.28)",
  },
};

const ROLE_BUTTON = {
  solid: ScreenBrand.cta,
  loading: ScreenBrand.ctaLoading,
};

export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { role: roleParam = "resident" } = useLocalSearchParams();
  const role = paramString(roleParam, "resident");

  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

  const [email, setEmail] = useState("");
  const [showEmailError, setShowEmailError] = useState(false);
  const { submitting, run } = useSubmitLock();
  const isValid = EMAIL_RE.test(email.trim());

  const handleEmailChange = (value) => {
    setEmail(value);
    if (showEmailError && EMAIL_RE.test(value.trim())) {
      setShowEmailError(false);
    }
  };

  const handleSendCode = () => {
    if (!isValid || submitting) {
      if (!isValid) setShowEmailError(true);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    run(async () => {
      try {
        await requestOtp(normalizedEmail, { intent: "signup" });
        await showApiSuccess(dialog, t("auth.codeSent"), t("auth.codeSentMsg"));
        router.push({
          pathname: "/screens/verifyregistration",
          params: { role, email: encodeRouteEmail(normalizedEmail) },
        });
      } catch (err) {
        await handleAuthApiError(err, dialog, router, { email: normalizedEmail });
      }
    });
  };

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <BackButton />
      </View>

      <View
        style={[
          styles.roleBadge,
          {
            backgroundColor: ROLE_BADGE[role]?.bg ?? ROLE_BADGE.resident.bg,
            borderColor: ROLE_BADGE[role]?.border ?? ROLE_BADGE.resident.border,
          },
        ]}
      >
        <RoleIcon role={role} size="sm" />
        <Text
          style={[
            styles.roleText,
            { color: ROLE_BADGE[role]?.text ?? ROLE_BADGE.resident.text },
          ]}
        >
          {role === "admin" ? t("auth.communityAdmin") : t("auth.resident")}
        </Text>
      </View>

      <KeyboardSafeScreen
        footerBorderless
        footerStyle={styles.footer}
        contentContainerStyle={styles.scrollContainer}
        keyboardVerticalOffset={8}
        footer={
          <View style={styles.footerInner}>
            <AuthSubmitButton
              label={t("auth.sendCode")}
              loadingLabel={t("auth.sending")}
              enabled={isValid}
              loading={submitting}
              onPress={handleSendCode}
              variant="solid"
              solidColor={ROLE_BUTTON.solid}
              loadingColor={ROLE_BUTTON.loading}
            />
            <Text style={styles.footerText}>
              {t("auth.verificationCodeHint")}
            </Text>
          </View>
        }
      >
        <View style={styles.logoContainer}>
          <AuthLogo compact size={56} />
          <Text style={styles.title}>{t("auth.createAccount")}</Text>
          <Text style={styles.subtitle}>
            {t("auth.enterEmailToStart")}
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.inputLabel}>{t("auth.emailAddress")}</Text>
          <LocaleTextInput
            value={email}
            onChangeText={handleEmailChange}
            placeholder={t("auth.emailPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            style={[styles.emailInput, showEmailError && styles.inputError]}
          />
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ScreenBrand.white,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  roleBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  roleText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  scrollContainer: {
    flexGrow: 0,
    paddingTop: 8,
    paddingBottom: 12,
  },
  footer: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  footerInner: {
    gap: 10,
  },
  logoContainer: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    fontWeight: "700",
    color: ScreenBrand.navy,
    lineHeight: 28,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
    color: ScreenBrand.textSecondary,
  },
  formSection: {
    marginTop: 14,
  },
  inputLabel: {
    marginBottom: 6,
    fontFamily: Fonts.medium,
    fontSize: 14,
    fontWeight: "500",
    color: ScreenBrand.navy,
    lineHeight: 20,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.regular,
    fontSize: 16,
    backgroundColor: ScreenBrand.white,
    color: ScreenBrand.navy,
    marginBottom: 8,
  },
  inputError: {
    borderColor: "#DC2626",
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "400",
    color: ScreenBrand.textSecondary,
  },
});
