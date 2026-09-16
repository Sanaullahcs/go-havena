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
import { authLayoutStyles as layout } from "../../../constants/auth-layout";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { useOtpResendLimit } from "../../../hooks/use-otp-resend-limit";
import OtpResendFooter from "../../../components/auth/otp-resend-footer";
import { extractOtpRateLimitFromResponse } from "../../../utils/otp-rate-limit";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import AuthSuccessOverlay from "../../../components/ui/auth-success-overlay";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { decodeRouteEmail, paramString } from "../../../utils/route-params";
import { ScreenBrand as B } from "../../../constants/screen-brand";

export default function VerifyRegistrationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { role: roleParam = "resident", email: emailParam = "", phone: phoneParam = "" } = useLocalSearchParams();
  const role = paramString(roleParam, "resident");
  const email = decodeRouteEmail(emailParam) || decodeRouteEmail(phoneParam);
  const [otp, setOtp] = useState("");
  const [showOtpError, setShowOtpError] = useState(false);
  const [otpRefocusToken, setOtpRefocusToken] = useState(0);
  const { submitting, run } = useSubmitLock();
  const [resending, setResending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState(null);
  const {
    canResend,
    countdownLabel,
    lockType,
    applyRateLimit,
    applyRateLimitFromError,
  } = useOtpResendLimit(null, { dialog });
  const isValid = otp.length === 6;
  const emailDisplay = email || t("auth.yourEmail");
  const signupOptions = {
    intent: "signup",
    ...(role === "admin" ? { portal: "community_admin_dashboard" } : {}),
  };

  const handleVerify = () => {
    if (!isValid || submitting || lockType === "security") {
      if (!isValid) setShowOtpError(true);
      return;
    }

    Keyboard.dismiss();
    run(async () => {
      try {
        const result = await verifyOtp(email, otp, {
          ...signupOptions,
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
        if (!applyRateLimitFromError(err)) {
          await handleAuthApiError(err, dialog, router, { email });
        }
        setOtpRefocusToken((token) => token + 1);
      }
    });
  };

  const handleResend = async () => {
    if (submitting || resending || !canResend) return;

    setResending(true);
    try {
      const result = await requestOtp(email, signupOptions);
      const rateLimit = result?.rate_limit ?? extractOtpRateLimitFromResponse({ data: result });
      const limits = applyRateLimit(rateLimit);
      if (!limits.locked) {
        await showApiSuccess(dialog, t("auth.codeSent"), t("auth.newVerificationCodeSent"));
      }
    } catch (err) {
      if (!applyRateLimitFromError(err)) {
        await handleAuthApiError(err, dialog, router, { email });
      }
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (value) => {
    setOtp(value);
    if (showOtpError) {
      setShowOtpError(false);
    }
  };

  const resendFooter = (
    <OtpResendFooter
      canResend={canResend}
      countdownLabel={countdownLabel}
      lockType={lockType}
      resending={resending}
      busy={submitting}
      onResend={handleResend}
      mutedStyle={styles.resendMuted}
      textStyle={styles.resendText}
    />
  );

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      <AuthSuccessOverlay
        visible={showSuccess}
        title={t("auth.emailVerified")}
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
              <Text style={styles.title}>{t("auth.verifyYourEmail")}</Text>
              <Text style={styles.subtitle}>{t("auth.enterCodeSentTo")}</Text>
              <Text style={styles.numberDisplay}>{emailDisplay}</Text>
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
                enabled={isValid && lockType !== "security"}
                loading={submitting}
                onPress={handleVerify}
                solidColor={B.cta}
                loadingColor={B.ctaLoading}
                style={B.buttonShadow}
              />
              <Text style={layout.otpExpireNote}>
                {t("auth.codeExpireIn5Min")}
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
