import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { Fonts } from "../../../../constants/font";
import { HomeTheme as T } from "../../../../constants/home-theme";
import { sw, sf, hp } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import {
  acknowledgeRule,
  deleteCommunityRule,
  fetchCommunityRules,
} from "../../../../services/community-rules-api";
import { getCurrentRole } from "../../../../constants/role-session";
import { useAppDialog } from "../../../../providers/app-dialog-provider";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import { rnShadow } from "../../../../utils/shadow";


const SEV = {
  important: { accent: "#DC2626", bg: "#FEF2F2", label: "propertyMgmt.importantLabel", icon: "alert-circle" },
  standard: { accent: "#1B4F8A", bg: "#E8F1FA", label: "propertyMgmt.standardLabel", icon: "minus-circle" },
  info: { accent: T.deepTeal, bg: T.mint, label: "propertyMgmt.infoLabel", icon: "info" },
};

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={sf(14)} color={T.deepTeal} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function RuleDetail() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { ruleId } = useLocalSearchParams();
  const isAdmin = getCurrentRole() === "admin";
  const { submitting, run } = useSubmitLock();
  const { showConfirm } = useAppDialog();

  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchCommunityRules();
        const found = data.rules.find((r) => String(r.id) === String(ruleId));
        if (!found) { setRule(null); setError(t("propertyMgmt.ruleNotFound")); return; }
        setRule(found);
      } catch (err) {
        setError(err?.message ?? t("propertyMgmt.couldNotLoadRule"));
      } finally {
        setLoading(false);
        hasLoadedOnce.current = true;
      }
    },
    [ruleId, t],
  );

  useFocusEffect(useCallback(() => { load(hasLoadedOnce.current); }, [load]));

  const handleAcknowledge = async () => {
    const confirmed = await showConfirm(
      t("propertyMgmt.ackNeeded"),
      t("propertyMgmt.ackConfirmBody"),
      { confirmLabel: t("propertyMgmt.iAcknowledge"), cancelLabel: t("common.cancel") },
    );
    if (confirmed !== "confirm") return;

    run(async () => {
      await acknowledgeRule(rule.id);
      setRule((prev) => ({ ...prev, acknowledged: true, needs_action: false }));
    });
  };

  const handleDelete = () => {
    Alert.alert(t("propertyMgmt.deleteRule"), t("propertyMgmt.deleteRuleMsg", { title: rule?.title }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => run(async () => { await deleteCommunityRule(rule.id); router.back(); }) },
    ]);
  };

  const handleEdit = () => {
    router.push({ pathname: PropertyManagementRoutes.RULE_FORM, params: { ruleId: String(rule.id) } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.guidelineTitle")} />
        <View style={styles.centered}><ActivityIndicator size="large" color={T.navy} /></View>
      </SafeAreaView>
    );
  }

  if (error || !rule) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.guidelineTitle")} />
        <View style={styles.centered}>
          <View style={styles.errorIcon}><Feather name="alert-circle" size={sf(28)} color="#9CA3AF" /></View>
          <Text style={styles.errorTitle}>{t("propertyMgmt.somethingWrong")}</Text>
          <Text style={styles.errorText}>{error ?? t("propertyMgmt.ruleNotFound")}</Text>
          <Pressable style={styles.retryBtn} onPress={router.back}>
            <Text style={styles.retryBtnText}>{t("propertyMgmt.goBack")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sev = SEV[rule.severity] ?? SEV.info;
  const updatedLabel = rule.updated_at
    ? new Date(rule.updated_at).toLocaleDateString(getLocaleForLang(i18n.language), { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.guidelineTitle")}
        right={
          isAdmin ? (
            <View style={styles.adminRow}>
              <Pressable onPress={handleEdit} style={styles.headerBtn} hitSlop={6}>
                <Feather name="edit-2" size={sf(15)} color={T.navy} />
              </Pressable>
              <Pressable onPress={handleDelete} style={[styles.headerBtn, styles.headerBtnDanger]} hitSlop={6}>
                <Feather name="trash-2" size={sf(15)} color="#DC2626" />
              </Pressable>
            </View>
          ) : null
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Title section ── */}
        <View style={styles.titleSection}>
          <Text style={styles.heroCategory}>{rule.category}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.heroTitle}>{rule.title}</Text>
            <View style={[styles.sevPill, { backgroundColor: sev.bg }]}>
              <Feather name={sev.icon} size={sf(11)} color={sev.accent} />
              <Text style={[styles.sevPillText, { color: sev.accent }]}>{t(sev.label)}</Text>
            </View>
          </View>
        </View>

        {/* ── Meta info ── */}
        <View style={styles.metaCard}>
          <InfoRow icon="calendar" label={t("propertyMgmt.lastUpdated")} value={updatedLabel} />
          <InfoRow icon="tag" label={t("propertyMgmt.categoryLabel")} value={rule.category} />
          <InfoRow icon="flag" label={t("propertyMgmt.severityLabel")} value={t(sev.label)} />
        </View>

        {/* ── Description ── */}
        <View style={styles.bodyCard}>
          <View style={styles.bodySectionRow}>
            <View style={styles.bodySectionIcon}>
              <Feather name="file-text" size={sf(13)} color={T.deepTeal} />
            </View>
            <Text style={styles.bodySectionTitle}>{t("propertyMgmt.guidelineDetails")}</Text>
          </View>
          <Text style={styles.bodyText}>{rule.description}</Text>
</View>

        {/* ── Acknowledgment ── */}
        {rule.requires_acknowledgment ? (
          <View style={[styles.ackCard, rule.acknowledged || isAdmin ? styles.ackDone : styles.ackPending]}>
            <Feather
              name={rule.acknowledged || isAdmin ? "check-circle" : "alert-circle"}
              size={sf(18)}
              color={rule.acknowledged || isAdmin ? T.deepTeal : "#DC2626"}
            />
            <View style={styles.ackCopy}>
              <Text style={[styles.ackTitle, rule.acknowledged || isAdmin ? styles.ackTitleDone : styles.ackTitlePending]}>
                {isAdmin ? t("propertyMgmt.ackRequiredAdmin") : rule.acknowledged ? t("propertyMgmt.acknowledged") : t("propertyMgmt.ackNeeded")}
              </Text>
              <Text style={[styles.ackSub, rule.acknowledged || isAdmin ? styles.ackSubDone : styles.ackSubPending]}>
                {isAdmin
                  ? t("propertyMgmt.ackAdminHint")
                  : rule.acknowledged
                    ? t("propertyMgmt.ackDoneHint")
                    : t("propertyMgmt.ackPendingHint")}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Footer CTA ── */}
      {!isAdmin && rule.requires_acknowledgment && !rule.acknowledged ? (
        <View style={styles.footer}>
          <Pressable
            style={[styles.ackBtn, submitting && styles.ackBtnOff]}
            disabled={submitting}
            onPress={handleAcknowledge}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check" size={sf(16)} color="#FFFFFF" />
                <Text style={styles.ackBtnText}>{t("propertyMgmt.iAcknowledge")}</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const G = sw(18);
const shadow = Platform.select({
  ios: { ...rnShadow({ color: T.navy, offset: { width: 0, height: 4 }, opacity: 0.08, radius: 12 })},
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(10), paddingHorizontal: sw(32) },
  scroll: { paddingBottom: sw(36) },

  errorIcon: { width: sw(56), height: sw(56), borderRadius: sw(18), backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: sw(4) },
  errorTitle: { fontFamily: Fonts.semiBold, fontSize: sf(16), color: T.navy, fontWeight: "600", includeFontPadding: false },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: T.gray, textAlign: "center", includeFontPadding: false },
  retryBtn: { marginTop: sw(8), paddingVertical: sw(10), paddingHorizontal: sw(20), borderRadius: sw(10), backgroundColor: T.navy },
  retryBtnText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#FFF", fontWeight: "600" },

  adminRow: { flexDirection: "row", gap: sw(8) },
  headerBtn: { width: sw(36), height: sw(36), borderRadius: sw(12), backgroundColor: T.mint, alignItems: "center", justifyContent: "center" },
  headerBtnDanger: { backgroundColor: "#FEF2F2" },

  titleSection: {
    marginHorizontal: G,
    marginTop: sw(4),
    marginBottom: sw(16),
    paddingHorizontal: sw(2),
  },
  sevPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    flexShrink: 0,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    marginStart: sw(10),
    marginTop: sw(2),
  },
  sevPillText: { fontFamily: Fonts.semiBold, fontSize: sf(10), fontWeight: "600", includeFontPadding: false },
  heroCategory: { fontFamily: Fonts.medium, fontSize: sf(12), color: T.teal, marginBottom: sw(6), includeFontPadding: false },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(8),
  },
  heroTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    lineHeight: sf(28),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },

  metaCard: {
    marginHorizontal: G,
    marginBottom: sw(14),
    backgroundColor: T.white,
    borderRadius: sw(16),
    paddingVertical: sw(6),
    borderWidth: 1,
    borderColor: T.border,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: sw(12), paddingVertical: sw(11), paddingHorizontal: sw(14), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F1F5F9" },
  infoIcon: { width: sw(32), height: sw(32), borderRadius: sw(10), backgroundColor: T.mint, alignItems: "center", justifyContent: "center" },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8", includeFontPadding: false },
  infoValue: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.navy, fontWeight: "600", marginTop: 1, includeFontPadding: false },

  bodyCard: {
    marginHorizontal: G,
    marginBottom: sw(14),
    backgroundColor: T.white,
    borderRadius: sw(16),
    padding: sw(16),
    borderWidth: 1,
    borderColor: T.border,
  },
  bodySectionRow: { flexDirection: "row", alignItems: "center", gap: sw(8), marginBottom: sw(12) },
  bodySectionIcon: { width: sw(28), height: sw(28), borderRadius: sw(9), backgroundColor: `${T.deepTeal}14`, alignItems: "center", justifyContent: "center" },
  bodySectionTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.navy, fontWeight: "600", includeFontPadding: false },
  bodyText: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(23), color: "#475569", includeFontPadding: false },

  ackCard: {
    marginHorizontal: G,
    flexDirection: "row",
    gap: sw(12),
    alignItems: "flex-start",
    borderRadius: sw(16),
    padding: sw(14),
  },
  ackDone: { backgroundColor: "#ECFDF5" },
  ackPending: { backgroundColor: "#FEF2F2" },
  ackCopy: { flex: 1, minWidth: 0 },
  ackTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), fontWeight: "600", includeFontPadding: false },
  ackTitleDone: { color: "#065F46" },
  ackTitlePending: { color: "#991B1B" },
  ackSub: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), marginTop: sw(2), includeFontPadding: false },
  ackSubDone: { color: "#047857" },
  ackSubPending: { color: "#B91C1C" },

  footer: {
    paddingHorizontal: G,
    paddingBottom: hp(3),
    paddingTop: sw(12),
    backgroundColor: T.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,61,95,0.08)",
  },
  ackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: T.navy,
    borderRadius: sw(14),
    paddingVertical: sw(15),
  },
  ackBtnOff: { opacity: 0.5 },
  ackBtnText: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#FFFFFF", fontWeight: "600" },
});
