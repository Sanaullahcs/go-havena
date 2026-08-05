import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import LoginPhoneInput from "../../../components/ui/phone-input";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import AuthFlowTopBar from "../../../components/auth/auth-flow-top-bar";
import AuthHeroText from "../../../components/auth/auth-hero-text";
import BiometricAuthButtons from "../../../components/ui/biometric-auth-buttons";
import FingerprintDialog from "../../../components/biometric/fingerprint-dialog";
import FaceIdDialog from "../../../components/biometric/faceid-dialog";
import {
  DEV_TEST_PHONE_DISPLAY,
  DEV_COMMUNITY_ADMIN_PHONE_DISPLAY,
  DEV_OTP_HINT,
  isRemoteApi,
} from "../../../constants/api-config";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { isValidPhone, toE164 } from "../../../utils/phone";
import { requestOtp } from "../../../services/auth-api";
import {
  buildBlockedAccountDialogOptions,
  handleAuthApiError,
  persistBlockedAccountNotice,
  showSuspendedAccountDialog,
} from "../../../utils/auth-errors";
import { consumeBlockedAccountNotice } from "../../../services/auth-session";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { checkBiometricLoginReady } from "../../../components/biometric/biometric-service";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { useBiometricCapabilities } from "../../../hooks/use-biometric-capabilities";
import { encodeRoutePhone } from "../../../utils/route-params";
import { getUser, hasBiometricUnlock } from "../../../services/auth-session";
import { authLayoutStyles as layout } from "../../../constants/auth-layout";
import { Colors } from "../../../constants/tokens";
import { ScreenBrand } from "../../../constants/screen-brand";
import { Fonts } from "../../../constants/font";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";

export default function LoginScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { suspended } = useLocalSearchParams();
  const suspendedNoticeShown = useRef(false);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [showPhoneError, setShowPhoneError] = useState(false);
  const [showFingerprintDialog, setShowFingerprintDialog] = useState(false);
  const [showFaceIdDialog, setShowFaceIdDialog] = useState(false);
  const [biometricOpening, setBiometricOpening] = useState(false);
  // Only show “Welcome back” after we confirm a prior user profile — not for first-time visitors
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [welcomeReady, setWelcomeReady] = useState(false);
  const { submitting, run } = useSubmitLock();
  const isValid = isValidPhone(phoneDigits, phoneCountry);
  const biometricCaps = useBiometricCapabilities();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = await getUser();
      const biometricUnlock = await hasBiometricUnlock();
      // Token alone is not enough (stale session) — prefer a real user record
      if (mounted) {
        setIsReturningUser(Boolean(user?.id || user?.phone || biometricUnlock));
        setWelcomeReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (suspended !== "1" || suspendedNoticeShown.current) return;

    suspendedNoticeShown.current = true;

    (async () => {
      const notice = await consumeBlockedAccountNotice();
      if (notice) {
        await dialog.showDialog(buildBlockedAccountDialogOptions(notice));
        return;
      }
      await showSuspendedAccountDialog(dialog);
    })();
  }, [suspended, dialog]);

  const showBiometricUnavailable = async (result) => {
    await dialog.showDialog({
      type: "info",
      title: "Biometric sign-in unavailable",
      message: result.message,
      actions: [{ label: "OK", variant: "primary" }],
    });
  };

  const openBiometricDialog = async (kind) => {
    if (biometricOpening || showFingerprintDialog || showFaceIdDialog) return;

    setBiometricOpening(true);
    try {
      const ready = await checkBiometricLoginReady();
      if (!ready.success) {
        await showBiometricUnavailable(ready);
        return;
      }

      if (kind === "fingerprint") {
        setShowFingerprintDialog(true);
      } else {
        setShowFaceIdDialog(true);
      }
    } finally {
      setBiometricOpening(false);
    }
  };

  const handleFingerprintLogin = () => openBiometricDialog("fingerprint");
  const handleFaceIdLogin = () => openBiometricDialog("face");

  const handleSignUp = () => {
    router.push("/screens/roles");
  };

  const handleSendCode = () => {
    if (!isValid || submitting) {
      if (!isValid) setShowPhoneError(true);
      return;
    }

    const e164 = toE164(phoneDigits, phoneCountry);

    run(async () => {
      try {
        await requestOtp(e164, { intent: "login" });
        router.push({
          pathname: "/screens/login/verify-phone",
          params: { phone: encodeRoutePhone(e164) },
        });
      } catch (err) {
        await handleAuthApiError(err, dialog, router, { phone: e164 });
      }
    });
  };

  const handlePhoneChange = (digits) => {
    setPhoneDigits(digits);
    if (showPhoneError && isValidPhone(digits, phoneCountry)) {
      setShowPhoneError(false);
    }
  };

  const handleCountryChange = (country) => {
    setPhoneCountry(country);
    if (showPhoneError && isValidPhone(phoneDigits, country)) {
      setShowPhoneError(false);
    }
  };

  // Android: fingerprint and/or face. iOS: Face ID (or Touch ID on older devices).
  const showFingerprintBtn = !biometricCaps.loading && biometricCaps.fingerprint;
  const showFaceIdBtn = !biometricCaps.loading && biometricCaps.facial;
  const showBiometricSection = showFingerprintBtn || showFaceIdBtn;

  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={ScreenBrand.canvas} />
      <SafeAreaView style={layout.container} edges={["top", "left", "right", "bottom"]}>
        <AuthFlowTopBar current={1} total={2} />

        <KeyboardSafeScreen
          footerBorderless
          footerStyle={styles.footer}
          contentContainerStyle={layout.scrollBody}
          scrollProps={{ bounces: false }}
          keyboardVerticalOffset={8}
          footer={
            <View style={layout.footerInner}>
              <AuthSubmitButton
                label="Send Code"
                loadingLabel="Sending…"
                enabled={isValid && !submitting}
                loading={submitting}
                onPress={handleSendCode}
                solidColor={ScreenBrand.cta}
                loadingColor={ScreenBrand.ctaLoading}
                style={ScreenBrand.buttonShadow}
              />
              <Text style={layout.footerNote}>
                {"Don't have an account? "}
                <Text style={[layout.footerLink, styles.brandLink]} onPress={handleSignUp}>
                  Sign up
                </Text>
              </Text>
              <Text style={layout.footerNote}>
                Have a guest invitation?{" "}
                <Text
                  style={[layout.footerLink, styles.brandLink]}
                  onPress={() => router.push("/screens/guest-login")}
                >
                  Login as Guest
                </Text>
              </Text>
            </View>
          }
        >
          <View style={layout.formBlock}>
            <AuthHeroText
              eyebrow="Sign in"
              title={welcomeReady && isReturningUser ? "Welcome back" : "Sign in"}
              subtitle="Enter your phone number to continue to your community."
            />

            <View style={layout.fieldBlock}>
              <Text style={layout.fieldLabel}>Phone number</Text>
              <LoginPhoneInput
                digits={phoneDigits}
                onChangeDigits={handlePhoneChange}
                country={phoneCountry}
                onCountryChange={handleCountryChange}
                showError={showPhoneError}
                showHints={false}
              />
              {__DEV__ ? (
                <Text style={styles.devHint}>
                  Test login: {DEV_TEST_PHONE_DISPLAY} (resident) or {DEV_COMMUNITY_ADMIN_PHONE_DISPLAY} (admin) · OTP {DEV_OTP_HINT}
                </Text>
              ) : null}
            </View>

            {showBiometricSection ? (
              <View style={styles.biometricSection}>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or use biometrics</Text>
                  <View style={styles.dividerLine} />
                </View>
                <BiometricAuthButtons
                  onFingerprint={handleFingerprintLogin}
                  onFaceId={handleFaceIdLogin}
                  disabled={biometricOpening}
                  showFingerprint={showFingerprintBtn}
                  showFaceId={showFaceIdBtn}
                />
              </View>
            ) : null}
          </View>
        </KeyboardSafeScreen>
      </SafeAreaView>

      <FingerprintDialog
        visible={showFingerprintDialog}
        onClose={() => setShowFingerprintDialog(false)}
      />
      <FaceIdDialog
        visible={showFaceIdDialog}
        onClose={() => setShowFaceIdDialog(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 0,
    paddingTop: 16,
    backgroundColor: ScreenBrand.canvas,
  },
  biometricSection: {
    gap: 12,
    paddingTop: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.divider,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    textTransform: "lowercase",
  },
  devHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
  brandLink: {
    color: ScreenBrand.link,
    fontWeight: "600",
    fontFamily: Fonts.semiBold,
  },
});
