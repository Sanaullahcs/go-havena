import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import BaseTap from "../../../components/ui/tap";
import { KuickpayColors, KuickpayMark, KuickpayMethodsStrip } from "../../../components/payments/kuickpay-brand";
import { UTILITY_CATEGORIES } from "../../../components/payments/utility-meta";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { Fonts } from "../../../constants/font";
import { useBillsSummary } from "../../../hooks/use-bills-summary";
import { PAYMENT_RESULT_ROUTE } from "../../../hooks/use-kuickpay-pay";
import { formatCommunityMoney } from "../../../utils/money";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#EEF2F7";
const NAVY = "#1B4F8A";
const DANGER = "#DC2626";

const GROUP_META = {
  unit: { icon: "home-city-outline", color: NAVY, bg: "#E8F0F7", route: PropertyManagementRoutes.UNIT_BILLS, titleKey: "bills.unitBills" },
  amenity: { icon: "calendar-star", color: "#0F766E", bg: "#E6F4F1", route: PropertyManagementRoutes.AMENITY_BILLS, titleKey: "bills.amenityBills" },
  utility: { icon: "lightning-bolt", color: "#D97706", bg: "#FFF7E6", route: PropertyManagementRoutes.UTILITIES, titleKey: "bills.utilityBills" },
};

const PAYMENT_TONE = {
  success: { color: "#047857", bg: "#ECFDF5", icon: "check" },
  pending: { color: "#B45309", bg: "#FFFBEB", icon: "clock" },
  danger: { color: DANGER, bg: "#FEF2F2", icon: "x" },
  muted: { color: "#475569", bg: "#F1F5F9", icon: "minus" },
};

function formatDay(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Tap({ label, ...rest }) {
  return <BaseTap accessibilityRole="button" accessibilityLabel={label} hitSlop={4} {...rest} />;
}

function ServiceTile({ icon, color, bg, label, count, alert, onPress }) {
  return (
    <View style={styles.tileCell}>
      <Tap onPress={onPress} style={styles.tile} label={label}>
        <View style={[styles.tileIcon, { backgroundColor: bg }]}>
          <MaterialCommunityIcons name={icon} size={sf(25)} color={color} />
          {count > 0 ? (
            <View style={[styles.tileBadge, alert && styles.tileBadgeAlert]}>
              <Text style={styles.tileBadgeText}>{count > 9 ? "9+" : count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
      </Tap>
    </View>
  );
}

function SectionCard({ title, action, onAction, children }) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {action ? (
            <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
              <Text style={styles.cardAction}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export default function BillsHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { summary, loading, refresh, kuickpay } = useBillsSummary();
  const [pulling, setPulling] = useState(false);
  const [hidden, setHidden] = useState(false);

  useFocusEffect(useCallback(() => { void refresh({ force: true }); }, [refresh]));

  const onPull = useCallback(async () => {
    setPulling(true);
    try {
      await refresh({ force: true });
    } finally {
      setPulling(false);
    }
  }, [refresh]);

  const groups = summary?.groups ?? {};
  const due = summary?.dueCount ?? 0;
  const overdue = summary?.overdueCount ?? 0;
  const showUnit = Boolean(summary?.isBillingContact);
  const showUtilities = kuickpay && Boolean(summary?.utilitiesEnabled);
  const linkedUtilities = summary?.linkedUtilities ?? 0;

  const visibleGroups = ["unit", "amenity", "utility"].filter((key) => {
    if (key === "unit") return showUnit;
    if (key === "utility") return showUtilities;
    return true;
  });
  const dueGroups = visibleGroups.filter((key) => (groups[key]?.count ?? 0) > 0);
  const payTarget =
    dueGroups.find((key) => (groups[key]?.overdue ?? 0) > 0) ?? dueGroups[0] ?? null;

  const openUtility = (serviceType) => {
    if (linkedUtilities > 0) router.push(PropertyManagementRoutes.UTILITIES);
    else router.push({ pathname: "/screens/utilities/add", params: { serviceType } });
  };

  const masked = (value) => formatCommunityMoney(value).replace(/\d[\d.,\s]*\d|\d/, "••••");
  const amountText = hidden ? masked(summary?.dueTotal ?? 0) : formatCommunityMoney(summary?.dueTotal ?? 0);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("bills.title")} subtitle={t("bills.subtitle")} />
      {loading && !summary ? (
        <View style={styles.centered}><ActivityIndicator color={NAVY} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={NAVY} />}
        >
          <LinearGradient
            colors={["#0B3B6E", "#1B4F8A", "#0F766E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={[styles.orb, styles.orbOne]} />
            <View style={[styles.orb, styles.orbTwo]} />

            <View style={styles.heroRow}>
              <Text style={styles.heroLabel}>{t("bills.totalDue")}</Text>
              <Pressable
                onPress={() => setHidden((value) => !value)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={hidden ? t("bills.showAmount") : t("bills.hideAmount")}
              >
                <Feather name={hidden ? "eye-off" : "eye"} size={sf(16)} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </View>
            <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{amountText}</Text>

            <View style={styles.heroChips}>
              {due > 0 ? (
                <>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{t("bills.billsDue", { count: due })}</Text>
                  </View>
                  {overdue > 0 ? (
                    <View style={[styles.chip, styles.chipAlert]}>
                      <Feather name="alert-circle" size={sf(11)} color="#FFFFFF" />
                      <Text style={styles.chipText}>{t("bills.overdueCount", { count: overdue })}</Text>
                    </View>
                  ) : summary?.nextDue ? (
                    <View style={styles.chip}>
                      <Feather name="clock" size={sf(11)} color="#FFFFFF" />
                      <Text style={styles.chipText}>{t("bills.nextDue", { date: formatDay(summary.nextDue) })}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={[styles.chip, styles.chipOk]}>
                  <Feather name="check-circle" size={sf(11)} color="#FFFFFF" />
                  <Text style={styles.chipText}>{t("bills.allClear")}</Text>
                </View>
              )}
            </View>

            <View style={styles.heroActions}>
              {payTarget ? (
                <Tap onPress={() => router.push(GROUP_META[payTarget].route)} style={styles.heroPrimary} label={t("bills.payNow")}>
                  <Feather name="arrow-up-right" size={sf(16)} color={NAVY} />
                  <Text style={styles.heroPrimaryText}>{t("bills.payNow")}</Text>
                </Tap>
              ) : null}
              {kuickpay ? (
                <Tap
                  onPress={() => router.push(PropertyManagementRoutes.PAYMENTS_HISTORY)}
                  style={[styles.heroGhost, !payTarget && styles.heroGhostWide]}
                  label={t("bills.history")}
                >
                  <Feather name="clock" size={sf(15)} color="#FFFFFF" />
                  <Text style={styles.heroGhostText}>{t("bills.history")}</Text>
                </Tap>
              ) : null}
            </View>
          </LinearGradient>

          {summary?.processingCount ? (
            <View style={styles.processing}>
              <ActivityIndicator size="small" color="#B45309" />
              <Text style={styles.processingText}>{t("bills.processingBanner", { count: summary.processingCount })}</Text>
            </View>
          ) : null}

          <SectionCard title={t("bills.payABill")}>
            <View style={styles.grid}>
              {showUnit ? (
                <ServiceTile
                  {...GROUP_META.unit}
                  label={t("bills.tiles.unit")}
                  count={groups.unit?.count ?? 0}
                  alert={(groups.unit?.overdue ?? 0) > 0}
                  onPress={() => router.push(GROUP_META.unit.route)}
                />
              ) : null}
              <ServiceTile
                {...GROUP_META.amenity}
                label={t("bills.tiles.amenity")}
                count={groups.amenity?.count ?? 0}
                alert={(groups.amenity?.overdue ?? 0) > 0}
                onPress={() => router.push(GROUP_META.amenity.route)}
              />
              {showUtilities
                ? UTILITY_CATEGORIES.map((category) => (
                    <ServiceTile
                      key={category.id}
                      icon={category.icon}
                      color={category.color}
                      bg={category.bg}
                      label={t(`utilities.categories.${category.id}`)}
                      onPress={() => openUtility(category.id)}
                    />
                  ))
                : null}
              {kuickpay ? (
                <ServiceTile
                  icon="receipt"
                  color="#475569"
                  bg="#F1F5F9"
                  label={t("bills.tiles.receipts")}
                  onPress={() => router.push(PropertyManagementRoutes.PAYMENTS_HISTORY)}
                />
              ) : null}
            </View>
          </SectionCard>

          <SectionCard title={t("bills.dueNow")}>
            {dueGroups.length ? (
              dueGroups.map((key, index) => {
                const meta = GROUP_META[key];
                const group = groups[key];
                return (
                  <Tap
                    key={key}
                    onPress={() => router.push(meta.route)}
                    style={[styles.row, index > 0 && styles.rowDivider]}
                    label={t(meta.titleKey)}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: meta.bg }]}>
                      <MaterialCommunityIcons name={meta.icon} size={sf(22)} color={meta.color} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{t(meta.titleKey)}</Text>
                      <Text style={[styles.rowMeta, group.overdue > 0 && styles.rowMetaAlert]} numberOfLines={1}>
                        {group.overdue > 0
                          ? t("bills.overdueCount", { count: group.overdue })
                          : group.nextDue
                            ? t("bills.nextDue", { date: formatDay(group.nextDue) })
                            : t("bills.billsDue", { count: group.count })}
                      </Text>
                    </View>
                    <View style={styles.rowEnd}>
                      <Text style={styles.rowAmount}>{hidden ? masked(group.total) : formatCommunityMoney(group.total)}</Text>
                      {group.processing > 0 ? (
                        <Text style={styles.rowProcessing}>{t("bills.processing")}</Text>
                      ) : (
                        <View style={styles.payPill}>
                          <Text style={styles.payPillText}>{t("bills.pay")}</Text>
                        </View>
                      )}
                    </View>
                  </Tap>
                );
              })
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Feather name="check" size={sf(22)} color="#047857" />
                </View>
                <Text style={styles.emptyTitle}>{t("bills.allClear")}</Text>
                <Text style={styles.emptyBody}>{t("bills.allClearBody")}</Text>
              </View>
            )}
            {!showUnit ? (
              <View style={styles.note}>
                <Feather name="info" size={sf(13)} color={MUTED} />
                <Text style={styles.noteText}>{t("bills.notBillingContact")}</Text>
              </View>
            ) : null}
          </SectionCard>

          {kuickpay ? (
            <SectionCard
              title={t("bills.recentPayments")}
              action={summary?.recentPayments?.length ? t("bills.seeAll") : null}
              onAction={() => router.push(PropertyManagementRoutes.PAYMENTS_HISTORY)}
            >
              {summary?.recentPayments?.length ? (
                summary.recentPayments.map((payment, index) => {
                  const tone = PAYMENT_TONE[payment.tone] ?? PAYMENT_TONE.muted;
                  return (
                    <Tap
                      key={payment.id}
                      onPress={() => router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id: payment.id } })}
                      style={[styles.row, index > 0 && styles.rowDivider]}
                      label={payment.title}
                    >
                      <View style={[styles.rowIcon, styles.rowIconRound, { backgroundColor: tone.bg }]}>
                        <Feather name={tone.icon} size={sf(15)} color={tone.color} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{payment.title}</Text>
                        <Text style={[styles.rowMeta, { color: tone.color }]} numberOfLines={1}>{payment.status_label}</Text>
                      </View>
                      <Text style={styles.rowAmount}>{payment.formatted_amount}</Text>
                    </Tap>
                  );
                })
              ) : (
                <View style={styles.emptyInline}>
                  <Feather name="file-text" size={sf(18)} color="#94A3B8" />
                  <Text style={styles.emptyInlineText}>{t("bills.noPayments")}</Text>
                </View>
              )}
            </SectionCard>
          ) : null}

          {kuickpay ? (
            <View style={styles.trust}>
              <View style={styles.trustHead}>
                <KuickpayMark size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trustTitle}>{t("bills.securedBy")}</Text>
                  <Text style={styles.trustBody}>{t("bills.payInstantly")}</Text>
                </View>
                <Feather name="lock" size={sf(15)} color="#047857" />
              </View>
              <KuickpayMethodsStrip compact />
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FB" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: sw(16), paddingBottom: sw(40), gap: sw(14) },
  hero: { borderRadius: sw(24), padding: sw(20), overflow: "hidden" },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  orbOne: { width: sw(190), height: sw(190), top: -sw(70), right: -sw(50) },
  orbTwo: { width: sw(120), height: sw(120), bottom: -sw(50), left: -sw(30) },
  heroRow: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  heroLabel: { fontFamily: Fonts.medium, fontSize: sf(13), color: "rgba(255,255,255,0.82)" },
  heroAmount: { fontFamily: Fonts.bold, fontSize: sf(34), color: "#FFFFFF", marginTop: sw(4), letterSpacing: 0.3 },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: sw(6), marginTop: sw(10) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  chipAlert: { backgroundColor: "rgba(239,68,68,0.85)" },
  chipOk: { backgroundColor: "rgba(16,185,129,0.35)" },
  chipText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#FFFFFF" },
  heroActions: { flexDirection: "row", gap: sw(10), marginTop: sw(18) },
  heroPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    height: sw(42),
    paddingHorizontal: sw(22),
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  heroPrimaryText: { fontFamily: Fonts.bold, fontSize: sf(14), color: NAVY },
  heroGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    height: sw(42),
    paddingHorizontal: sw(18),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  heroGhostWide: { paddingHorizontal: sw(22) },
  heroGhostText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },

  processing: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    padding: sw(12),
    borderRadius: sw(14),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  processingText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#92400E" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(20),
    padding: sw(16),
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 12, elevation: 2 }),
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sw(12) },
  cardTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: INK },
  cardAction: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },

  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -sw(4), rowGap: sw(14) },
  tileCell: { width: "25%", paddingHorizontal: sw(4) },
  tile: { alignItems: "center", gap: sw(7) },
  tileIcon: { width: sw(52), height: sw(52), borderRadius: sw(18), alignItems: "center", justifyContent: "center" },
  tileBadge: {
    position: "absolute",
    top: -sw(4),
    right: -sw(4),
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(4),
    borderRadius: 999,
    backgroundColor: NAVY,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeAlert: { backgroundColor: DANGER },
  tileBadgeText: { fontFamily: Fonts.bold, fontSize: sf(9), color: "#FFFFFF", includeFontPadding: false },
  tileLabel: { fontFamily: Fonts.medium, fontSize: sf(11.5), lineHeight: sf(15), color: INK, textAlign: "center" },

  row: { flexDirection: "row", alignItems: "center", gap: sw(12), paddingVertical: sw(12) },
  rowDivider: { borderTopWidth: 1, borderTopColor: LINE },
  rowIcon: { width: sw(42), height: sw(42), borderRadius: sw(14), alignItems: "center", justifyContent: "center" },
  rowIconRound: { borderRadius: sw(21) },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: INK },
  rowMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: MUTED, marginTop: sw(2) },
  rowMetaAlert: { color: DANGER, fontFamily: Fonts.medium },
  rowEnd: { alignItems: "flex-end", gap: sw(6) },
  rowAmount: { fontFamily: Fonts.bold, fontSize: sf(14), color: INK },
  rowProcessing: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#B45309" },
  payPill: { paddingHorizontal: sw(14), paddingVertical: sw(4), borderRadius: 999, backgroundColor: KuickpayColors.brand },
  payPillText: { fontFamily: Fonts.bold, fontSize: sf(11), color: "#FFFFFF" },

  empty: { alignItems: "center", paddingVertical: sw(10), gap: sw(6) },
  emptyIcon: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(26),
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: INK },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(12.5), lineHeight: sf(18), color: MUTED, textAlign: "center", paddingHorizontal: sw(12) },
  emptyInline: { flexDirection: "row", alignItems: "center", gap: sw(10), paddingVertical: sw(6) },
  emptyInlineText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(13), color: MUTED },

  note: {
    flexDirection: "row",
    gap: sw(8),
    alignItems: "flex-start",
    marginTop: sw(12),
    padding: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
  },
  noteText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: MUTED },

  trust: { gap: sw(12), paddingHorizontal: sw(4), paddingTop: sw(4) },
  trustHead: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  trustTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: INK },
  trustBody: { fontFamily: Fonts.regular, fontSize: sf(11.5), lineHeight: sf(16), color: MUTED, marginTop: sw(1) },
});
