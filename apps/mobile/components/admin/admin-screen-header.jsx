import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import ScreenHeader from "../layout/screen-header";
import { AdminTheme } from "../../constants/admin-theme";

/** Admin stack header — matches wellness / property-management chrome. */
export default function AdminScreenHeader({ title, subtitle, onBack, right }) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  return (
    <ScreenHeader
      layout="stacked"
      title={title}
      subtitle={subtitle}
      onBack={handleBack}
      right={right ? <View style={styles.right}>{right}</View> : null}
      iconOnly
      style={styles.header}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: AdminTheme.surface,
    borderBottomColor: AdminTheme.border,
  },
  right: {
    flexShrink: 0,
  },
});
