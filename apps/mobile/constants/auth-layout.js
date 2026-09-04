import { Platform, StyleSheet } from "react-native";
import { Fonts } from "./font";
import { Colors } from "./tokens";
import { ScreenBrand as B } from "./screen-brand";

/** Shared layout for phone login + OTP verify */
export const authLayoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: B.canvas,
    paddingHorizontal: 24,
  },
  scrollBody: {
    // Don't stretch to full height — prevents jump when keyboard opens
    flexGrow: 0,
    paddingTop: 8,
    paddingBottom: 12,
  },
  formBlock: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: 16,
  },
  heroBlock: {
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
    marginBottom: 4,
  },
  eyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: B.teal,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    fontWeight: "700",
    color: Colors.textPrimary,
    lineHeight: 32,
    letterSpacing: -0.4,
    textAlign: "left",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "left",
    color: Colors.textSecondary,
    width: "100%",
    marginTop: 2,
  },
  fieldBlock: {
    gap: 6,
    width: "100%",
    alignItems: "stretch",
  },
  fieldLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: Colors.textPrimary,
  },
  emailField: {
    width: "100%",
    height: 56,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFF",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  emailFieldError: {
    borderColor: "#DC2626",
  },
  emailInput: {
    width: "100%",
    height: "100%",
    margin: 0,
    paddingHorizontal: 0,
    // Poppins sits optically low in a 56px iOS field; extra bottom pad lifts both
    // placeholder and typed value without changing left inset or box size.
    paddingTop: 0,
    paddingBottom: Platform.OS === "ios" ? 6 : 0,
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: "left",
    textAlignVertical: "center",
    includeFontPadding: false,
    backgroundColor: "transparent",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  footerInner: {
    gap: 12,
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
  footerNote: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "400",
    color: Colors.footerMuted,
    fontFamily: Fonts.regular,
  },
  otpExpireNote: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "400",
    color: B.textSecondary,
  },
  footerLink: {
    fontWeight: "600",
    color: Colors.link,
    fontFamily: Fonts.semiBold,
  },
  phoneHighlight: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    color: B.teal,
  },
  resendHighlight: {
    fontWeight: "600",
    color: B.teal,
    fontFamily: Fonts.semiBold,
  },
  resendSuccess: {
    color: B.success,
    fontFamily: Fonts.medium,
  },
  devHint: {
    textAlign: "left",
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginTop: 4,
  },
  devHintCode: {
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
});
