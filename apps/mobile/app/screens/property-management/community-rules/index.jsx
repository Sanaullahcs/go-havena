import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { Fonts } from "../../../../constants/font";
import { HomeTheme as T } from "../../../../constants/home-theme";
import { sw, sf } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import { fetchCommunityRules } from "../../../../services/community-rules-api";
import { RULE_SEVERITIES } from "../../../../constants/community-rule-categories";
import { getCurrentRole } from "../../../../constants/role-session";
import { chevronForward, arrowForward } from "../../../../utils/rtl";
import { rnShadow } from "../../../../utils/shadow";


const SEV = {
  important: { accent: "#DC2626", bg: "#FEF2F2", label: "propertyMgmt.importantLabel", icon: "alert-circle" },
  standard: { accent: "#1B4F8A", bg: "#E8F1FA", label: "propertyMgmt.standardLabel", icon: "minus-circle" },
  info: { accent: T.deepTeal, bg: T.mint, label: "propertyMgmt.infoLabel", icon: "info" },
};

function severityMeta(severity) {
  if (SEV[severity]) return SEV[severity];
  return {
    accent: "#475569",
    bg: "#F1F5F9",
    label: null,
    icon: "flag",
  };
}

const CAT = {
  "Noise & Quiet Hours": { icon: "moon", accent: "#7C3AED" },
  "Pet Regulations": { icon: "heart", accent: "#DB2777" },
  "Common Areas": { icon: "home", accent: T.deepTeal },
  Parking: { icon: "truck", accent: "#0891B2" },
  "Waste Management": { icon: "trash-2", accent: "#059669" },
  "Safety & Security": { icon: "shield", accent: "#DC2626" },
  "Balcony & Exterior": { icon: "sun", accent: "#D97706" },
  Renovations: { icon: "tool", accent: "#4F46E5" },
  "Guests & Visitors": { icon: "users", accent: "#EA580C" },
  Other: { icon: "folder", accent: "#64748B" },
};

function catMeta(name) {
  return CAT[name] ?? { icon: "bookmark", accent: T.navy };
}

function RuleCard({ rule, isAdmin, onPress }) {
  const { t, i18n } = useTranslation();
  const sev = severityMeta(rule.severity);
  const cat = catMeta(rule.category);
  const needsAck = !isAdmin && rule.needs_action;
  const acked = !isAdmin && rule.requires_acknowledgment && rule.acknowledged;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={rule.title}
    >
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <View style={[styles.cardIcon, { backgroundColor: `${cat.accent}14` }]}>
              <Feather name={cat.icon} size={sf(16)} color={cat.accent} />
            </View>
            <View style={styles.cardTopText}>
              <Text style={styles.cardCategory} numberOfLines={1}>
                {rule.category}
              </Text>
            </View>
            {rule.severity ? (
              <View style={[styles.sevChip, { backgroundColor: sev.bg, borderColor: `${sev.accent}30` }]}>
                <Feather name={sev.icon} size={sf(10)} color={sev.accent} />
                <Text style={[styles.sevChipText, { color: sev.accent }]}>
                  {sev.label ? t(sev.label) : rule.severity}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>{rule.title}</Text>
          {rule.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{rule.description}</Text>
          ) : null}

          <View style={styles.cardFooter}>
            <Text style={styles.cardDate} numberOfLines={1}>
              {rule.updated_at
                ? new Date(rule.updated_at).toLocaleDateString(getLocaleForLang(i18n.language), { month: "short", day: "numeric" })
                : ""}
            </Text>
            {needsAck ? (
              <View style={styles.ackBadge}>
                <Feather name="alert-circle" size={sf(10)} color="#DC2626" />
                <Text style={styles.ackBadgeText}>{t("propertyMgmt.reviewBadge")}</Text>
              </View>
            ) : acked ? (
              <View style={styles.doneBadge}>
                <Feather name="check-circle" size={sf(10)} color={T.deepTeal} />
                <Text style={styles.doneBadgeText}>{t("propertyMgmt.doneBadge")}</Text>
              </View>
            ) : (
              <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function CommunityRules() {
  const router = useRouter();
  const { t } = useTranslation();
  const isAdmin = getCurrentRole() === "admin";

  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [unacknowledged, setUnacknowledged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [severityOpen, setSeverityOpen] = useState(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityRules();
      setRules(data.rules ?? []);
      setCategories(data.categories ?? []);
      setUnacknowledged(data.unacknowledged ?? 0);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadRules"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useFocusEffect(useCallback(() => { load(hasLoadedOnce.current); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const severityOptions = useMemo(() => {
    const known = new Set(RULE_SEVERITIES.map((item) => item.key));
    const extras = [];
    rules.forEach((rule) => {
      const key = rule.severity;
      if (key && !known.has(key) && !extras.includes(key)) extras.push(key);
    });
    return [
      { key: "all", labelKey: "propertyMgmt.allFilter" },
      ...RULE_SEVERITIES.map((item) => ({ key: item.key, labelKey: item.labelKey })),
      ...extras.map((key) => ({ key, label: key })),
    ];
  }, [rules]);

  const selectedSeverity = severityOptions.find((item) => item.key === severityFilter) ?? severityOptions[0];

  const filtered = useMemo(() => {
    return rules.filter((rule) => {
      if (severityFilter !== "all" && rule.severity !== severityFilter) return false;
      if (activeFilter !== "all" && rule.category !== activeFilter) return false;
      return true;
    });
  }, [rules, activeFilter, severityFilter]);

  const pendingRules = useMemo(
    () => filtered.filter((rule) => rule.needs_action),
    [filtered],
  );
  const listedRules = useMemo(
    () => filtered.filter((rule) => !rule.needs_action),
    [filtered],
  );

  const listedGroups = useMemo(() => {
    if (activeFilter !== "all") {
      return listedRules.length ? [{ name: activeFilter, rules: listedRules }] : [];
    }

    const names = categories.map((category) => category.name);
    const known = new Set(names);
    const groups = names
      .map((name) => ({
        name,
        rules: listedRules.filter((rule) => rule.category === name),
      }))
      .filter((group) => group.rules.length > 0);

    const extras = [...new Set(listedRules.map((rule) => rule.category).filter((name) => name && !known.has(name)))];
    extras.forEach((name) => {
      groups.push({
        name,
        rules: listedRules.filter((rule) => rule.category === name),
      });
    });

    return groups;
  }, [activeFilter, categories, listedRules]);

  const ackedCount = useMemo(
    () => rules.filter((r) => r.requires_acknowledgment && r.acknowledged).length,
    [rules],
  );

  const importantCount = useMemo(
    () => rules.filter((r) => r.severity === "important").length,
    [rules],
  );

  const openRule = (rule) =>
    router.push({ pathname: PropertyManagementRoutes.RULE_DETAIL, params: { ruleId: String(rule.id) } });

  const openAddRule = () => router.push(PropertyManagementRoutes.RULE_FORM);

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.rulesTitle")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.navy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.rulesTitle")}
        right={
          isAdmin ? (
            <Pressable onPress={openAddRule} style={styles.addBtn} hitSlop={6}>
              <Feather name="plus" size={sf(16)} color={T.navy} />
              <Text style={styles.addBtnText}>{t("propertyMgmt.addBtn")}</Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.teal} colors={[T.teal]} />
        }
      >
        {/* ── Stats strip ── */}
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{rules.length}</Text>
            <Text style={styles.statLabel}>{t("propertyMgmt.rulesCount")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{categories.length}</Text>
            <Text style={styles.statLabel}>{t("propertyMgmt.categoriesCount")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, importantCount > 0 && { color: "#DC2626" }]}>{importantCount}</Text>
            <Text style={styles.statLabel}>{t("propertyMgmt.importantLabel")}</Text>
          </View>
          {!isAdmin ? (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: T.deepTeal }]}>{ackedCount}</Text>
                <Text style={styles.statLabel}>{t("propertyMgmt.ackdLabel")}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* ── Action required ── */}
        {!isAdmin && unacknowledged > 0 ? (
          <Pressable
            style={styles.alertRow}
            onPress={() => {
              const first = rules.find((r) => r.needs_action);
              if (first) openRule(first);
            }}
          >
            <View style={styles.alertDot} />
            <Text style={styles.alertText}>
              {t("propertyMgmt.awaitingReview", { count: unacknowledged })}
            </Text>
            <Feather name={arrowForward()} size={sf(14)} color="#991B1B" />
          </Pressable>
        ) : null}

        {/* ── Error ── */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()}>
              <Text style={styles.linkText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.severityWrap}>
          <Text style={styles.severityLabel}>{t("propertyMgmt.severityFilter")}</Text>
          <Pressable
            onPress={() => setSeverityOpen(true)}
            style={styles.severitySelect}
            accessibilityRole="button"
            accessibilityLabel={t("propertyMgmt.severityFilter")}
          >
            <Text style={styles.severitySelectText} numberOfLines={1}>
              {selectedSeverity?.label ?? (selectedSeverity?.labelKey ? t(selectedSeverity.labelKey) : t("propertyMgmt.allFilter"))}
            </Text>
            <Feather name="chevron-down" size={sf(16)} color={T.navy} />
          </Pressable>
        </View>

        {/* ── Category filter chips ── */}
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRail}
            style={styles.chipWrap}
          >
            <Pressable
              onPress={() => setActiveFilter("all")}
              style={[styles.chip, activeFilter === "all" && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, activeFilter === "all" && styles.chipLabelOn]}>{t("propertyMgmt.allFilter")}</Text>
            </Pressable>
            {categories.map((cat) => {
              const on = activeFilter === cat.name;
              const m = catMeta(cat.name);
              return (
                <Pressable
                  key={cat.name}
                  onPress={() => setActiveFilter(on ? "all" : cat.name)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Feather name={m.icon} size={sf(12)} color={on ? "#FFF" : m.accent} />
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* ── Empty states ── */}
        {rules.length === 0 && !error ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="book-open" size={sf(24)} color={T.deepTeal} />
            </View>
            <Text style={styles.emptyTitle}>{t("propertyMgmt.noRules")}</Text>
            <Text style={styles.emptyHint}>
              {isAdmin ? t("propertyMgmt.createFirstGuideline") : t("propertyMgmt.guidelinesPublished")}
            </Text>
            {isAdmin ? (
              <Pressable onPress={openAddRule} style={styles.emptyCta}>
                <Feather name="plus" size={sf(14)} color="#FFF" />
                <Text style={styles.emptyCtaText}>{t("propertyMgmt.addRule")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {rules.length > 0 && filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("propertyMgmt.nothingHere")}</Text>
            <Pressable onPress={() => { setActiveFilter("all"); setSeverityFilter("all"); }}>
              <Text style={styles.linkText}>{t("propertyMgmt.showAllGuidelines")}</Text>
            </Pressable>
          </View>
        ) : null}

        {!isAdmin && pendingRules.length > 0 ? (
          <View style={styles.ackSection}>
            <View style={styles.sectionHead}>
              <Text style={styles.ackSectionLabel}>{t("propertyMgmt.ackRequired")}</Text>
              <View style={styles.ackCountBadge}>
                <Text style={styles.ackCount}>{pendingRules.length}</Text>
              </View>
            </View>
            <Text style={styles.ackSectionHint}>{t("propertyMgmt.ackRequiredDesc")}</Text>
            <View style={styles.list}>
              {pendingRules.map((rule) => (
                <RuleCard
                  key={`pending-${rule.id}`}
                  rule={rule}
                  isAdmin={isAdmin}
                  onPress={() => openRule(rule)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Rule cards ── */}
        {listedGroups.map((group) => (
          <View key={group.name}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>{group.name}</Text>
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCount}>{group.rules.length}</Text>
              </View>
            </View>
            <View style={styles.list}>
              {group.rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  isAdmin={isAdmin}
                  onPress={() => openRule(rule)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={severityOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSeverityOpen(false)}
      >
        <View style={styles.severityBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSeverityOpen(false)} />
          <View style={styles.severitySheet}>
            <Text style={styles.severitySheetTitle}>{t("propertyMgmt.severityFilter")}</Text>
            {severityOptions.map((option) => {
              const selected = option.key === severityFilter;
              const label = option.label ?? t(option.labelKey);
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setSeverityFilter(option.key);
                    setSeverityOpen(false);
                  }}
                  style={[styles.severityOption, selected && styles.severityOptionOn]}
                >
                  <Text style={[styles.severityOptionText, selected && styles.severityOptionTextOn]}>
                    {label}
                  </Text>
                  {selected ? <Feather name="check" size={sf(16)} color={T.navy} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const G = sw(18);
const shadow = Platform.select({
  ios: { ...rnShadow({ color: T.navy, offset: { width: 0, height: 2 }, opacity: 0.04, radius: 6 })},
  android: { elevation: 1 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.white },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: sw(48) },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingVertical: sw(7),
    paddingHorizontal: sw(12),
    borderRadius: sw(10),
    backgroundColor: T.mint,
  },
  addBtnText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: T.navy, fontWeight: "600" },

  /* Stats strip */
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: G,
    marginTop: sw(4),
    marginBottom: sw(16),
    backgroundColor: T.white,
    borderRadius: sw(14),
    paddingVertical: sw(14),
    borderWidth: 1,
    borderColor: T.border,
  },
  statItem: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: sw(28), backgroundColor: T.border },
  statNum: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    color: T.gray,
    marginTop: sw(2),
    includeFontPadding: false,
  },

  /* Alert */
  alertRow: {
    marginHorizontal: G,
    marginBottom: sw(14),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: "#FEF2F2",
    borderRadius: sw(14),
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  alertDot: { width: sw(8), height: sw(8), borderRadius: sw(4), backgroundColor: "#DC2626" },
  alertText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#991B1B", flex: 1, fontWeight: "500", includeFontPadding: false },

  /* Error */
  errorBox: { marginHorizontal: G, marginBottom: sw(12), padding: sw(14), borderRadius: sw(14), backgroundColor: "#FEF2F2", gap: sw(6) },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#B91C1C", includeFontPadding: false },
  linkText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.navy, fontWeight: "600" },

  /* Chips */
  chipWrap: { flexGrow: 0, marginBottom: sw(14) },
  chipRail: { paddingHorizontal: G, gap: sw(8) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingVertical: sw(8),
    paddingHorizontal: sw(14),
    borderRadius: sw(999),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipOn: { backgroundColor: T.navy, borderColor: T.navy },
  chipLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: T.navy, fontWeight: "600", includeFontPadding: false },
  chipLabelOn: { color: "#FFFFFF" },

  severityWrap: { marginHorizontal: G, marginBottom: sw(14), gap: sw(6) },
  severityLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: T.gray,
    fontWeight: "600",
  },
  severitySelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sw(44),
    paddingHorizontal: sw(14),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.white,
  },
  severitySelectText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
    marginEnd: sw(8),
  },
  severityBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    paddingHorizontal: sw(28),
  },
  severitySheet: {
    backgroundColor: T.white,
    borderRadius: sw(16),
    padding: sw(12),
    gap: sw(4),
  },
  severitySheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: T.navy,
    fontWeight: "700",
    paddingHorizontal: sw(8),
    paddingVertical: sw(8),
  },
  severityOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    borderRadius: sw(10),
  },
  severityOptionOn: { backgroundColor: T.mint },
  severityOptionText: { fontFamily: Fonts.medium, fontSize: sf(14), color: T.navy, fontWeight: "500" },
  severityOptionTextOn: { fontFamily: Fonts.bold, fontWeight: "700" },

  ackSection: { marginBottom: sw(8) },
  ackSectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#991B1B",
    fontWeight: "600",
  },
  ackSectionHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#991B1B",
    paddingHorizontal: G,
    marginTop: -sw(4),
    marginBottom: sw(10),
  },
  ackCountBadge: {
    minWidth: sw(24),
    height: sw(24),
    paddingHorizontal: sw(8),
    borderRadius: sw(12),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  ackCount: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#DC2626",
    fontWeight: "700",
  },

  /* Section */
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: G,
    marginBottom: sw(10),
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: T.gray,
    fontWeight: "600",
    includeFontPadding: false,
  },
  sectionCountBadge: {
    minWidth: sw(24),
    height: sw(24),
    paddingHorizontal: sw(8),
    borderRadius: sw(12),
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCount: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.deepTeal,
    fontWeight: "700",
    includeFontPadding: false,
  },

  /* Rule card */
  list: { paddingHorizontal: G, gap: sw(14), marginBottom: sw(16) },
  cardPressable: { width: "100%" },
  card: {
    width: "100%",
    backgroundColor: T.white,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
    ...shadow,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardInner: { padding: sw(14) },
  cardTop: { flexDirection: "row", alignItems: "center", gap: sw(10), marginBottom: sw(8) },
  cardIcon: { width: sw(34), height: sw(34), borderRadius: sw(11), alignItems: "center", justifyContent: "center" },
  cardTopText: { flex: 1, minWidth: 0 },
  cardCategory: { fontFamily: Fonts.medium, fontSize: sf(11), color: T.gray, fontWeight: "500", includeFontPadding: false },
  sevChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(3),
    paddingHorizontal: sw(7),
    paddingVertical: sw(3),
    borderRadius: sw(6),
    borderWidth: 1,
  },
  sevChipText: { fontFamily: Fonts.semiBold, fontSize: sf(9), fontWeight: "600", includeFontPadding: false },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },
  cardDesc: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: T.gray,
    marginTop: sw(4),
    includeFontPadding: false,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sw(10),
    paddingTop: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
  },
  cardDate: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8", includeFontPadding: false },
  ackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "#FEF2F2",
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: sw(8),
  },
  ackBadgeText: { fontFamily: Fonts.semiBold, fontSize: sf(10), color: "#DC2626", fontWeight: "600", includeFontPadding: false },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: T.mint,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: sw(8),
  },
  doneBadgeText: { fontFamily: Fonts.semiBold, fontSize: sf(10), color: T.deepTeal, fontWeight: "600", includeFontPadding: false },

  /* Empty */
  empty: { alignItems: "center", paddingVertical: sw(44), paddingHorizontal: sw(28), gap: sw(8) },
  emptyIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(18),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: { fontFamily: Fonts.semiBold, fontSize: sf(16), color: T.navy, fontWeight: "600", includeFontPadding: false },
  emptyHint: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: T.gray, textAlign: "center", includeFontPadding: false },
  emptyCta: {
    marginTop: sw(12),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: T.navy,
    paddingVertical: sw(11),
    paddingHorizontal: sw(18),
    borderRadius: sw(12),
  },
  emptyCtaText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#FFFFFF", fontWeight: "600" },
});
