import React from "react";
import { View, StyleSheet } from "react-native";
import { SectionLabel } from "./internal-page-shell";
import { sw } from "../../utils/responsive";

export default function MenuGroup({ label, children, style }) {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.section, style]}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <View style={styles.card}>
        {items.map((child, index) => (
          <View key={index}>
            {child}
            {index < items.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: sw(18) },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#F1F5F9",
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
  },
});
