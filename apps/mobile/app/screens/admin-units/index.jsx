import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import { fetchAdminUnits } from "../../../services/property-services-api";
import { showApiFailure } from "../../../utils/auth-errors";

export default function AdminUnitsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const focusUnitId = String(params.unitId ?? params.unit ?? "").trim();
  const focusUnitNumber = String(params.unitNumber ?? "").trim();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchAdminUnits();
      setUnits((rows ?? []).filter((unit) => unit.kind !== "office"));
    } catch (error) {
      showApiFailure(error, { title: t("services.adminUnitsTitle") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const focusedUnit = useMemo(() => {
    if (focusUnitId) {
      const match = units.find((unit) => String(unit.id) === focusUnitId);
      if (match) return match;
    }
    if (focusUnitNumber) {
      return units.find((unit) => String(unit.unit_number).toLowerCase() === focusUnitNumber.toLowerCase()) ?? null;
    }
    return null;
  }, [focusUnitId, focusUnitNumber, units]);

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.adminUnitsTitle")}
        subtitle={t("services.adminUnitsSub")}
      />
      {loading && units.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              tintColor="#0F766E"
            />
          }
        >
          {focusedUnit ? (
            <View style={styles.focusBanner}>
              <Feather name={focusedUnit.billing_contact ? "check-circle" : "alert-circle"} size={sf(16)} color={focusedUnit.billing_contact ? "#047857" : "#B45309"} />
              <Text style={styles.focusText}>
                {focusedUnit.billing_contact
                  ? t("services.adminUnitsNowAssigned", {
                    unit: focusedUnit.unit_number,
                    name: focusedUnit.billing_contact.name,
                  })
                  : t("services.adminUnitsStillMissing", { unit: focusedUnit.unit_number })}
              </Text>
            </View>
          ) : null}

          {units.length === 0 ? (
            <Text style={styles.empty}>{t("services.adminUnitsEmpty")}</Text>
          ) : (
            units.map((unit) => {
              const focused = focusedUnit?.id === unit.id;
              const contactName = unit.billing_contact?.name;
              return (
                <Pressable key={unit.id} style={[styles.card, focused && styles.cardFocused]}>
                  <View style={styles.cardTop}>
                    <View>
                      <Text style={styles.unitLabel}>{t("services.adminUnitsUnitLabel")}</Text>
                      <Text style={styles.unitNumber}>{unit.unit_number}</Text>
                    </View>
                    <View style={[styles.statusChip, contactName ? styles.statusOk : styles.statusWarn]}>
                      <Text style={[styles.statusText, contactName ? styles.statusOkText : styles.statusWarnText]}>
                        {contactName ? t("services.adminUnitsAssigned") : t("services.adminUnitsMissing")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.contactRow}>
                    <View style={[styles.avatar, !contactName && styles.avatarWarn]}>
                      <Feather name={contactName ? "user" : "alert-circle"} size={sf(14)} color={contactName ? "#0F766E" : "#B45309"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactLabel}>{t("services.billingContactTitle")}</Text>
                      <Text style={styles.contactName}>
                        {contactName || t("services.adminUnitsNoContact")}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = {
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: sw(16), paddingTop: sw(8), paddingBottom: sw(32), gap: sw(12) },
  focusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    padding: sw(12),
  },
  focusText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#134E4A",
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(14),
    gap: sw(12),
  },
  cardFocused: {
    borderColor: "#5EEAD4",
    backgroundColor: "#F0FDFA",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(10),
  },
  unitLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  unitNumber: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    color: "#0F172A",
    marginTop: 2,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  statusOk: { backgroundColor: "#D1FAE5" },
  statusWarn: { backgroundColor: "#FEF3C7" },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  statusOkText: { color: "#047857" },
  statusWarnText: { color: "#B45309" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: sw(12),
  },
  avatar: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWarn: { backgroundColor: "#FEF3C7" },
  contactLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  contactName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0F172A",
    marginTop: 2,
  },
};
