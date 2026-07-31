import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import InternalScreenHeader from "./internal-screen-header";
import ScreenStatusBar from "./screen-status-bar";
import { pageStyles } from "../../constants/page-styles";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

/**
 * Standard shell for stack screens -- white header with back, soft page background.
 */
export default function InternalPageShell({
  title,
  subtitle,
  onBack,
  right,
  children,
  scroll = true,
  contentStyle,
  edges = ["left", "right"],
}) {
  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, pageStyles.scrollBottom, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <ScreenStatusBar style="dark" androidBackgroundColor="#FFFFFF" />
      <InternalScreenHeader title={title} subtitle={subtitle} onBack={onBack} right={right} />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: {
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
  },
});

export function SectionLabel({ children, style }) {
  return <Text style={[sectionStyles.label, style]}>{children}</Text>;
}

const sectionStyles = StyleSheet.create({
  label: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#6A7282",
    fontWeight: "700",
    marginBottom: sw(8),
    includeFontPadding: false,
  },
});
