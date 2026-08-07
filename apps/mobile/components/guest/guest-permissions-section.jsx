import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { GUEST_PERMISSION_OPTIONS } from "../../constants/guest-permissions";

export default function GuestPermissionsSection({ permissions, onChange }) {
  const { t } = useTranslation();
  const enabledCount = GUEST_PERMISSION_OPTIONS.filter((option) => permissions?.[option.key]).length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="shield" size={sf(14)} color="#0A2A43" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('guests.permissionsTitle')}</Text>
          <Text style={styles.subtitle}>
            {t('guests.permissionsSubtitle', { enabled: enabledCount, total: GUEST_PERMISSION_OPTIONS.length })}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {GUEST_PERMISSION_OPTIONS.map((option, index) => {
          const enabled = permissions?.[option.key] !== false;
          const isLast = index === GUEST_PERMISSION_OPTIONS.length - 1;

          return (
            <View key={option.key} style={[styles.row, isLast && styles.rowLast]}>
              <View style={styles.rowCopy}>
                <View style={styles.rowTitleWrap}>
                  <Feather name={option.icon} size={sf(14)} color={enabled ? "#0A2A43" : "#94A3B8"} />
                  <Text style={[styles.rowTitle, !enabled && styles.rowTitleOff]}>{option.label}</Text>
                </View>
                <Text style={styles.rowDescription}>{option.description}</Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(value) => onChange?.(option.key, value)}
                trackColor={{ false: "#E5E7EB", true: "#93C5FD" }}
                thumbColor={enabled ? "#0A2A43" : "#FFFFFF"}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
  },
  headerIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
  },
  subtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#64748B",
  },
  list: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(4),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(2),
  },
  rowTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0F172A",
  },
  rowTitleOff: {
    color: "#94A3B8",
  },
  rowDescription: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: "#64748B",
    paddingStart: sw(22),
  },
});
