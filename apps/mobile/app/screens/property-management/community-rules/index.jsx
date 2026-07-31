import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import { fetchCommunityRules } from "../../../../services/community-rules-api";
import { getCurrentRole } from "../../../../constants/role-session";

const TYPE_STYLES = {
  important: { bg: "#FEF2F2", color: "#E7000B", label: "Important" },
  standard:  { bg: "#FFFBEB", color: "#E17100", label: "Standard" },
  info:      { bg: "#F9FAFB", color: "#4A5565", label: "Info" },
};

const CATEGORY_PALETTE = [
  { icon: "volume-x", color: "#7C3AED", bg: "#F5F3FF" },
  { icon: "heart", color: "#EC4899", bg: "#FDF2F8" },
  { icon: "home", color: "#2563EB", bg: "#EFF6FF" },
  { icon: "truck", color: "#0891B2", bg: "#ECFEFF" },
  { icon: "trash-2", color: "#059669", bg: "#ECFDF5" },
  { icon: "shield", color: "#DC2626", bg: "#FEF2F2" },
  { icon: "sun", color: "#D97706", bg: "#FFFBEB" },
  { icon: "tool", color: "#4F46E5", bg: "#EEF2FF" },
  { icon: "users", color: "#F97316", bg: "#FFEDD5" },
  { icon: "folder", color: "#64748B", bg: "#F8FAFC" },
];

function getCategoryMeta(name, index = 0) {
  const preset = {
    "Noise & Quiet Hours": CATEGORY_PALETTE[0],
    "Pet Regulations": CATEGORY_PALETTE[1],
    "Common Areas": CATEGORY_PALETTE[2],
    "Parking": CATEGORY_PALETTE[3],
    "Waste Management": CATEGORY_PALETTE[4],
    "Safety & Security": CATEGORY_PALETTE[5],
    "Balcony & Exterior": CATEGORY_PALETTE[6],
    "Renovations": CATEGORY_PALETTE[7],
    "Guests & Visitors": CATEGORY_PALETTE[8],
    Other: CATEGORY_PALETTE[9],
  };
  return preset[name] ?? CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

function SeverityIcon({ severity }) {
  const color = severity === "important" ? "#E7000B" : severity === "standard" ? "#E17100" : "#6A7282";
  const name  = severity === "important" ? "alert-circle" : severity === "standard" ? "alert-triangle" : "info";
  return <Feather name={name} size={sf(16)} color={color} />;
}

export default function CommunityRules() {
  const router     = useRouter();
  const activeRole = getCurrentRole();
  const isAdmin    = activeRole === "admin";

  const [rules,          setRules]          = useState([]);
  const [categories,     setCategories]     = useState([]);
  const [unacknowledged, setUnacknowledged] = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityRules();
      setRules(data.rules);
      setCategories(data.categories);
      setUnacknowledged(data.unacknowledged);
    } catch (err) {
      setError(err?.message ?? "Could not load community rules.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const filteredRules = useMemo(() => {
    if (selectedCategory === "all") return rules;
    return rules.filter((r) => r.category === selectedCategory);
  }, [rules, selectedCategory]);

  const filterOptions = useMemo(() => [
    { key: "all", label: "All", count: rules.length },
    ...categories.map((cat) => ({ key: cat.name, label: cat.name, count: cat.count })),
  ], [categories, rules.length]);

  const openRule = (rule) => {
    router.push({
      pathname: PropertyManagementRoutes.RULE_DETAIL,
      params: { ruleId: String(rule.id) },
    });
  };

  const openAddRule = () => {
    router.push(PropertyManagementRoutes.RULE_FORM);
  };

  const selectCategory = (key) => {
    setSelectedCategory((prev) => (prev === key ? "all" : key));
  };

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title="Community Rules" subtitle="Loading…" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0052DF" />
        </View>
      </SafeAreaView>
    );
  }

  const subtitle = `${rules.length} rule${rules.length !== 1 ? "s" : ""} & guidelines`;

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Community Rules"
        subtitle={subtitle}
        right={
          isAdmin ? (
            <Pressable onPress={openAddRule} style={styles.addBtn}>
              <Feather name="plus" size={sf(16)} color="#0052DF" />
              <Text style={styles.addBtnText}>Add Rule</Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={pageStyles.scrollBottom}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0052DF" colors={["#0052DF"]} />}
      >
        {!isAdmin && unacknowledged > 0 && (
          <View style={propertyStyles.sectionBlock}>
            <Pressable
              style={styles.alertBanner}
              onPress={() => {
                const first = rules.find((r) => r.needs_action);
                if (first) openRule(first);
              }}
            >
              <Feather name="alert-circle" size={sf(18)} color="#E7000B" style={{ marginTop: 2 }} />
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle}>Action Required</Text>
                <Text style={styles.alertText}>
                  {unacknowledged} rule{unacknowledged !== 1 ? "s" : ""} require{unacknowledged === 1 ? "s" : ""} your acknowledgment
                </Text>
                <View style={styles.alertLink}>
                  <Text style={styles.alertLinkText}>Review Now</Text>
                  <Feather name="arrow-right" size={sf(11)} color="#E7000B" />
                </View>
              </View>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={[propertyStyles.sectionBlock, styles.errorBox]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {categories.length > 0 && (
          <View style={propertyStyles.sectionBlock}>
            <View style={styles.quickCategoriesCard}>
              <View style={styles.quickCategoriesHeader}>
                <View style={styles.headingRow}>
                  <View style={styles.headingIconWrap}>
                    <Feather name="grid" size={sf(14)} color="#0052DF" />
                  </View>
                  <View>
                    <Text style={propertyStyles.sectionTitle}>Quick Categories</Text>
                    <Text style={styles.quickCategoriesHint}>Tap a category to filter rules</Text>
                  </View>
                </View>
                {selectedCategory !== "all" && (
                  <Pressable onPress={() => setSelectedCategory("all")} style={styles.clearFilterBtn}>
                    <Text style={styles.clearFilterText}>Clear</Text>
                  </Pressable>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickCategoriesScroll}
              >
                {categories.map((cat, index) => {
                  const meta = getCategoryMeta(cat.name, index);
                  const isSelected = selectedCategory === cat.name;
                  return (
                    <Pressable
                      key={cat.name}
                      onPress={() => selectCategory(cat.name)}
                      style={({ pressed }) => [
                        styles.quickCatCard,
                        isSelected && styles.quickCatCardActive,
                        pressed && styles.quickCatCardPressed,
                      ]}
                    >
                      <View style={[styles.quickCatIcon, { backgroundColor: meta.bg }]}>
                        <Feather name={meta.icon} size={sf(16)} color={meta.color} />
                      </View>
                      <Text
                        style={[styles.quickCatTitle, isSelected && styles.quickCatTitleActive]}
                        numberOfLines={2}
                      >
                        {cat.name}
                        <Text style={[styles.quickCatCountInline, isSelected && styles.quickCatCountInlineActive]}>
                          {" "}({cat.count})
                        </Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        <View style={[propertyStyles.sectionBlock, styles.lastSection]}>
          <View style={styles.rulesSectionHeader}>
            <View>
              <Text style={propertyStyles.sectionTitle}>All Rules</Text>
              <Text style={styles.rulesSectionSub}>
                {filteredRules.length} of {rules.length} rule{rules.length !== 1 ? "s" : ""}
                {selectedCategory !== "all" ? ` in ${selectedCategory}` : ""}
              </Text>
            </View>
          </View>

          {categories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsScroll}
              style={styles.filterChipsList}
            >
              {filterOptions.map((option) => {
                const isActive = selectedCategory === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setSelectedCategory(option.key)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                  >
                    <Text
                      style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                      numberOfLines={1}
                    >
                      {option.key === "all" ? "All" : option.label}
                    </Text>
                    <View style={[styles.filterChipBadge, isActive && styles.filterChipBadgeActive]}>
                      <Text style={[styles.filterChipBadgeText, isActive && styles.filterChipBadgeTextActive]}>
                        {option.count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {rules.length === 0 && !error && (
            <View style={styles.empty}>
              <Feather name="book-open" size={sf(32)} color="#D1D5DB" />
              <Text style={styles.emptyText}>No rules yet</Text>
              {isAdmin && (
                <Text style={styles.emptyHint}>Tap "Add Rule" to create your first community rule.</Text>
              )}
            </View>
          )}

          {rules.length > 0 && filteredRules.length === 0 && (
            <View style={styles.empty}>
              <Feather name="filter" size={sf(28)} color="#D1D5DB" />
              <Text style={styles.emptyText}>No rules in this category</Text>
              <Pressable onPress={() => setSelectedCategory("all")} style={styles.showAllBtn}>
                <Text style={styles.showAllBtnText}>Show all rules</Text>
              </Pressable>
            </View>
          )}

          {filteredRules.map((rule) => {
            const typeStyle = TYPE_STYLES[rule.severity] ?? TYPE_STYLES.info;
            return (
              <Pressable key={rule.id} style={styles.ruleCard} onPress={() => openRule(rule)}>
                <View style={styles.ruleHeader}>
                  <View style={[styles.ruleIconWrap, { backgroundColor: typeStyle.bg }]}>
                    <SeverityIcon severity={rule.severity} />
                  </View>

                  <View style={styles.ruleBody}>
                    <Text style={styles.ruleTitle} numberOfLines={2}>{rule.title}</Text>
                    <Text style={styles.ruleCategory}>{rule.category}</Text>
                    <Text style={styles.ruleDescription} numberOfLines={2}>{rule.description}</Text>
                  </View>

                  <View style={styles.ruleRight}>
                    {isAdmin ? (
                      <Feather name="chevron-right" size={sf(16)} color="#9CA3AF" />
                    ) : rule.needs_action ? (
                      <View style={styles.ackBadge}>
                        <Text style={styles.ackBadgeText}>Ack.</Text>
                      </View>
                    ) : rule.requires_acknowledgment && rule.acknowledged ? (
                      <Feather name="check-circle" size={sf(16)} color="#10B981" />
                    ) : (
                      <Feather name="chevron-right" size={sf(16)} color="#9CA3AF" />
                    )}
                  </View>
                </View>

                <View style={styles.ruleFooter}>
                  <View style={styles.updatedRow}>
                    <Feather name="clock" size={sf(11)} color="#9CA3AF" />
                    <Text style={styles.updatedText}>
                      Updated {rule.updated_at
                        ? new Date(rule.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </Text>
                  </View>
                  <View style={[styles.typePill, { backgroundColor: typeStyle.bg }]}>
                    <Text style={[styles.typeText, { color: typeStyle.color }]}>{typeStyle.label}</Text>
                  </View>
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
    paddingHorizontal: sw(12),
    borderRadius: sw(8),
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  addBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#0052DF",
    fontWeight: "700",
  },
  alertBanner: {
    flexDirection: "row",
    gap: sw(10),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FFE2E2",
    borderRadius: sw(14),
    padding: sw(16),
  },
  alertBody: { flex: 1, minWidth: 0 },
  alertTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.body,
    lineHeight: PropertyType.headingLine,
    color: "#82181A",
    fontWeight: "700",
  },
  alertText: {
    fontFamily: Fonts.regular,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.bodyMdLine,
    color: "#C10007",
    marginTop: 2,
  },
  alertLink: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: sw(6) },
  alertLinkText: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.caption,
    color: "#E7000B",
    fontWeight: "700",
  },
  quickCategoriesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: sw(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickCategoriesHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: sw(14),
    gap: sw(8),
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    flex: 1,
  },
  headingIconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  quickCategoriesHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#9CA3AF",
    marginTop: 2,
  },
  clearFilterBtn: {
    paddingVertical: sw(4),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    backgroundColor: "#F3F4F6",
  },
  clearFilterText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#4A5565",
    fontWeight: "700",
  },
  quickCategoriesScroll: {
    gap: sw(10),
    paddingRight: sw(4),
  },
  quickCatCard: {
    width: sw(118),
    minHeight: sw(96),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    padding: sw(12),
    justifyContent: "space-between",
  },
  quickCatCardActive: {
    borderColor: "#0052DF",
    backgroundColor: "#EFF6FF",
    shadowColor: "#0052DF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  quickCatCardPressed: { opacity: 0.92 },
  quickCatIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  quickCatTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(11.5),
    lineHeight: sf(15),
    color: "#101828",
    fontWeight: "700",
    marginTop: sw(8),
  },
  quickCatTitleActive: { color: "#0052DF" },
  quickCatCountInline: {
    fontFamily: Fonts.medium,
    fontSize: sf(10.5),
    color: "#9CA3AF",
    fontWeight: "600",
  },
  quickCatCountInlineActive: { color: "#60A5FA" },
  rulesSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  rulesSectionSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#9CA3AF",
    marginTop: 2,
  },
  filterChipsList: { marginBottom: sw(12), flexGrow: 0 },
  filterChipsScroll: { gap: sw(8), paddingRight: sw(4) },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(8),
    paddingHorizontal: sw(12),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    maxWidth: sw(200),
  },
  filterChipActive: {
    borderColor: "#0052DF",
    backgroundColor: "#0052DF",
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#4A5565",
    fontWeight: "600",
    flexShrink: 1,
  },
  filterChipTextActive: { color: "#FFFFFF" },
  filterChipBadge: {
    minWidth: sw(20),
    paddingHorizontal: sw(6),
    paddingVertical: sw(1),
    borderRadius: sw(999),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  filterChipBadgeActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  filterChipBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#6A7282",
    fontWeight: "700",
  },
  filterChipBadgeTextActive: { color: "#FFFFFF" },
  lastSection: { borderBottomWidth: 0 },
  ruleCard: {
    marginTop: sw(12),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: sw(14),
    padding: sw(14),
    backgroundColor: "#FFFFFF",
  },
  ruleHeader: { flexDirection: "row", gap: sw(10), alignItems: "flex-start" },
  ruleIconWrap: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ruleBody: { flex: 1, minWidth: 0, gap: 2 },
  ruleRight: { flexShrink: 0, alignItems: "flex-end", paddingTop: sw(2) },
  ruleTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.body,
    lineHeight: PropertyType.headingLine,
    color: "#101828",
    fontWeight: "700",
  },
  ruleCategory: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
    color: "#6A7282",
  },
  ruleDescription: {
    fontFamily: Fonts.regular,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.bodyMdLine,
    color: "#364153",
    marginTop: 2,
  },
  ackBadge: {
    backgroundColor: "#FEF2F2",
    borderRadius: sw(6),
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderWidth: 1,
    borderColor: "#FFE2E2",
  },
  ackBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.micro,
    color: "#E7000B",
    fontWeight: "700",
  },
  ruleFooter: {
    marginTop: sw(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: sw(4), flex: 1 },
  updatedText: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
    color: "#9CA3AF",
  },
  typePill: {
    paddingVertical: sw(4),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    flexShrink: 0,
  },
  typeText: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
  },
  empty: { alignItems: "center", paddingVertical: sw(40), gap: sw(8) },
  emptyText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#9CA3AF", fontWeight: "700" },
  emptyHint: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#D1D5DB", textAlign: "center" },
  showAllBtn: {
    marginTop: sw(4),
    paddingVertical: sw(8),
    paddingHorizontal: sw(14),
    borderRadius: sw(8),
    backgroundColor: "#EFF6FF",
  },
  showAllBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#0052DF",
    fontWeight: "700",
  },
  errorBox: { gap: sw(8) },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#E7000B" },
  retryBtn: { alignSelf: "flex-start" },
  retryText: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#0052DF", fontWeight: "700" },
});
