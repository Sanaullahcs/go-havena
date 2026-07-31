import React, { useState, useCallback } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { getCurrentRole } from "../../../constants/role-session";
import {
  MarketplaceRoutes,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { fetchBusinesses, fetchMyBusiness } from "../../../services/businesses-api";
import { fetchManageDeals } from "../../../services/deals-api";

export default function ManageMarketplace() {
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
      setLoadError(err?.message || "Could not load marketplace dashboard.");
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
      title: "Businesses",
      value: bizCount != null ? String(bizCount) : "—",
      subtitle: isAdmin ? "Community total" : "My business",
      gradient: ["rgba(239, 246, 255, 1)", "rgba(219, 234, 254, 1)"],
      source: require("../../../assets/images/over-business.png"),
      fontColor: "rgba(28, 57, 142, 1)",
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "businesses" },
    },
    {
      id: 2,
      title: "Active Deals",
      value: dealCount != null ? String(dealCount) : "—",
      subtitle: isAdmin ? "Community total" : "My deals",
      gradient: ["rgba(255, 251, 235, 1)", "rgba(254, 243, 198, 1)"],
      source: require("../../../assets/images/over-deal.png"),
      fontColor: "rgba(123, 51, 6, 1)",
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "deals" },
    },
    {
      id: 3,
      title: "Total Reviews",
      value: "—",
      subtitle: "Coming soon",
      gradient: ["rgba(240, 253, 244, 1)", "rgba(220, 252, 231, 1)"],
      source: require("../../../assets/images/over-review.png"),
      fontColor: "rgba(13, 84, 43, 1)",
    },
    {
      id: 4,
      title: "Engagement",
      value: "—",
      subtitle: "Coming soon",
      gradient: ["rgba(250, 245, 255, 1)", "rgba(243, 232, 255, 1)"],
      source: require("../../../assets/images/over-engagment.png"),
      fontColor: "rgba(89, 22, 139, 1)",
    },
  ];

  const managementTools = [
    {
      id: 1,
      title: "All Businesses",
      subtitle: "View and manage businesses",
      source: require("../../../assets/images/add-new-business.png"),
      route: MarketplaceRoutes.ALL_BUSINESSES,
    },
    {
      id: 2,
      title: "All Deals",
      subtitle: "Manage active and inactive deals",
      source: require("../../../assets/images/add-new-deal.png"),
      route: MarketplaceRoutes.ALL_BUSINESSES,
      params: { tab: "deals" },
    },
    {
      id: 3,
      title: "Review Moderation",
      subtitle: "Monitor and moderate reviews",
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
        "Add a Business First",
        "You need to register your business before you can create a deal.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add Business", onPress: goToAddOrEditBusiness },
        ],
      );
      return;
    }
    goTo(MarketplaceRoutes.CREATE_DEAL);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Manage Marketplace"
        subtitle={isAdmin ? "Admin controls and analytics" : "Your marketplace tools"}
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
            <ActivityIndicator size="large" color="#0052DF" />
            <Text style={styles.stateText}>Loading dashboard...</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Dashboard unavailable</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading ? (
          <View>
            <View style={styles.section}>
              <Text style={styles.listTitle}>Overview</Text>
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
                    <LinearGradient
                      colors={item.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.overViewGradient}
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
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.listTitle}>Quick Actions</Text>
              <View style={styles.quickActions}>
                <TouchableOpacity activeOpacity={0.9} onPress={goToAddOrEditBusiness}>
                  <LinearGradient
                    colors={["rgba(0, 82, 223, 1)", "rgba(1, 121, 255, 1)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.businessBtn}
                  >
                    <View style={styles.quickRow}>
                      <Image
                        source={require("../../../assets/images/add-business.png")}
                        style={styles.quickIcon}
                      />
                      <View style={styles.quickCopy}>
                        <Text style={styles.quickTitle}>
                          {myBusiness ? "Edit My Business" : "Add New Business"}
                        </Text>
                        <Text style={styles.quickSubtitle}>
                          {myBusiness ? "Update your registered business" : "Register a local business"}
                        </Text>
                      </View>
                      <Image
                        source={require("../../../assets/images/white-arrow-right.png")}
                        style={styles.arrowIcon}
                      />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.9} onPress={handleCreateDeal}>
                  <LinearGradient
                    colors={["rgba(92, 225, 230, 1)", "rgba(192, 255, 114, 1)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.businessBtn}
                  >
                    <View style={styles.quickRow}>
                      <Image
                        source={require("../../../assets/images/create-deal.png")}
                        style={styles.quickIcon}
                      />
                      <View style={styles.quickCopy}>
                        <Text style={[styles.quickTitle, styles.quickTitleDark]}>
                          Create New Deal
                        </Text>
                        <Text style={[styles.quickSubtitle, styles.quickTitleDark]}>
                          Add promotional offer
                        </Text>
                      </View>
                      <Image
                        source={require("../../../assets/images/black-arrow-right.png")}
                        style={styles.arrowIcon}
                      />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.listTitle}>Management Tools</Text>
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
  },
  overViewGradient: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
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
  businessBtn: {
    padding: 16,
    borderRadius: 14,
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
    color: "#FFFFFF",
    fontWeight: "700",
  },
  quickTitleDark: {
    color: "rgba(54, 65, 83, 1)",
  },
  quickSubtitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#FFFFFF",
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
    backgroundColor: "#0052DF",
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
