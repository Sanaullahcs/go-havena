import React from "react";
import { View, StyleSheet } from "react-native";
import ScreenHeader from "../layout/screen-header";
import { AdminTheme } from "../../constants/admin-theme";

/** Admin stack header — matches wellness / property-management chrome. */
export default function AdminScreenHeader({ title, subtitle, onBack, right }) {
  return (
    <ScreenHeader
      layout="stacked"
      title={title}
      subtitle={subtitle}
      onBack={onBack}
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
