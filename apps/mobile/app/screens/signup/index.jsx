import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import BackButton from "../../../components/ui/back-button";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { SignupPhoneInput } from "../../../components/ui/phone-input";
import AuthLogo from "../../../components/ui/auth-logo";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { SafeAreaView } from "react-native-safe-area-context";
import { setCurrentRole } from "../../../constants/role-session";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { isValidPhone, toE164 } from "../../../utils/phone";
import { requestOtp } from "../../../services/auth-api";
import { handleAuthApiError, showApiSuccess } from "../../../utils/auth-errors";
import { encodeRoutePhone, paramString } from "../../../utils/route-params";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";

export default function SignupScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { role: roleParam = "resident" } = useLocalSearchParams();
  const role = paramString(roleParam, "resident");

  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [showPhoneError, setShowPhoneError] = useState(false);
  const { submitting, run } = useSubmitLock();
  const isValid = isValidPhone(phoneDigits, phoneCountry);

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

  const handleSendCode = () => {
    if (!isValid || submitting) {
      if (!isValid) setShowPhoneError(true);
      return;
    }

    const e164 = toE164(phoneDigits, phoneCountry);
    run(async () => {
      try {
        await requestOtp(e164, { intent: "signup" });
        await showApiSuccess(dialog, "Code sent", "We sent a verification code to your phone.");
        router.push({
          pathname: "/screens/verifyregistration",
          params: { role, phone: encodeRoutePhone(e164) },
        });
      } catch (err) {
        await handleAuthApiError(err, dialog, router, { phone: e164 });
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
            backgroundColor:
              role === "admin"
                ? "rgba(212, 236, 245, 1)"
                : "rgba(193, 255, 114, 0.2)",
          },
        ]}
      >
        <Image
          source={
            role === "admin"
              ? require("../../../assets/images/admin-icon.png")
              : require("../../../assets/images/resident-new.png")
          }
          style={{ width: 16, height: 16 }}
        />
        <Text
          style={[
            styles.roleText,
            {
              color:
                role === "admin"
                  ? "rgba(0, 123, 255, 1)"
                  : "rgba(0, 130, 54, 1)",
            },
          ]}
        >
          {role === "admin" ? "Community Admin" : "Resident"}
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
              label="Send Code"
              loadingLabel="Sending…"
              enabled={isValid}
              loading={submitting}
              onPress={handleSendCode}
            />
            <Text style={styles.footerText}>
              {"We'll send you a one-time verification code"}
            </Text>
          </View>
        }
      >
        <View style={styles.logoContainer}>
          <AuthLogo compact size={56} />
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            Enter your phone number to get started
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.inputLabel}>Phone number</Text>
          <SignupPhoneInput
            digits={phoneDigits}
            onChangeDigits={handlePhoneChange}
            country={phoneCountry}
            onCountryChange={handleCountryChange}
            showError={showPhoneError}
            showHints
            containerStyle={styles.phoneInput}
            rowStyle={styles.phoneRow}
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
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  roleBadge: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 3,
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
    color: "#000000",
    lineHeight: 28,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
    color: "#364153",
  },
  formSection: {
    marginTop: 14,
  },
  inputLabel: {
    marginBottom: 6,
    fontFamily: Fonts.medium,
    fontSize: 14,
    fontWeight: "500",
    color: "#000000",
    lineHeight: 20,
  },
  phoneInput: {
    marginBottom: 8,
  },
  phoneRow: {
    marginTop: 0,
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
  },
});
