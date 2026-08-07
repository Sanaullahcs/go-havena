import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import RoleBadge from "../ui/role-badge";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";

export default function AuthUnifiedLoginHint() {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={styles.badges}>
        <RoleBadge role="resident" />
        <RoleBadge role="admin" />
      </View>
      <Text style={styles.caption}>
        {t("auth.unifiedLogin")}
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
