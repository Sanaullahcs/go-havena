import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import AuthEmailField from "../../../components/auth/auth-email-field";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Routes, getPostAuthRoute } from "../../../constants/onboarding-routes";
import { prepareAuthScreenChrome } from "../../../components/layout/chrome-manager";
import { isGuestPendingApproval } from "../../../services/community-access";
import AuthFlowTopBar from "../../../components/auth/auth-flow-top-bar";
import AuthHeroText from "../../../components/auth/auth-hero-text";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import AuthInlineLoader from "../../../components/auth/auth-inline-loader";
import OTPInput from "../../../components/ui/otp-input";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import {
  validateUserEmail,
  validateGuestInviteCodeForm,
  hasFieldErrors,
} from "../../../utils/form-validation";
import { normalizeInviteCode } from "../../../utils/guest-invite";
import { requestGuestOtp, verifyGuestOtp, verifyGuestInvite } from "../../../services/guests-api";
import { setSession } from "../../../services/auth-session";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useOtpCountdown } from "../../../hooks/use-otp-countdown";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { handleAuthApiError } from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { authLayoutStyles as layout } from "../../../constants/auth-layout";
import { authStyles } from "../../../constants/auth-styles";
import { DEV_OTP_HINT } from "../../../constants/api-config";
import { Fonts } from "../../../constants/font";
import { Colors, Shadows } from "../../../constants/tokens";
import { ScreenBrand } from "../../../constants/screen-brand";
import { sf, sw } from "../../../utils/responsive";
import { guestAccessNoticeMessage } from "../../../utils/guest-access-schedule";

const getStepMeta = (t) => ({
  email: {
    current: 1,
    eyebrow: t("guest.guestAccess"),
    title: t("guest.loginAsGuest"),
    subtitle: t("guest.useInvitationEmail"),
    button: t("auth.sendCode"),
    loading: t("auth.sending"),
  },
  otp: {
    current: 2,
    eyebrow: t("guest.step2of3"),
    title: t("auth.enterVerificationCode"),
    subtitle: null,
    button: t("auth.verifySignIn"),
    loading: t("auth.verifying"),
  },
  invite: {
    current: 3,
    eyebrow: t("guest.inviteCode"),
    title: t("guest.enterInviteCode"),
    subtitle: t("guest.useHostCode"),
    button: t("guest.verifyInvite"),
    loading: t("auth.verifying"),
  },
});

export default function GuestLoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { notice } = useLocalSearchParams();
  const { submitting, run } = useSubmitLock();
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [otp, setOtp] = useState("");
  const [showOtpError, setShowOtpError] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState(false);
  const [otpInputKey, setOtpInputKey] = useState(0);
  const [otpRefocusToken, setOtpRefocusToken] = useState(0);
  const [inviteCode, setInviteCode] = useState("");
  const normalizedEmail = email.trim().toLowerCase();
  const emailDisplay = normalizedEmail || t("auth.yourEmail");
  const otpDigits = otp.replace(/[^0-9]/g, "");
  const STEP_META = getStepMeta(t);
  const meta = STEP_META[step] ?? STEP_META.email;
  const { canResend, countdownLabel, resetCountdown } = useOtpCountdown();
  const verifyLockRef = useRef(false);

  const emailFormatError = validateUserEmail(email);
  const emailValid = !emailFormatError;
  const emailError =
    emailFocused && email.trim().length > 0 ? emailFormatError : null;

  const inviteLiveErrors = useMemo(
    () => validateGuestInviteCodeForm(inviteCode),
    [inviteCode],
  );
  const inviteValid = !hasFieldErrors(inviteLiveErrors);
  const inviteFieldError = showError("inviteCode", inviteLiveErrors);

  const canSubmit = useMemo(() => {
    if (step === "email") return emailValid;
    if (step === "otp") return otpDigits.length === 6;
    return inviteValid;
  }, [step, emailValid, otpDigits, inviteValid]);

  const busy = submitting || otpSending;

  useEffect(() => {
    const message = guestAccessNoticeMessage(typeof notice === "string" ? notice : notice?.[0]);
    if (!message) return;

    const title =
      notice === "GUEST_ACCESS_REVOKED" || notice?.[0] === "GUEST_ACCESS_REVOKED"
        ? t("guest.guestAccessRevoked")
        : notice === "GUEST_ACCESS_EXPIRED" || notice?.[0] === "GUEST_ACCESS_EXPIRED"
          ? t("guest.guestAccessExpired")
          : t("guest.guestAccess");

    dialog.showError(title, message).catch(() => {});
  }, [dialog, notice, t]);

  const goToResidentLogin = () => {
    prepareAuthScreenChrome();
    router.replace(Routes.LOGIN);
  };

  const finishLogin = useCallback(async (res) => {
    if (res.token && res.user) {
      await setSession({ token: res.token, user: res.user });
    }

    const pendingApproval =
      res.invitation_status === "pending_approval" ||
      res.code === "PENDING_APPROVAL" ||
      isGuestPendingApproval(res.user);

    if (pendingApproval) {
      router.replace({ pathname: Routes.PENDING_COMMUNITY, params: { guest: "1" } });
      return;
    }

    if (res.token && res.user) {
      const route = getPostAuthRoute(res.user);
      router.replace({ pathname: route.pathname, params: route.params });
      return;
    }

    if (res.needs_invite_code) {
      resetTouched();
      setStep("invite");
      return;
    }

    resetTouched();
    setStep("invite");
  }, [router, resetTouched]);

  const handleBack = () => {
    if (step === "email") {
      if (router.canGoBack?.()) {
        router.back();
      } else {
        goToResidentLogin();
      }
      return;
    }
    if (step === "invite") {
      resetTouched();
      setInviteCode("");
      setStep("otp");
      return;
    }
    setOtp("");
    setShowOtpError(false);
    setOtpInputKey((key) => key + 1);
    setStep("email");
  };

  const sendOtp = () => {
    if (!emailValid || submitting) return;

    run(async () => {
      setOtpSending(true);
      try {
        await requestGuestOtp(normalizedEmail);
        resetCountdown();
        setOtp("");
        setShowOtpError(false);
        setOtpInputKey((key) => key + 1);
        setStep("otp");
      } finally {
        setOtpSending(false);
      }
    }).catch((err) => handleAuthApiError(err, dialog, router, { email: normalizedEmail }));
  };

  const verifyOtpStep = useCallback(
    (code) => {
      const digits = String(code ?? otpDigits).replace(/[^0-9]/g, "");
      if (digits.length !== 6 || submitting || otpSending || verifyLockRef.current) {
        if (digits.length !== 6) setShowOtpError(true);
        return;
      }

      verifyLockRef.current = true;

      run(async () => {
        try {
          const res = await verifyGuestOtp(normalizedEmail, digits);
          if (res.needs_invite_code) {
            verifyLockRef.current = false;
            resetTouched();
            setStep("invite");
            return;
          }
          await finishLogin(res);
        } catch (err) {
          verifyLockRef.current = false;
          setShowOtpError(true);
          await handleAuthApiError(err, dialog, router, { email: normalizedEmail });
          setOtpRefocusToken((token) => token + 1);
        }
      });
    },
    [otpDigits, submitting, otpSending, run, normalizedEmail, finishLogin, dialog, router, resetTouched],
  );

  const handleResend = async () => {
    if (submitting || otpSending || resending || !canResend) return;

    setResending(true);
    try {
      await requestGuestOtp(normalizedEmail);
      resetCountdown();
      setOtp("");
      setShowOtpError(false);
      setOtpInputKey((key) => key + 1);
      setResendNotice(true);
      setTimeout(() => setResendNotice(false), 2500);
    } catch (err) {
      await handleAuthApiError(err, dialog, router, { email: normalizedEmail });
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (value) => {
    setOtp(value.replace(/[^0-9]/g, "").slice(0, 6));
    if (showOtpError) {
      setShowOtpError(false);
    }
  };

  const handleOtpComplete = (code) => {
    handleOtpChange(code);
    verifyOtpStep(code);
  };

  const verifyInviteStep = () => {
    if (!validateOnSubmit(inviteLiveErrors) || submitting) return;

    run(async () => {
      const res = await verifyGuestInvite(
        normalizedEmail,
        otp,
        normalizeInviteCode(inviteCode),
      );
      await finishLogin(res);
    }).catch((err) => handleAuthApiError(err, dialog, router, { email: normalizedEmail }));
  };

  const handleSubmit = () => {
    if (step === "email") sendOtp();
    else if (step === "otp") verifyOtpStep();
    else verifyInviteStep();
  };

  const handleEmailChange = (value) => {
    setEmail(value);
  };

  const otpSubtitle = otpSending ? (
    t("auth.sendingCodeToEmail")
  ) : (
    <>
      {t("auth.weSentCodeTo") + " "}
      <Text style={layout.phoneHighlight}>{emailDisplay}</Text>
    </>
  );

  const resendFooter = resendNotice ? (
    <Text style={[layout.footerNote, layout.resendSuccess]}>{t("auth.newCodeSent")}</Text>
  ) : canResend ? (
    <TouchableOpacity onPress={handleResend} disabled={busy || resending}>
      <Text style={[layout.footerNote, layout.resendHighlight, (busy || resending) && styles.resendMuted]}>
        {resending ? t("auth.resending") : t("auth.resendCode")}
      </Text>
    </TouchableOpacity>
  ) : (
    <Text style={layout.footerNote}>
      {t("auth.resendAvailableIn") + " "}
      <Text style={layout.resendHighlight}>{countdownLabel}</Text>
    </Text>
  );

  const footerNote =
    step === "otp" ? (
      resendFooter
    ) : step !== "email" ? (
      <Text style={layout.footerNote}>
        <Text style={layout.footerLink} onPress={handleBack}>
          {t("guest.goBack")}
        </Text>
      </Text>
    ) : (
      <Text style={layout.footerNote}>
        {t("guest.returningResident") + " "}
        <Text style={layout.footerLink} onPress={goToResidentLogin}>
          {t("guest.signInNormally")}
        </Text>
      </Text>
    );

  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={ScreenBrand.canvas} />
      <SafeAreaView style={layout.container} edges={["top", "left", "right"]}>
        <AuthFlowTopBar
          current={meta.current}
          total={3}
          showBack={step !== "email"}
          onBack={handleBack}
        />

        <KeyboardSafeScreen
          footerBorderless
          footerStyle={styles.footer}
          contentContainerStyle={layout.scrollBody}
          scrollProps={{ bounces: false }}
          keyboardVerticalOffset={8}
          footer={
            <View style={layout.footerInner}>
              <AuthSubmitButton
                label={meta.button}
                loadingLabel={meta.loading}
                enabled={canSubmit && !busy}
                loading={submitting}
                onPress={handleSubmit}
                solidColor={ScreenBrand.cta}
                loadingColor={ScreenBrand.ctaLoading}
                style={[Shadows.button, ScreenBrand.buttonShadow]}
              />
              {footerNote}
            </View>
          }
        >
          <View style={layout.formBlock}>
            <AuthHeroText
              eyebrow={meta.eyebrow}
              title={meta.title}
              subtitle={step === "otp" ? otpSubtitle : meta.subtitle}
            />

            {step === "email" ? (
              <View style={layout.fieldBlock}>
                <Text style={layout.fieldLabel}>
                  {t("auth.emailAddress")} <Text style={styles.required}>*</Text>
                </Text>
                <AuthEmailField
                  value={email}
                  onChangeText={handleEmailChange}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder={t("auth.emailPlaceholder")}
                  error={Boolean(emailError)}
                />
                {emailError ? (
                  <Text style={authStyles.inputErrorText}>{emailError}</Text>
                ) : null}
                {__DEV__ ? (
                  <Text style={layout.devHint}>
                    Dev · <Text style={layout.devHintCode}>{DEV_OTP_HINT}</Text>
                  </Text>
                ) : null}
              </View>
            ) : null}

            {step === "otp" ? (
              <View style={layout.fieldBlock}>
                {otpSending ? (
                  <AuthInlineLoader text={t("auth.sendingTo", { phone: emailDisplay })} />
                ) : (
                  <>
                    <Text style={layout.fieldLabel}>
                      {t("auth.verificationCode")} <Text style={styles.required}>*</Text>
                    </Text>
                    <OTPInput
                      key={otpInputKey}
                      length={6}
                      onOTPChange={handleOtpChange}
                      onComplete={handleOtpComplete}
                      editable={!busy}
                      hasError={showOtpError}
                      refocusToken={otpRefocusToken}
                    />
                    {showOtpError ? (
                      <Text style={authStyles.inputErrorText}>
                        {t("auth.enter6DigitCode")}
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
            ) : null}

            {step === "invite" ? (
              <View style={layout.fieldBlock}>
                <Text style={layout.fieldLabel}>
                  {t("guest.inviteCode")} <Text style={styles.required}>*</Text>
                </Text>
                <LocaleTextInput
                  style={[styles.input, inviteFieldError ? styles.inputError : null]}
                  value={inviteCode}
                  onChangeText={(value) => {
                    setInviteCode(value.toUpperCase());
                    clearError("inviteCode");
                  }}
                  onFocus={() => touch("inviteCode")}
                  onBlur={() => touch("inviteCode")}
                  placeholder="GST-XXXX-1234"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholderTextColor="#9CA3AF"
                />
                {inviteFieldError ? (
                  <Text style={authStyles.inputErrorText}>{inviteFieldError}</Text>
                ) : null}
              </View>
            ) : null}
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
  required: {
    color: "#DC2626",
    fontFamily: Fonts.semiBold,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(16),
    backgroundColor: "#FFF",
    color: Colors.textPrimary,
  },
  inputError: {
    borderColor: "#DC2626",
  },
  resendMuted: {
    opacity: 0.6,
  },
});
