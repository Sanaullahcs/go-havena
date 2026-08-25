import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { HomeTheme as T } from "../../../../constants/home-theme";
import { sw, sf } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import { getCurrentRole } from "../../../../constants/role-session";
import { categoryLabel, fetchAdminAgreements, fetchMyAgreements } from "../../../../services/agreements-api";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusMeta(status) {
  if (status === "signed") return { label: "Signed", color: "#047857", bg: "#ECFDF5" };
  if (status === "declined") return { label: "Declined", color: "#B91C1C", bg: "#FEF2F2" };
  if (status === "sent") return { label: "Sent", color: "#1B4F8A", bg: "#E8F0F7" };
  if (status === "closed") return { label: "Closed", color: "#475569", bg: "#F1F5F9" };
  if (status === "viewed") return { label: "In review", color: "#1D4ED8", bg: "#EFF6FF" };
  if (status === "draft") return { label: "Draft", color: "#B45309", bg: "#FFFBEB" };
  return { label: "Needs signature", color: "#B45309", bg: "#FFFBEB" };
}

export default function Agreements() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = getCurrentRole() === "admin";
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(isAdmin ? "all" : "awaiting");
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = isAdmin ? await fetchAdminAgreements() : await fetchMyAgreements();
      setRows(res.data);
      setStats(res.stats);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadAgreements"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, [isAdmin, t]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const visible = useMemo(() => {
    if (filter === "awaiting") {
      return rows.filter((r) => ["pending", "viewed"].includes(r.my_status) || (isAdmin && r.status === "sent" && (r.counts?.pending ?? 0) > 0));
    }
    if (filter === "signed") return rows.filter((r) => r.my_status === "signed" || (isAdmin && (r.counts?.signed ?? 0) > 0 && r.status !== "draft"));
    if (filter === "draft") return rows.filter((r) => r.status === "draft");
    return rows;
  }, [rows, filter, isAdmin]);

  const openRow = (row) => {
    router.push({
      pathname: PropertyManagementRoutes.AGREEMENT_DETAIL,
      params: { agreementId: String(row.id) },
    });
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.agreementsTitle")} subtitle={t("common.loading")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </SafeAreaView>
    );
  }

  const chips = isAdmin
    ? [
        { key: "all", label: t("propertyMgmt.allTab") },
        { key: "draft", label: t("propertyMgmt.draftTab") },
        { key: "awaiting", label: t("propertyMgmt.awaitingTab") },
      ]
    : [
        { key: "awaiting", label: t("propertyMgmt.awaitingTab") },
        { key: "signed", label: t("propertyMgmt.signedTab") },
        { key: "all", label: t("propertyMgmt.allTab") },
      ];

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.agreementsTitle")}
        subtitle={t("propertyMgmt.agreementCount", { count: rows.length })}
        right={
          isAdmin ? (
            <Pressable onPress={() => router.push(PropertyManagementRoutes.AGREEMENT_FORM)} style={styles.addBtn}>
              <Feather name="plus" size={sf(16)} color="#1B4F8A" />
              <Text style={styles.addBtnText}>{t("propertyMgmt.addBtn")}</Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={pageStyles.scrollBottom}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#1B4F8A" />}
      >
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{String(stats.awaiting ?? 0)}</Text>
            <Text style={styles.statLabel}>{t("propertyMgmt.awaitingSignatures")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{String(stats.signed ?? 0)}</Text>
            <Text style={styles.statLabel}>{t("propertyMgmt.certificatesOnFile")}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          {chips.map((chip) => {
            const on = filter === chip.key;
            return (
              <Pressable key={chip.key} onPress={() => setFilter(chip.key)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={propertyStyles.sectionBlock}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {visible.length === 0 && !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("propertyMgmt.noAgreements")}</Text>
              <Text style={styles.emptyHint}>{t("propertyMgmt.noAgreementsHint")}</Text>
            </View>
          ) : null}
          {visible.map((row) => {
            const meta = statusMeta(isAdmin ? row.status : row.my_status);
            return (
              <Pressable key={row.id} style={styles.card} onPress={() => openRow(row)}>
                <View style={styles.iconWrap}>
                  <Feather name="edit-3" size={sf(18)} color="#1B4F8A" />
                </View>
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={2}>{row.title}</Text>
                  <Text style={styles.category}>{categoryLabel(row.category)}</Text>
                  <Text style={styles.meta}>
                    {isAdmin
                      ? `${row.counts?.signed ?? 0}/${row.counts?.total ?? 0} ${t("propertyMgmt.signedTab").toLowerCase()}`
                      : `${row.is_overdue ? t("propertyMgmt.overdueLabel") : row.is_due_soon ? t("propertyMgmt.dueSoonLabel") : t("propertyMgmt.dueLabel")} ${formatDate(row.due_at)}`}
                    {row.signature_fee_label ? ` · ${row.signature_fee_label}` : ""}
                    {row.is_required ? ` · ${t("propertyMgmt.requiredBadge")}` : ""}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingVertical: sw(6),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    backgroundColor: "#E8F0F7",
  },
  addBtnText: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
  stats: { flexDirection: "row", gap: sw(10), paddingHorizontal: sw(16), paddingTop: sw(16) },
  statCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: sw(14),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statValue: { fontFamily: Fonts.bold, fontSize: sf(22), color: "#101828", fontWeight: "700" },
  statLabel: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#6A7282", marginTop: sw(4) },
  chipRail: { paddingHorizontal: sw(16), paddingVertical: sw(14), gap: sw(8) },
  chip: {
    paddingVertical: sw(8),
    paddingHorizontal: sw(14),
    borderRadius: sw(999),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipOn: { backgroundColor: T.navy, borderColor: T.navy },
  chipLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: T.navy, fontWeight: "600" },
  chipLabelOn: { color: "#FFFFFF" },
  card: {
    marginTop: sw(12),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: sw(14),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: "#FFFFFF",
  },
  iconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#101828", fontWeight: "700" },
  category: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#1B4F8A", marginTop: 2 },
  meta: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#6A7282", marginTop: 4 },
  badge: { borderRadius: sw(999), paddingHorizontal: sw(8), paddingVertical: sw(4) },
  badgeText: { fontFamily: Fonts.bold, fontSize: sf(10), fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: sw(40), gap: sw(8) },
  emptyText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#9CA3AF", fontWeight: "700" },
  emptyHint: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#D1D5DB", textAlign: "center" },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#E7000B" },
});
