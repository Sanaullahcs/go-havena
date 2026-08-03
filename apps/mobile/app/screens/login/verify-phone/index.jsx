import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
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
import { toDisplayPhone } from "../../../../utils/phone";
import {
  requestOtp,
  verifyOtp,
  fetchMe,
} from "../../../../services/auth-api";
import { handleAuthApiError } from "../../../../utils/auth-errors";
import { useAppDialog } from "../../../../providers/app-dialog-provider";
import { useOtpCountdown } from "../../../../hooks/use-otp-countdown";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import AuthSuccessOverlay from "../../../../components/ui/auth-success-overlay";
import { navigateAfterAuth } from "../../../../constants/onboarding-routes";
import { decodeRoutePhone, paramString } from "../../../../utils/route-params";
import { Shadows } from "../../../../constants/tokens";
import { DEV_OTP_HINT } from "../../../../constants/api-config";

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const {
    phone: phoneParam = "",
    sending: sendingParam = "",
  } = useLocalSearchParams();
  const phone = decodeRoutePhone(phoneParam);
  const shouldSendOnMount = paramString(sendingParam) === "1";

  const [otp, setOtp] = useState("");
  const [showOtpError, setShowOtpError] = useState(false);
  const [otpSending, setOtpSending] = useState(shouldSendOnMount);
  const [resendNotice, setResendNotice] = useState(false);
  const [otpRefocusToken, setOtpRefocusToken] = useState(0);
  const { submitting, run } = useSubmitLock();
  const [showSuccess, setShowSuccess] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState(null);
  const { canResend, countdownLabel, resetCountdown } = useOtpCountdown();
  const otpDigits = otp.replace(/[^0-9]/g, "");
  const isValid = otpDigits.length === 6;
  const phoneDisplay = toDisplayPhone(phone) || "your phone";
  const verifyLockRef = useRef(false);
  const initialSendRef = useRef(false);

  useEffect(() => {
    if (!shouldSendOnMount || !phone || initialSendRef.current) return;
    initialSendRef.current = true;

    let cancelled = false;

    (async () => {
      setOtpSending(true);
      try {
        await requestOtp(phone, { intent: "login" });
        if (!cancelled) resetCountdown();
      } catch (err) {
        if (!cancelled) {
          await handleAuthApiError(err, dialog, router, { phone });
        }
      } finally {
        if (!cancelled) setOtpSending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldSendOnMount, phone, dialog, router, resetCountdown]);

  const submitVerification = useCallback(
    (code) => {
      const digits = String(code).replace(/[^0-9]/g, "");
      if (digits.length !== 6 || submitting || otpSending || verifyLockRef.current) {
        if (digits.length !== 6) setShowOtpError(true);
        return;
      }

      verifyLockRef.current = true;

      run(async () => {
        try {
          const result = await verifyOtp(phone, digits, { intent: "login" });
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
          setShowOtpError(true);
          await handleAuthApiError(err, dialog, router, { phone });
          setOtpRefocusToken((token) => token + 1);
        }
      });
    },
    [submitting, otpSending, run, phone, dialog, router],
  );

  const handleVerify = () => {
    submitVerification(otpDigits);
  };

  const handleResend = () => {
    if (submitting || otpSending || !canResend) return;

    run(async () => {
      setOtpSending(true);
      try {
        await requestOtp(phone, { intent: "login" });
        resetCountdown();
        setResendNotice(true);
        setTimeout(() => setResendNotice(false), 2500);
      } catch (err) {
        await handleAuthApiError(err, dialog, router, { phone });
      } finally {
        setOtpSending(false);
      }
    });
  };

  const handleOtpChange = (value) => {
    setOtp(value.replace(/[^0-9]/g, "").slice(0, 6));
    if (showOtpError) {
      setShowOtpError(false);
    }
  };

  const handleOtpComplete = (code) => {
    handleOtpChange(code);
    submitVerification(code);
  };

  const busy = submitting || otpSending;

  const successSubtitle = verifiedUser && isCommunityAdminRole(verifiedUser)
    ? "Opening your admin dashboard…"
    : "You're signed in to Havena";

  const resendFooter = resendNotice ? (
    <Text style={[layout.footerNote, layout.resendSuccess]}>New code sent</Text>
  ) : canResend ? (
    <TouchableOpacity onPress={handleResend} disabled={busy}>
      <Text style={[layout.footerNote, layout.resendHighlight, busy && styles.resendMuted]}>
        {otpSending ? "Sending…" : "Resend code"}
      </Text>
    </TouchableOpacity>
  ) : (
    <Text style={layout.footerNote}>
      Resend available in{" "}
      <Text style={layout.resendHighlight}>{countdownLabel}</Text>
    </Text>
  );

  return (
    <>
      <AuthSuccessOverlay
        visible={showSuccess}
        title="Welcome back!"
        subtitle={successSubtitle}
        onComplete={() => {
          setShowSuccess(false);
          navigateAfterAuth(router, verifiedUser, { mode: "login" });
        }}
      />

      <ScreenStatusBar style="dark" opaque />
      <SafeAreaView style={layout.container} edges={["top", "left", "right"]}>
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
                label="Verify & Sign In"
                loadingLabel="Verifying…"
                enabled={isValid && !otpSending}
                loading={submitting}
                onPress={handleVerify}
                style={Shadows.button}
              />
              {resendFooter}
            </View>
          }
        >
          <View style={layout.formBlock}>
            <AuthHeroText
              eyebrow="Step 2 of 2"
              title="Enter verification code"
              subtitle={
                otpSending ? (
                  "Sending a 6-digit code to your phone…"
                ) : (
                  <>
                    We sent a code to{" "}
                    <Text style={layout.phoneHighlight}>{phoneDisplay}</Text>
                  </>
                )
              }
            />

            <View style={layout.fieldBlock}>
              {otpSending ? (
                <AuthInlineLoader text={`Sending to ${phoneDisplay}…`} />
              ) : (
                <>
                  <Text style={layout.fieldLabel}>Verification code</Text>
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
                      Enter the 6-digit verification code
                    </Text>
                  ) : null}
                  {__DEV__ ? (
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
  footer: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  resendMuted: {
    opacity: 0.6,
  },
});
