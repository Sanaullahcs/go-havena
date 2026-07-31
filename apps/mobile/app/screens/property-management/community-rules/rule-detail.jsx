import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import {
  acknowledgeRule,
  deleteCommunityRule,
  fetchCommunityRules,
} from "../../../../services/community-rules-api";
import { getCurrentRole } from "../../../../constants/role-session";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";

const SEVERITY = {
  important: { bg: "#FEF2F2", color: "#E7000B", label: "Important", icon: "alert-circle" },
  standard:  { bg: "#FFFBEB", color: "#E17100", label: "Standard",  icon: "alert-triangle" },
  info:      { bg: "#F9FAFB", color: "#6A7282", label: "Info",      icon: "info" },
};

export default function RuleDetail() {
  const router         = useRouter();
  const { ruleId }     = useLocalSearchParams();
  const activeRole     = getCurrentRole();
  const isAdmin        = activeRole === "admin";
  const { submitting, run } = useSubmitLock();

  const [rule,    setRule]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityRules();
      const found = data.rules.find((r) => String(r.id) === String(ruleId));
      if (!found) {
        setRule(null);
        setError("Rule not found.");
        return;
      }
      setRule(found);
    } catch (err) {
      setError(err?.message ?? "Could not load rule.");
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [ruleId]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  /* ── Acknowledge ── */
  const handleAcknowledge = () => {
    run(async () => {
      await acknowledgeRule(rule.id);
      setRule((prev) => ({ ...prev, acknowledged: true, needs_action: false }));
    });
  };

  /* ── Admin delete ── */
  const handleDelete = () => {
    Alert.alert(
      "Delete Rule",
      `Delete "${rule?.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            run(async () => {
              await deleteCommunityRule(rule.id);
              router.back();
            }),
        },
      ],
    );
  };

  /* ── Admin edit ── */
  const handleEdit = () => {
    router.push({
      pathname: PropertyManagementRoutes.RULE_FORM,
      params: { ruleId: String(rule.id) },
    });
  };

  /* ── Render ── */
  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title="Rule Detail" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0052DF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !rule) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title="Rule Detail" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "Rule not found."}</Text>
          <Pressable onPress={router.back} style={styles.retryBtn}>
            <Text style={styles.retryText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sev = SEVERITY[rule.severity] ?? SEVERITY.info;

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Rule Detail"
        right={
          isAdmin ? (
            <View style={styles.adminActions}>
              <Pressable onPress={handleEdit} style={styles.iconBtn}>
                <Feather name="edit-2" size={sf(16)} color="#0052DF" />
              </Pressable>
              <Pressable onPress={handleDelete} style={[styles.iconBtn, styles.iconBtnRed]}>
                <Feather name="trash-2" size={sf(16)} color="#E7000B" />
              </Pressable>
            </View>
          ) : null
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pageStyles.scrollBottom}>
        {/* Severity chip + title block */}
        <View style={[propertyStyles.sectionBlock, styles.heroBlock]}>
          <View style={[styles.severityChip, { backgroundColor: sev.bg }]}>
            <Feather name={sev.icon} size={sf(13)} color={sev.color} />
            <Text style={[styles.severityLabel, { color: sev.color }]}>{sev.label}</Text>
          </View>

          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleCategory}>{rule.category}</Text>

          <View style={styles.metaRow}>
            <Feather name="clock" size={sf(11)} color="#9CA3AF" />
            <Text style={styles.metaText}>
              Updated {rule.updated_at
                ? new Date(rule.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "—"}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={[propertyStyles.sectionBlock, styles.descBlock]}>
          <Text style={styles.descLabel}>Description</Text>
          <Text style={styles.descText}>{rule.description}</Text>
        </View>

        {/* Acknowledgment status */}
        {rule.requires_acknowledgment && (
          <View style={propertyStyles.sectionBlock}>
            {rule.acknowledged || isAdmin ? (
              <View style={styles.ackDone}>
                <Feather name="check-circle" size={sf(20)} color="#10B981" />
                <View>
                  <Text style={styles.ackDoneTitle}>
                    {isAdmin ? "Acknowledgment Required" : "Acknowledged"}
                  </Text>
                  <Text style={styles.ackDoneSub}>
                    {isAdmin
                      ? "Residents must confirm they have read this rule."
                      : "You have confirmed you have read and understood this rule."}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.ackPending}>
                <Feather name="alert-circle" size={sf(18)} color="#E7000B" />
                <View>
                  <Text style={styles.ackPendingTitle}>Acknowledgment Required</Text>
                  <Text style={styles.ackPendingSub}>Please read this rule and tap Acknowledge below.</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer: Acknowledge (resident only, pending only) */}
      {!isAdmin && rule.requires_acknowledgment && !rule.acknowledged && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.ackBtn, submitting && styles.ackBtnDisabled]}
            disabled={submitting}
            onPress={handleAcknowledge}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check" size={sf(16)} color="#FFFFFF" />
                <Text style={styles.ackBtnText}>I Acknowledge This Rule</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered:      { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(12) },
  errorText:     { fontFamily: Fonts.regular, fontSize: sf(14), color: "#E7000B", textAlign: "center" },
  retryBtn:      { paddingVertical: sw(8), paddingHorizontal: sw(16) },
  retryText:     { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0052DF", fontWeight: "700" },

  adminActions:  { flexDirection: "row", gap: sw(6) },
  iconBtn: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(8),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnRed:    { backgroundColor: "#FEF2F2" },

  heroBlock:     { paddingBottom: sw(12) },
  severityChip:  {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    alignSelf: "flex-start",
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: sw(8),
    marginBottom: sw(10),
  },
  severityLabel: { fontFamily: Fonts.bold, fontSize: sf(11), fontWeight: "700" },

  ruleTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(27),
    color: "#101828",
    fontWeight: "700",
  },
  ruleCategory: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#0052DF",
    marginTop: sw(4),
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sw(4), marginTop: sw(8) },
  metaText: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#9CA3AF" },

  descBlock:     { paddingTop: sw(8) },
  descLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    fontWeight: "700",
    color: "#6A7282",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: sw(8),
  },
  descText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(22),
    color: "#364153",
  },

  ackDone: {
    flexDirection: "row",
    gap: sw(10),
    alignItems: "flex-start",
    backgroundColor: "#ECFDF5",
    borderRadius: sw(12),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  ackDoneTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#065F46",
    fontWeight: "700",
  },
  ackDoneSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#047857",
    marginTop: 2,
  },
  ackPending: {
    flexDirection: "row",
    gap: sw(10),
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderRadius: sw(12),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#FFE2E2",
  },
  ackPendingTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#82181A",
    fontWeight: "700",
  },
  ackPendingSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#C10007",
    marginTop: 2,
  },

  footer: {
    paddingHorizontal: sw(18),
    paddingBottom: hp(3),
    paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  ackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#0052DF",
    borderRadius: sw(14),
    paddingVertical: sw(15),
  },
  ackBtnDisabled: { opacity: 0.5 },
  ackBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
