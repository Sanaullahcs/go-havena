import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AuthLogo from "../ui/auth-logo";
import AuthStepDots from "./auth-step-dots";
import BackButton from "../ui/back-button";

/** Fixed top row: logo (left) + step progress (right). Optional back on verify. */
export default function AuthFlowTopBar({
  current = 1,
  total = 2,
  showBack = false,
  onBack,
  logoSize = 40,
  /** Parent already applied top safe-area — keep false to avoid double inset. */
  applyTopInset = false,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        applyTopInset ? { paddingTop: Math.max(insets.top, 12) } : null,
      ]}
    >
      <View style={styles.left}>
        {showBack ? (
          <BackButton style={styles.back} onPress={onBack} />
        ) : null}
        <AuthLogo size={logoSize} compact />
      </View>
      <AuthStepDots current={current} total={total} inline />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 4,
    minHeight: 52,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  back: {
    marginRight: 2,
  },
});
