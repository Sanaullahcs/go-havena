import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard, BackHandler } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import BackButton from "../../../components/ui/back-button";

import { joinByInviteCode } from "../../../services/auth-api";
import { showApiFailure, showApiSuccess } from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import InviteQrScanner from "../../../components/invite/invite-qr-scanner";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { hasFieldErrors, LIMITS, validateInviteCodeForm } from "../../../utils/form-validation";
import { normalizeResidentInviteCode } from "../../../utils/guest-invite";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { confirmLeaveOnboarding } from "../../../services/sign-out";
import { ScreenBrand } from "../../../constants/screen-brand";

/**
 * Plain object so the text-metrics patch cannot add lineHeight.
 * iOS TextInput top-aligns placeholder and typed text when lineHeight is set.
 */
const INVITE_CODE_INPUT_TEXT = {
  paddingTop: 0,
  paddingBottom: 0,
  paddingVertical: 0,
  fontFamily: Fonts.regular,
  fontSize: 14,
  color: "rgba(17, 24, 39, 1)",
  textAlignVertical: "center",
  includeFontPadding: false,
};

export default function InviteCodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { inviteCode: prefillCode, returnTo } = useLocalSearchParams();
  const [inviteCode, setInviteCode] = useState(() =>
    prefillCode ? normalizeResidentInviteCode(String(prefillCode)) : "",
  );
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const { submitting, run } = useSubmitLock();
  const [showScanner, setShowScanner] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);

  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const formSectionRef = useRef(null);
  const fieldFocusedRef = useRef(false);
  const scrollTimersRef = useRef([]);

  const liveErrors = useMemo(() => validateInviteCodeForm(inviteCode), [inviteCode]);
  const canVerify = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const handleBack = useCallback(() => {
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    confirmLeaveOnboarding(dialog);
  }, [dialog, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  const scrollFieldAboveKeyboard = useCallback(() => {
    const scroll = scrollRef.current;
    const form = formSectionRef.current;
    const content = contentRef.current;
    if (!scroll) return;

    if (form && content) {
      form.measureLayout(
        content,
        (_x, y) => {
          scroll.scrollTo({
            y: Math.max(0, y - 24),
            animated: true,
          });
        },
        () => {
          scroll.scrollToEnd({ animated: true });
        },
      );
      return;
    }

    scroll.scrollToEnd({ animated: true });
  }, []);

  const scheduleScrollAboveKeyboard = useCallback(() => {
    clearScrollTimers();
    const delays =
      Platform.OS === "android" ? [60, 180, 360] : [40, 180];
    scrollTimersRef.current = delays.map((ms) =>
      setTimeout(scrollFieldAboveKeyboard, ms),
    );
  }, [clearScrollTimers, scrollFieldAboveKeyboard]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      setKeyboardPad(
        Platform.OS === "ios"
          ? Math.max(height - 24, 220)
          : Math.max(Math.round(height * 0.4), 180),
      );

      if (fieldFocusedRef.current) {
        scheduleScrollAboveKeyboard();
      }
    };

    const onHide = () => {
      setKeyboardPad(0);
      clearScrollTimers();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      clearScrollTimers();
      showSub.remove();
      hideSub.remove();
    };
  }, [clearScrollTimers, scheduleScrollAboveKeyboard]);

  const handleScan = () => {
    setShowScanner(true);
  };

  const handleScannedCode = (code) => {
    setInviteCode(normalizeResidentInviteCode(code));
    touch("inviteCode");
    clearError("inviteCode");
  };

  const handleVerify = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;

    const normalizedCode = normalizeResidentInviteCode(inviteCode);

    run(async () => {
      try {
        const data = await joinByInviteCode(normalizedCode);
        await showApiSuccess(
          dialog,
          t('guests.inviteVerified'),
          t('guests.joiningCommunity', { name: data.community.name }),
        );
        router.push({
          pathname: "/screens/complete-profile",
          params: {
            role: "resident",
            communityId: String(data.community.id),
            communityName: data.community.name,
            invited: "1",
            ...(returnTo ? { returnTo: String(returnTo) } : {}),
          },
        });
      } catch (err) {
        await showApiFailure(dialog, t('guests.invalidCode'), err, "invite_code");
      }
    });
  };

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.topBar}>
          <BackButton onPress={handleBack} />
        </View>

        <View style={styles.body}>
          <KeyboardSafeScreen
            scrollRef={scrollRef}
            keyboardAvoiding={false}
            footerKeyboardLift={false}
            footerBorderless
            footerStyle={styles.footer}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardPad > 0 ? { paddingBottom: keyboardPad } : null,
            ]}
            keyboardFieldGap={0}
            scrollProps={{
              bounces: false,
              automaticallyAdjustKeyboardInsets: false,
            }}
            footer={
              <View style={styles.verifyButtonWrap}>
                <AuthSubmitButton
                  label={t('guests.verifyCode')}
                  loadingLabel={t('guests.verifying')}
                  enabled={canVerify}
                  loading={submitting}
                  onPress={handleVerify}
                  solidColor={ScreenBrand.cta}
                  loadingColor={ScreenBrand.ctaLoading}
                  style={[styles.verifyButton, ScreenBrand.buttonShadow]}
                />
              </View>
            }
          >
            <View ref={contentRef} collapsable={false}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('guests.enterInviteCode')}</Text>
                <Text style={styles.headerSubtitle}>
                  {t('guests.inviteCodeSubtitle')}
                </Text>
              </View>

              <View
                style={styles.qrCard}
              >
                <Image
                  source={require("../../../assets/images/qr-code.svg")}
                  style={styles.qrIconWrap}
                />

                <Text style={styles.qrTitle}>{t('guests.scanQrCode')}</Text>
                <Text style={styles.qrSubtitle}>
                  {t('guests.scanQrSubtitle')}
                </Text>

                <TouchableOpacity
                  style={styles.scanButton}
                  activeOpacity={0.85}
                  onPress={handleScan}
                >
                  <Ionicons name="scan-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.scanButtonText}>{t('guests.tapToScan')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('guests.orEnterManually')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <View
                ref={formSectionRef}
                collapsable={false}
                style={styles.formSection}
              >
                <Text style={styles.label}>
                  {t('guests.inviteCodeLabel')} <Text style={styles.required}>*</Text>
                </Text>
                <LocaleTextInput
                  value={inviteCode}
                  onChangeText={(text) => {
                    setInviteCode(text.toUpperCase());
                    clearError("inviteCode");
                  }}
                  onFocus={() => {
                    fieldFocusedRef.current = true;
                    scheduleScrollAboveKeyboard();
                  }}
                  onBlur={() => {
                    fieldFocusedRef.current = false;
                    touch("inviteCode");
                  }}
                  placeholder={t("guests.inviteCodePlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  style={[
                    styles.input,
                    INVITE_CODE_INPUT_TEXT,
                    showError("inviteCode", liveErrors) && styles.inputError,
                  ]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!submitting}
                  maxLength={LIMITS.inviteCode}
                  underlineColorAndroid="transparent"
                />
                {showError("inviteCode", liveErrors) ? (
                  <Text style={styles.errorText}>
                    {showError("inviteCode", liveErrors)}
                  </Text>
                ) : null}

                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>{t('guests.noInviteCodeTitle')}</Text>
                  <Text style={styles.infoText}>
                    {t('guests.noInviteCodeText')}
                  </Text>
                </View>
              </View>
            </View>
          </KeyboardSafeScreen>
        </View>

        <InviteQrScanner
          visible={showScanner}
          onClose={() => setShowScanner(false)}
          onScanned={handleScannedCode}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243, 244, 246, 1)",
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 28,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(106, 114, 130, 1)",
    maxWidth: 310,
  },
  qrCard: {
    borderRadius: 16,
    backgroundColor: "#DFF4FB",
    padding: 24,
    alignItems: "center",
  },
  qrIconWrap: {
    width: 80,
    height: 80,
    marginBottom: 18,
  },
  qrTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(30, 30, 30, 1)",
    fontWeight: "700",
  },
  qrSubtitle: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(30, 30, 30, 1)",
    textAlign: "center",
  },
  scanButton: {
    marginTop: 14,
    minWidth: 124,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ScreenBrand.cta,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  scanButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 1)",
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
    marginBottom: 40,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(229, 231, 235, 1)",
  },
  dividerText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(153, 161, 175, 1)",
    fontWeight: "600",
  },
  formSection: {
    gap: 8,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "500",
  },
  required: {
    color: "#E7000B",
  },
  input: {
    height: 56,
    borderWidth: 2,
    borderColor: "rgba(229, 231, 235, 1)",
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 1)",
    marginBottom: 4,
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginBottom: 12,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
  },
  verifyButtonWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  verifyButton: {
    width: "100%",
    alignSelf: "stretch",
    height: 56,
    borderRadius: 14,
  },
  infoCard: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "rgba(212, 236, 245, 1)",
    padding: 16,
  },
  infoTitle: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "500",
    marginBottom: 2,
  },
  infoText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 18,
    color: "rgba(74, 85, 101, 1)",
  },
});
