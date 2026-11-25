import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import Tap from "../../../components/ui/tap";
import { KuickpayColors, KuickpayMark } from "../../../components/payments/kuickpay-brand";
import { Fonts } from "../../../constants/font";
import { PAYMENT_RESULT_ROUTE } from "../../../hooks/use-kuickpay-pay";
import { fetchPayments } from "../../../services/payments-api";
import { formatMoney } from "../../../utils/money";
import { sf, sw } from "../../../utils/responsive";

const FILTERS = ["all", "succeeded", "pending", "unsuccessful"];

const TONE = {
  success: { color: "#047857", bg: "#ECFDF5", icon: "check" },
  pending: { color: "#B45309", bg: "#FFFBEB", icon: "clock" },
  danger: { color: "#B91C1C", bg: "#FEF2F2", icon: "x" },
  muted: { color: "#475569", bg: "#F1F5F9", icon: "slash" },
};

const TYPE_ICON = {
  unit_service_bill: { name: "home-city-outline", color: "#1B4F8A", bg: "#E8F0F7" },
  amenity_resident_bill: { name: "calendar-star", color: "#0F766E", bg: "#E6F4F1" },
  utility_bill: { name: "lightning-bolt", color: "#D97706", bg: "#FFF7E6" },
};
const DEFAULT_TYPE_ICON = { name: "receipt", color: "#475569", bg: "#F1F5F9" };

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function PaymentsHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ page = 1, silent = false, nextFilter = filter } = {}) => {
    if (!silent && page === 1) setLoading(true);
    try {
      const result = await fetchPayments({ status: nextFilter, page });
      setItems((current) => (page === 1 ? result.items : [...current, ...result.items]));
      setMeta(result.meta);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { void load({ silent: true }); }, [load]));

  function choose(next) {
    if (next === filter) return;
    setFilter(next);
    setItems([]);
    void load({ nextFilter: next });
  }

  function loadMore() {
    if (loadingMore || !meta.last_page || meta.current_page >= meta.last_page) return;
    setLoadingMore(true);
    void load({ page: (meta.current_page ?? 1) + 1, silent: true });
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.summary}>
        <KuickpayMark size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>{t("payments.paidThisMonth")}</Text>
          <Text style={styles.summaryValue}>{formatMoney(meta.paid_this_month ?? 0, "PKR")}</Text>
        </View>
      </View>
      <View style={styles.filters}>
        {FILTERS.map((key) => {
          const active = key === filter;
          return (
            <Pressable key={key} onPress={() => choose(key)} style={[styles.filter, active && styles.filterActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{t(`payments.filters.${key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("payments.historyTitle")} subtitle={t("payments.historySub")} />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={KuickpayColors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load({ silent: true }); }} tintColor={KuickpayColors.brand} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={error ? "wifi-off" : "credit-card"} size={sf(26)} color={KuickpayColors.muted} />
              <Text style={styles.emptyTitle}>{error ? t("payments.couldNotLoad") : t("payments.historyEmptyTitle")}</Text>
              <Text style={styles.emptyBody}>{error ? "" : t("payments.historyEmptyBody")}</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: sw(16) }} color={KuickpayColors.brand} /> : null}
          renderItem={({ item }) => {
            const tone = TONE[item.tone] ?? TONE.muted;
            const type = TYPE_ICON[item.payable_type] ?? DEFAULT_TYPE_ICON;
            return (
              <Tap
                onPress={() => router.push({ pathname: PAYMENT_RESULT_ROUTE, params: { id: item.id } })}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={[styles.iconWell, { backgroundColor: type.bg }]}>
                  <MaterialCommunityIcons name={type.name} size={sf(20)} color={type.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[formatWhen(item.confirmed_at || item.created_at), item.method_label].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: sw(4) }}>
                  <Text style={styles.rowAmount}>{item.formatted_amount}</Text>
                  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                    <Feather name={tone.icon} size={sf(10)} color={tone.color} />
                    <Text style={[styles.pillText, { color: tone.color }]}>{item.status_label}</Text>
                  </View>
                </View>
              </Tap>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FB" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: sw(16), paddingBottom: sw(32), gap: sw(10) },
  headerBlock: { gap: sw(14), marginBottom: sw(4) },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    padding: sw(16),
  },
  summaryLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: KuickpayColors.muted },
  summaryValue: { fontFamily: Fonts.bold, fontSize: sf(22), color: KuickpayColors.ink },
  filters: { flexDirection: "row", gap: sw(8), flexWrap: "wrap" },
  filter: {
    paddingHorizontal: sw(14),
    height: sw(34),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  filterActive: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  filterText: { fontFamily: Fonts.medium, fontSize: sf(12), color: KuickpayColors.muted },
  filterTextActive: { color: "#FFFFFF", fontFamily: Fonts.semiBold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    padding: sw(14),
  },
  iconWell: { width: sw(40), height: sw(40), borderRadius: sw(12), backgroundColor: "#E8F0F7", alignItems: "center", justifyContent: "center" },
  rowTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: KuickpayColors.ink },
  rowMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, marginTop: sw(2) },
  rowAmount: { fontFamily: Fonts.bold, fontSize: sf(14), color: KuickpayColors.ink },
  pill: { flexDirection: "row", alignItems: "center", gap: sw(4), paddingHorizontal: sw(8), paddingVertical: sw(3), borderRadius: 999 },
  pillText: { fontFamily: Fonts.semiBold, fontSize: sf(10) },
  empty: { alignItems: "center", gap: sw(8), paddingVertical: sw(40) },
  emptyTitle: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: KuickpayColors.ink },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(13), color: KuickpayColors.muted, textAlign: "center", paddingHorizontal: sw(20) },
});
