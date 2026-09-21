import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { getCurrentRole } from "../../../constants/role-session";
import {
  MarketplaceRoutes,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { fetchBusinesses, fetchMyBusiness } from "../../../services/businesses-api";
import { fetchManageDeals } from "../../../services/deals-api";
import { MarketplaceTheme as MT } from "../../../constants/marketplace-theme";

export default function ManageMarketplace() {
  const { t } = useTranslation();
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isAdmin = activeRole === "admin";

  const [bizCount, setBizCount] = useState(null);
  const [dealCount, setDealCount] = useState(null);
  const [myBusiness, setMyBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [bizRes, dealRes, mine] = await Promise.all([
        fetchBusinesses({ scope: "manage", perPage: 1 }),
        fetchManageDeals({ perPage: 1 }),
        fetchMyBusiness(),
      ]);
      setBizCount(bizRes.meta?.total ?? bizRes.businesses.length);
      setDealCount(dealRes.meta?.total ?? dealRes.deals.length);
      setMyBusiness(mine);
    } catch (err) {
      setLoadError(err?.message || t("marketplace.couldNotLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const overViewItems = [
    {
      id: 1,
      title: t("marketplace.businesses"),
      value: bizCount != null ? String(bizCount) : "—",
      subtitle: isAdmin ? t("marketplace.communityTotal") : t("marketplace.myBusiness"),
      gradient: ["rgba(239, 246, 255, 1)", "rgba(219, 234, 254, 1)"],
      source: require("../../../assets/images/over-business.png"),
      fontColor: "rgba(28, 57, 142, 1)",
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "businesses" },
    },
    {
      id: 2,
      title: t("marketplace.activeDeals"),
      value: dealCount != null ? String(dealCount) : "—",
      subtitle: isAdmin ? t("marketplace.communityTotal") : t("marketplace.myDeals"),
      gradient: ["rgba(255, 251, 235, 1)", "rgba(254, 243, 198, 1)"],
      source: require("../../../assets/images/over-deal.png"),
      fontColor: "rgba(123, 51, 6, 1)",
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "deals" },
    },
    {
      id: 3,
      title: t("marketplace.totalReviews"),
      value: "—",
      subtitle: t("marketplace.comingSoon"),
      gradient: ["rgba(240, 253, 244, 1)", "rgba(220, 252, 231, 1)"],
      source: require("../../../assets/images/over-review.png"),
      fontColor: "rgba(13, 84, 43, 1)",
    },
    {
      id: 4,
      title: t("marketplace.engagement"),
      value: "—",
      subtitle: t("marketplace.comingSoon"),
      gradient: ["rgba(250, 245, 255, 1)", "rgba(243, 232, 255, 1)"],
      source: require("../../../assets/images/over-engagment.png"),
      fontColor: "rgba(89, 22, 139, 1)",
    },
  ];

  const managementTools = [
    {
      id: 1,
      title: t("marketplace.allBusinesses"),
      subtitle: t("marketplace.viewAndManageBusinesses"),
      source: require("../../../assets/images/add-new-business.png"),
      route: MarketplaceRoutes.ALL_BUSINESSES,
    },
    {
      id: 2,
      title: t("marketplace.allDeals"),
      subtitle: t("marketplace.manageActiveInactiveDeals"),
      source: require("../../../assets/images/add-new-deal.png"),
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "deals" },
    },
    {
      id: 3,
      title: t("marketplace.reviewModeration"),
      subtitle: t("marketplace.monitorAndModerateReviews"),
      source: require("../../../assets/images/add-moderation.png"),
      route: MarketplaceRoutes.REVIEWS,
    },
  ];

  const goTo = (pathname, params = {}) => {
    router.push({
      pathname,
      params: withMarketplaceRole(activeRole, params),
    });
  };

  const goToAddOrEditBusiness = () => {
    if (myBusiness) {
      goTo(MarketplaceRoutes.ADD_BUSINESS, { editId: String(myBusiness.id) });
    } else {
      goTo(MarketplaceRoutes.ADD_BUSINESS);
    }
  };

  const handleCreateDeal = () => {
    if (!myBusiness) {
      Alert.alert(
        t("marketplace.addBusinessFirst"),
        t("marketplace.needBusinessForDeal"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("marketplace.addBusiness"), onPress: goToAddOrEditBusiness },
        ],
      );
      return;
    }
    goTo(MarketplaceRoutes.CREATE_DEAL);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("marketplace.manageMarketplace")}
        subtitle={isAdmin ? t("marketplace.adminControlsSubtitle") : t("marketplace.yourToolsSubtitle")}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            load(true);
          }} />
        }
      >
        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color="#0A2A43" />
            <Text style={styles.stateText}>{t("marketplace.loadingDashboard")}</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>{t("marketplace.dashboardUnavailable")}</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryBtnText}>{t("marketplace.tryAgain")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading ? (
          <View>
            <View style={styles.section}>
              <Text style={styles.listTitle}>{t("marketplace.overview")}</Text>
              <View style={styles.overviewGrid}>
                {overViewItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.overViewCard}
                    disabled={!item.route}
                    activeOpacity={item.route ? 0.85 : 1}
                    onPress={() => {
                      if (!item.route) return;
                      goTo(item.route, item.params);
                    }}
                  >
                    <View
                      style={[
                        styles.overViewGradient,
                        {
                          backgroundColor: item.gradient[0],
                          borderColor: item.gradient[1],
                        },
                      ]}
                    >
                      <View style={styles.overViewHeader}>
                        <Image source={item.source} style={styles.overViewIcon} />
                        <Text style={[styles.overViewTitle, { color: item.fontColor }]}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={[styles.overViewValue, { color: item.fontColor }]}>
                        {item.value}
                      </Text>
                      <Text style={[styles.overViewSubtitle, { color: item.fontColor }]}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.listTitle}>{t("marketplace.quickActions")}</Text>
              <View style={styles.quickActions}>
                <TouchableOpacity activeOpacity={0.9} onPress={goToAddOrEditBusiness}>
                  <View style={styles.businessBtnPrimary}>
                    <View style={styles.quickRow}>
                      <Image
                        source={require("../../../assets/images/add-business.png")}
                        style={styles.quickIcon}
                      />
                      <View style={styles.quickCopy}>
                        <Text style={styles.quickTitle}>
                          {myBusiness ? t("marketplace.editMyBusiness") : t("marketplace.addNewBusiness")}
                        </Text>
                        <Text style={styles.quickSubtitlePrimary}>
                          {myBusiness ? t("marketplace.updateRegisteredBusiness") : t("marketplace.registerLocalBusiness")}
                        </Text>
                      </View>
                      <Image
                        source={require("../../../assets/images/white-arrow-right.png")}
                        style={styles.arrowIcon}
                      />
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.9} onPress={handleCreateDeal}>
                  <View style={styles.businessBtnSurface}>
                    <View style={styles.quickRow}>
                      <Image
                        source={require("../../../assets/images/create-deal.png")}
                        style={styles.quickIcon}
                      />
                      <View style={styles.quickCopy}>
                        <Text style={styles.quickTitleDark}>{t("marketplace.createNewDeal")}</Text>
                        <Text style={styles.quickSubtitleDark}>{t("marketplace.addPromotionalOffer")}</Text>
                      </View>
                      <Image
                        source={require("../../../assets/images/black-arrow-right.png")}
                        style={styles.arrowIcon}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.listTitle}>{t("marketplace.managementTools")}</Text>
              <View style={styles.toolsList}>
                {managementTools.map((tool) => (
                  <TouchableOpacity
                    key={tool.id}
                    activeOpacity={0.85}
                    disabled={!tool.route}
                    onPress={() => {
                      if (!tool.route) return;
                      goTo(tool.route, tool.params);
                    }}
                  >
                    <View style={styles.managmentBtn}>
                      <View style={styles.toolRow}>
                        <Image source={tool.source} style={styles.quickIcon} />
                        <View style={styles.quickCopy}>
                          <Text style={styles.managementTitle}>{tool.title}</Text>
                          <Text style={styles.managementSubtitle}>{tool.subtitle}</Text>
                        </View>
                      </View>
                      <Image
                        source={require("../../../assets/images/next-icon.png")}
                        style={styles.arrowIcon}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  listTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#000000",
  },
  overviewGrid: {
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  overViewCard: {
    borderRadius: 14,
    marginBottom: 12,
    width: "48%",
    overflow: "hidden",
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  overViewGradient: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  overViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overViewIcon: {
    width: 20,
    height: 20,
  },
  overViewTitle: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
  },
  overViewValue: {
    marginTop: 8,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.stat,
    lineHeight: 32,
    fontWeight: "700",
  },
  overViewSubtitle: {
    marginTop: 4,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    fontWeight: "700",
  },
  quickActions: {
    paddingTop: 12,
    gap: 12,
  },
  businessBtnPrimary: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: MT.navy,
    borderWidth: 1,
    borderColor: MT.accentBorder,
    overflow: "hidden",
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  businessBtnSurface: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: MT.surface,
    borderWidth: 1,
    borderColor: MT.border,
    overflow: "hidden",
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickIcon: {
    width: 40,
    height: 40,
  },
  quickCopy: {
    flex: 1,
  },
  arrowIcon: {
    width: 20,
    height: 20,
  },
  quickTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MT.surface,
    fontWeight: "700",
  },
  quickTitleDark: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: MT.navy,
    fontWeight: "700",
  },
  quickSubtitlePrimary: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(255,255,255,0.72)",
  },
  quickSubtitleDark: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: MT.textMuted,
  },
  toolsList: {
    paddingTop: 12,
    gap: 12,
  },
  managmentBtn: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  managementTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#000000",
    fontWeight: "700",
  },
  managementSubtitle: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6A7282",
    fontWeight: "500",
  },
  stateWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  stateText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#6B7280",
  },
  errorCard: {
    marginHorizontal: 24,
    marginTop: 16,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#B91C1C",
    fontWeight: "700",
  },
  errorText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#7F1D1D",
    lineHeight: MarketplaceType.bodyMdLine,
  },
  retryBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: "#0A2A43",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
