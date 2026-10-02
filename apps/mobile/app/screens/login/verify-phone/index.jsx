import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import AuthFlowTopBar from "../../../../components/auth/auth-flow-top-bar";
import AuthHeroText from "../../../../components/auth/auth-hero-text";
import AuthSubmitButton from "../../../../components/ui/auth-submit-button";
import OTPInput from "../../../../components/ui/otp-input";
import AuthInlineLoader from "../../../../components/auth/auth-inline-loader";
import KeyboardSafeScreen from "../../../../components/layout/keyboard-safe-screen";
import ScreenStatusBar from "../../../../components/layout/screen-status-bar";
import { authStyles } from "../../../../constants/auth-styles";
import { authLayoutStyles as layout } from "../../../../constants/auth-layout";
import { syncRoleFromUser } from "../../../../constants/role-session";
import { isCommunityAdminRole } from "../../../../services/community-access";
import {
  requestOtp,
  verifyOtp,
  fetchMe,
} from "../../../../services/auth-api";
import { handleAuthApiError } from "../../../../utils/auth-errors";
import { getApiErrorMessage } from "../../../../utils/api-error-core";
import { useAppDialog } from "../../../../providers/app-dialog-provider";
import { useOtpResendLimit } from "../../../../hooks/use-otp-resend-limit";
import OtpResendFooter from "../../../../components/auth/otp-resend-footer";
import { extractOtpRateLimitFromResponse } from "../../../../utils/otp-rate-limit";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import AuthSuccessOverlay from "../../../../components/ui/auth-success-overlay";
import {
  openHomeAfterLogin,
} from "../../../../constants/onboarding-routes";
import { decodeRouteEmail, paramString } from "../../../../utils/route-params";
import { ScreenBrand as B } from "../../../../constants/screen-brand";
import { DEV_OTP_HINT, shouldShowDevOtpHint } from "../../../../constants/api-config";

export default function VerifyPhoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const {
    email: emailParam = "",
    phone: phoneParam = "",
    sending: sendingParam = "",
  } = useLocalSearchParams();
  const email = decodeRouteEmail(emailParam) || decodeRouteEmail(phoneParam);
  const shouldSendOnMount = paramString(sendingParam) === "1";

  const [otp, setOtp] = useState("");
  const [showOtpError, setShowOtpError] = useState(false);
  const [otpErrorMessage, setOtpErrorMessage] = useState("");
  const [otpSending, setOtpSending] = useState(shouldSendOnMount);
  const [otpIssued, setOtpIssued] = useState(!shouldSendOnMount);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState(false);
  const [otpRefocusToken, setOtpRefocusToken] = useState(0);
  const { submitting, run } = useSubmitLock();
  const [showSuccess, setShowSuccess] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState(null);
  const {
    canResend,
    countdownLabel,
    lockType,
    applyRateLimit,
    applyRateLimitFromError,
  } = useOtpResendLimit(null, { dialog });
  const otpDigits = otp.replace(/[^0-9]/g, "");
  const isValid = otpDigits.length === 6;
  const emailDisplay = email || t("auth.yourEmail");
  const verifyLockRef = useRef(false);
  const initialSendRef = useRef(false);
  const showDevOtpHint = shouldShowDevOtpHint() && otpIssued;

  useEffect(() => {
    if (!shouldSendOnMount || !email || initialSendRef.current) return;
    initialSendRef.current = true;

    let cancelled = false;

    (async () => {
      setOtpSending(true);
      setOtpIssued(false);
      try {
        const result = await requestOtp(email, { intent: "login" });
        if (!cancelled) {
          applyRateLimit(result?.rate_limit ?? extractOtpRateLimitFromResponse({ data: result }));
          setOtpIssued(true);
        }
      } catch (err) {
        if (!cancelled) {
          setOtpIssued(false);
          if (!applyRateLimitFromError(err)) {
            await handleAuthApiError(err, dialog, router, { email });
          }
        }
      } finally {
        if (!cancelled) setOtpSending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldSendOnMount, email, dialog, router, applyRateLimit, applyRateLimitFromError]);

  const submitVerification = useCallback(
    (code) => {
      const digits = String(code).replace(/[^0-9]/g, "");
      if (digits.length !== 6 || submitting || otpSending || verifyLockRef.current || lockType === "security") {
        if (digits.length !== 6) {
          setOtpErrorMessage(t("auth.enter6DigitCode"));
          setShowOtpError(true);
        }
        return;
      }

      if (!otpIssued) {
        setOtpErrorMessage(t("auth.codeNotSentYet"));
        setShowOtpError(true);
        return;
      }

      verifyLockRef.current = true;

      run(async () => {
        try {
          const result = await verifyOtp(email, digits, { intent: "login" });
          let user = result.user;
          try {
            user = await fetchMe();
          } catch {
            // session from verifyOtp is enough
          }
          syncRoleFromUser(user);
          setVerifiedUser(user);
          setShowSuccess(true);
        } catch (err) {
          verifyLockRef.current = false;
          setOtpErrorMessage(
            err?.code === "INVALID_OTP"
              ? t("auth.invalidOrExpiredCode")
              : getApiErrorMessage(err) || t("auth.enter6DigitCode"),
          );
          setShowOtpError(true);
          if (!applyRateLimitFromError(err)) {
            await handleAuthApiError(err, dialog, router, { email });
          }
          setOtpRefocusToken((token) => token + 1);
        }
      });
    },
    [submitting, otpSending, otpIssued, run, email, dialog, router, lockType, applyRateLimitFromError, t],
  );

  const handleVerify = () => {
    submitVerification(otpDigits);
  };

  const handleResend = async () => {
    if (submitting || otpSending || resending || !canResend) return;

    setResending(true);
    try {
      const result = await requestOtp(email, { intent: "login" });
      const rateLimit = result?.rate_limit ?? extractOtpRateLimitFromResponse({ data: result });
      const limits = applyRateLimit(rateLimit);
      setOtpIssued(true);
      if (!limits.locked) {
        setResendNotice(true);
        setTimeout(() => setResendNotice(false), 2500);
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
    setOtp(value.replace(/[^0-9]/g, "").slice(0, 6));
    if (showOtpError) {
      setShowOtpError(false);
      setOtpErrorMessage("");
    }
  };

  const handleOtpComplete = (code) => {
    handleOtpChange(code);
    submitVerification(code);
  };

  const busy = submitting || otpSending;

  const successSubtitle =
    verifiedUser &&
    isCommunityAdminRole(verifiedUser) &&
    verifiedUser?.access?.next_step === "ready"
      ? t("auth.openingAdminDashboard")
      : t("auth.signedInToHavena");

  const resendFooter = (
    <OtpResendFooter
      canResend={canResend}
      countdownLabel={countdownLabel}
      lockType={lockType}
      resending={resending}
      resendNotice={resendNotice}
      busy={busy}
      onResend={handleResend}
      mutedStyle={styles.resendMuted}
    />
  );

  return (
    <>
      <AuthSuccessOverlay
        visible={showSuccess}
        title={t("auth.welcomeBackSuccess")}
        subtitle={successSubtitle}
        onComplete={() => {
          setShowSuccess(false);
          openHomeAfterLogin(router, verifiedUser);
        }}
      />

      <ScreenStatusBar style="dark" opaque androidBackgroundColor={B.canvas} />
      <SafeAreaView style={[layout.container, styles.container]} edges={["top", "left", "right", "bottom"]}>
        <AuthFlowTopBar current={2} total={2} showBack />

        <KeyboardSafeScreen
          footerBorderless
          footerStyle={styles.footer}
          contentContainerStyle={layout.scrollBody}
          scrollProps={{ bounces: false }}
          keyboardVerticalOffset={8}
          footer={
            <View style={layout.footerInner}>
              <AuthSubmitButton
                label={t("auth.verifySignIn")}
                loadingLabel={t("auth.verifying")}
                enabled={isValid && !otpSending && otpIssued && lockType !== "security"}
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
          }
        >
          <View style={layout.formBlock}>
            <AuthHeroText
              eyebrow={t("auth.step2of2")}
              title={t("auth.enterVerificationCode")}
              subtitle={
                otpSending ? (
                  t("auth.sendingCodeToEmail")
                ) : (
                  <>
                    {t("auth.weSentCodeTo") + " "}
                    <Text style={layout.phoneHighlight}>{emailDisplay}</Text>
                  </>
                )
              }
            />

            <View style={layout.fieldBlock}>
              {otpSending ? (
                <AuthInlineLoader text={t("auth.sendingTo", { phone: emailDisplay })} />
              ) : (
                <>
                  <Text style={layout.fieldLabel}>{t("auth.verificationCode")}</Text>
                  <OTPInput
                    length={6}
                    onOTPChange={handleOtpChange}
                    onComplete={handleOtpComplete}
                    editable={!busy && !showSuccess}
                    hasError={showOtpError}
                    refocusToken={otpRefocusToken}
                  />
                  {showOtpError ? (
                    <Text style={authStyles.inputErrorText}>
                      {otpErrorMessage || t("auth.enter6DigitCode")}
                    </Text>
                  ) : null}
                  {showDevOtpHint ? (
                    <Text style={layout.devHint}>
                      Dev · <Text style={layout.devHintCode}>{DEV_OTP_HINT}</Text>
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </KeyboardSafeScreen>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: B.canvas,
  },
  footer: {
    paddingHorizontal: 0,
    paddingTop: 16,
    backgroundColor: B.canvas,
  },
  resendMuted: {
    opacity: 0.6,
  },
});
