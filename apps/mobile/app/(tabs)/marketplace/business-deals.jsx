import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import CrispImage from "../../../components/ui/crisp-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { Fonts } from "../../../constants/font";
import { getCurrentRole } from "../../../constants/role-session";
import { fetchBusinessDeals } from "../../../services/deals-api";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import {
  MarketplaceRoutes,
  dealDetailsParams,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { localizedField } from "../../../i18n";

const DEAL_PLACEHOLDER = require("../../../assets/images/food-bowl.png");

function BusinessDealCard({ deal, onPress, t }) {
  const validText = deal.validUntil ? `${t("marketplace.validUntil")} ${deal.validUntil}` : "";

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.dealCard}>
      <View style={styles.dealImageWrap}>
        <CrispImage
          source={deal.imageUrl || DEAL_PLACEHOLDER}
          style={styles.dealImage}
          contentFit="cover"
          transition={200}
        />
      </View>

      <View style={styles.dealBody}>
        <View style={styles.dealTitleRow}>
          <Text style={styles.dealTitle} numberOfLines={2}>
            {localizedField(deal, "title") || deal.title}
          </Text>
          {(localizedField(deal, "offerTag") || deal.offerTag) ? (
            <View style={styles.offerPill}>
              <Text style={styles.offerPillText} numberOfLines={1}>
                {localizedField(deal, "offerTag") || deal.offerTag}
              </Text>
            </View>
          ) : null}
        </View>

        {(localizedField(deal, "description") || deal.description) ? (
          <Text style={styles.dealDescription} numberOfLines={2}>
            {localizedField(deal, "description") || deal.description}
          </Text>
        ) : null}

        {validText ? (
          <View style={styles.dealValidRow}>
            <Ionicons name="time-outline" size={12} color="#64748B" />
            <Text style={styles.dealValidText} numberOfLines={1}>
              {validText}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function BusinessDealsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { role, businessId, businessName = "Business" } = useLocalSearchParams();
  const activeRole = role === "admin" || role === "resident" ? role : getCurrentRole();
  const parsedBusinessId = businessId ? Number(businessId) : null;

  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!parsedBusinessId) {
      setError(t("marketplace.businessNotFound"));
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("marketplace");
      if (blocked) {
        setDeals([]);
        setError(blocked);
        return;
      }

      const res = await fetchBusinessDeals(parsedBusinessId, { perPage: 50 });
      setDeals(res.deals);
    } catch (err) {
      const restricted = await resolveLoadRestriction("marketplace", err);
      if (restricted) {
        setDeals([]);
        setError(restricted);
        return;
      }
      setError(err);
      setDeals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [parsedBusinessId]);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("marketplace.businessDeals")}
        subtitle={String(businessName)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            load(true);
          }} />
        }
      >
        {!accessBlocked ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="pricetags-outline" size={22} color="#14B8A6" />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{businessName}</Text>
            <Text style={styles.summaryText}>
              {loading
                ? t("marketplace.loadingActiveOffers")
                : t("marketplace.activeDealsAvailable", { count: deals.length })}
            </Text>
          </View>
        </View>
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1B4F8A" />
          </View>
        ) : error ? (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature="marketplace"
            defaultTitle={t("marketplace.couldNotLoadDeals")}
            onRetry={() => load()}
            compact
          />
        ) : deals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="ticket-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>{t("marketplace.noActiveDeals")}</Text>
            <Text style={styles.emptyText}>
              {t("marketplace.noActiveDealsMsg")}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {deals.map((deal) => (
              <BusinessDealCard
                key={deal.id}
                deal={deal}
                t={t}
                onPress={() =>
                  router.push({
                    pathname: MarketplaceRoutes.DEAL_DETAILS,
                    params: dealDetailsParams(deal, activeRole),
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: 20, paddingBottom: 32 },
  summaryCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryCopy: { flex: 1 },
  summaryTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#1E3A8A",
    fontWeight: "700",
  },
  summaryText: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#475569",
  },
  centered: { paddingVertical: 48, alignItems: "center" },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 28,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#111827",
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: MarketplaceType.bodyMdLine,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1B4F8A",
  },
  retryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  list: { gap: 12 },
  dealCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  dealImageWrap: {
    height: 140,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  dealImage: {
    width: "100%",
    height: "100%",
  },
  dealBody: {
    padding: 16,
    gap: 8,
  },
  dealTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  dealTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#111827",
    fontWeight: "700",
  },
  offerPill: {
    maxWidth: 96,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  offerPillText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    color: "#1B4F8A",
  },
  dealDescription: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#6B7280",
    lineHeight: 18,
  },
  dealValidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  dealValidText: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#6B7280",
  },
});
