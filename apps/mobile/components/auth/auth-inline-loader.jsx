import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";

/** Minimal inline loader for OTP send / resend states */
export default function AuthInlineLoader({ text = "Sending code…" }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="small" color={Colors.brandPrimaryDeep} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textBody,
    textAlign: "center",
  },
});
