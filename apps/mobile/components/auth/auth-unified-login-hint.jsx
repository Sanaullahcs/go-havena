import React from "react";
import { View, Text, StyleSheet } from "react-native";
import RoleBadge from "../ui/role-badge";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";

/** Shows that residents and community admins share one phone sign-in. */
export default function AuthUnifiedLoginHint() {
  return (
    <View style={styles.wrap}>
      <View style={styles.badges}>
        <RoleBadge role="resident" />
        <RoleBadge role="admin" />
      </View>
      <Text style={styles.caption}>
        One sign-in for residents and community admins
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  caption: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
});
