import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";
import BackButton from "../../../components/ui/back-button";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import OTPInput from "../../../components/ui/otp-input";
import AuthLogo from "../../../components/ui/auth-logo";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { Fonts } from "../../../constants/font";
import { authStyles } from "../../../constants/auth-styles";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { toDisplayPhone } from "../../../utils/phone";
import { setCurrentRole } from "../../../constants/role-session";
import {
  requestOtp,
  verifyOtp,
  fetchMe,
} from "../../../services/auth-api";
import {
  handleAuthApiError,
  showApiSuccess,
} from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { useOtpCountdown } from "../../../hooks/use-otp-countdown";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import AuthSuccessOverlay from "../../../components/ui/auth-success-overlay";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { decodeRoutePhone, paramString } from "../../../utils/route-params";
import { ScreenBrand as B } from "../../../constants/screen-brand";

export default function VerifyRegistrationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { role: roleParam = "resident", phone: phoneParam = "" } = useLocalSearchParams();
  const role = paramString(roleParam, "resident");
  const phone = decodeRoutePhone(phoneParam);
  const [otp, setOtp] = useState("");
  const [showOtpError, setShowOtpError] = useState(false);
  const [otpRefocusToken, setOtpRefocusToken] = useState(0);
  const { submitting, run } = useSubmitLock();
  const [showSuccess, setShowSuccess] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState(null);
  const { canResend, countdownLabel, resetCountdown } = useOtpCountdown();
  const isValid = otp.length === 6;
  const phoneDisplay = toDisplayPhone(phone) || "+1 555-123-4567";

  const handleVerify = () => {
    if (!isValid || submitting) {
      if (!isValid) setShowOtpError(true);
      return;
    }

    Keyboard.dismiss();
    run(async () => {
      try {
        const result = await verifyOtp(phone, otp, {
          intent: "signup",
          role,
        });
        setCurrentRole(role);
        let user = result.user;
        try {
          user = await fetchMe();
        } catch {
          // continue with session from verifyOtp
        }
        setVerifiedUser(user);
        setShowSuccess(true);
      } catch (err) {
        setShowOtpError(true);
        await handleAuthApiError(err, dialog, router, { phone });
        setOtpRefocusToken((token) => token + 1);
      }
    });
  };

  const handleResend = () => {
    if (submitting || !canResend) return;

    run(async () => {
      try {
        await requestOtp(phone, { intent: "signup" });
        resetCountdown();
        await showApiSuccess(dialog, t("auth.codeSent"), t("auth.newVerificationCodeSent"));
      } catch (err) {
        await handleAuthApiError(err, dialog, router, { phone });
      }
    });
  };

  const handleOtpChange = (value) => {
    setOtp(value);
    if (showOtpError) {
      setShowOtpError(false);
    }
  };

  const resendFooter = canResend ? (
    <TouchableOpacity onPress={handleResend} disabled={submitting}>
      <Text
        style={[
          styles.resendText,
          styles.resendHighlight,
          submitting && styles.resendMuted,
        ]}
      >
        {submitting ? t("auth.sending") : t("auth.resendCode")}
      </Text>
    </TouchableOpacity>
  ) : (
    <Text style={styles.resendText}>
      {t("auth.resendCodeIn") + " "}
      <Text style={styles.resendHighlight}>{countdownLabel}</Text>
    </Text>
  );

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      <AuthSuccessOverlay
        visible={showSuccess}
        title={t("auth.numberVerified")}
        subtitle={role === "admin" ? t("auth.chooseRegionAdmin") : t("auth.chooseRegionNext")}
        onComplete={() => {
          setShowSuccess(false);
          navigateAfterAuth(router, verifiedUser, { role });
        }}
      />
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <BackButton />
        </View>

        <KeyboardSafeScreen
          contentContainerStyle={styles.scrollBody}
          scrollProps={{ bounces: false }}
          keyboardAvoiding={false}
        >
          <View style={styles.formBlock}>
            <View style={styles.logoContainer}>
              <AuthLogo compact size={68} />
              <Text style={styles.title}>{t("auth.verifyYourNumber")}</Text>
              <Text style={styles.subtitle}>{t("auth.enterCodeSentTo")}</Text>
              <Text style={styles.numberDisplay}>{phoneDisplay}</Text>
            </View>

            <View style={styles.otpContainer}>
              <Text style={styles.otpLabel}>{t("auth.enterCode")}</Text>
              <OTPInput
                length={6}
                onOTPChange={handleOtpChange}
                onComplete={handleOtpChange}
                editable={!submitting && !showSuccess}
                hasError={showOtpError}
                refocusToken={otpRefocusToken}
              />
              {showOtpError ? (
                <Text style={authStyles.inputErrorText}>
                  {t("auth.enter6DigitCode")}
                </Text>
              ) : null}
            </View>

            <View style={styles.actionsBlock}>
              <AuthSubmitButton
                label={t("auth.verifyContinue")}
                loadingLabel={t("auth.verifying")}
                enabled={isValid}
                loading={submitting}
                onPress={handleVerify}
                solidColor={B.cta}
                loadingColor={B.ctaLoading}
                style={B.buttonShadow}
              />
              <Text style={styles.footerText}>
                {t("auth.codeExpireIn2Min")}
              </Text>
              {resendFooter}
            </View>
          </View>
        </KeyboardSafeScreen>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: B.canvas,
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 14,
  },
  scrollBody: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 24,
  },
  formBlock: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: 28,
  },
  actionsBlock: {
    marginTop: 8,
    gap: 12,
    width: "100%",
  },
  logoContainer: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    fontWeight: "700",
    color: B.text,
    lineHeight: 32,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
    color: B.textSecondary,
  },
  numberDisplay: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    fontWeight: "600",
    color: B.teal,
    lineHeight: 24,
    marginTop: 4,
  },
  otpContainer: {
    gap: 12,
    width: "100%",
    alignItems: "stretch",
  },
  otpLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    fontWeight: "500",
    color: B.text,
    lineHeight: 20,
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "400",
    color: B.textSecondary,
  },
  resendText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "400",
    color: B.textSecondary,
  },
  resendHighlight: {
    fontWeight: "600",
    color: B.teal,
  },
  resendMuted: {
    opacity: 0.6,
  },
});
