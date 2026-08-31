import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";
import {
  DEV_TEST_EMAIL,
  DEV_OTP_HINT,
  DEV_INVITE_CODE,
} from "../../constants/api-config";

/** Dev-only helpers — hidden in production builds. */
export function DevPhoneFill({ onFill }) {
  if (!__DEV__) return null;
  return (
    <Pressable
      style={styles.chip}
      onPress={() => onFill?.(DEV_TEST_EMAIL)}
      hitSlop={8}
    >
      <Feather name="mail" size={sf(12)} color="#64748B" />
      <Text style={styles.chipText}>Use test email</Text>
    </Pressable>
  );
}

export function DevOtpFill({ onFill }) {
  if (!__DEV__) return null;
  return (
    <Pressable
      style={styles.chip}
      onPress={() => onFill?.(DEV_OTP_HINT)}
      hitSlop={8}
    >
      <Feather name="key" size={sf(12)} color="#64748B" />
      <Text style={styles.chipText}>Use test code</Text>
    </Pressable>
  );
}

export function DevInviteFill({ onFill }) {
  if (!__DEV__) return null;
  return (
    <Pressable
      style={styles.chip}
      onPress={() => onFill?.(DEV_INVITE_CODE)}
      hitSlop={8}
    >
      <Feather name="gift" size={sf(12)} color="#64748B" />
      <Text style={styles.chipText}>Use sample invite</Text>
    </Pressable>
  );
}

export function DevHelperRow({ children }) {
  if (!__DEV__) return null;
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginTop: sw(10),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#64748B",
  },
});
