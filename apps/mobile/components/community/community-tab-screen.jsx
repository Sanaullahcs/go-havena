import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { useTranslation } from "react-i18next";
import ScreenHeader from "../layout/screen-header";
import { HeaderIconSlot } from "../layout/header-chrome";
import CommunityFeedPanel from "./community-feed-panel";
import CommunityListingsScreen from "../../app/screens/community-listings";
import DealsOffer from "../../app/(tabs)/marketplace/deals-offer";
import { HomeTheme as T } from "../../constants/home-theme";
import { MarketplaceTheme as MT } from "../../constants/marketplace-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { useSessionUser } from "../../hooks/use-session-user";
import { isResidentFeatureEnabled } from "../../constants/resident-features";

const TABS = [
  { id: "feed", labelKey: "community.feed", icon: "message-circle", color: T.navy },
  { id: "marketplace", labelKey: "community.marketplace", icon: "shopping-bag", color: T.deepTeal },
  { id: "deals", labelKey: "community.deals", icon: "tag", color: "#D97706" },
];

const TAB_SUBTITLE_KEYS = {
  feed: "community.feedSub",
  marketplace: "community.marketplaceSub",
  deals: "community.dealsSub",
};

/** Community bottom-tab root — Feed, Marketplace listings, and Deals in one screen. */
export default function CommunityTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const sessionUser = useSessionUser();
  const tabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === "feed") return isResidentFeatureEnabled(sessionUser, "feed");
      return isResidentFeatureEnabled(sessionUser, "marketplace");
    });
  }, [sessionUser]);
  const [activeTab, setActiveTab] = useState("feed");

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [activeTab, tabs]);

  const headerRight = useCallback(() => {
    if (activeTab !== "feed") return null;
    return (
      <Pressable
        onPress={() => router.push("/screens/community-feed/search")}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t("common.search")}
      >
        <HeaderIconSlot>
          <Feather name="search" size={18} color={T.navy} />
        </HeaderIconSlot>
      </Pressable>
    );
  }, [activeTab, router, t]);

  const subtitle = t(TAB_SUBTITLE_KEYS[activeTab] ?? TAB_SUBTITLE_KEYS.feed);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("community.title")}
        subtitle={subtitle}
        showBack={false}
        iconOnly
        right={headerRight()}
      />

      {tabs.length > 0 ? (
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const label = t(tab.labelKey);
              return (
                <Pressable
                  key={tab.id}
                  style={[
                    styles.tabButton,
                    active && { backgroundColor: tab.color, borderColor: tab.color },
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Feather
                    name={tab.icon}
                    size={sf(14)}
                    color={active ? T.white : T.gray}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{t("community.unavailable", { defaultValue: "Community features are turned off" })}</Text>
          <Text style={styles.emptyBody}>
            {t("community.unavailableHint", { defaultValue: "Feed and marketplace are not available for this community." })}
          </Text>
        </View>
      )}

      <View style={styles.panelHost}>
        {activeTab === "feed" ? (
          <View style={styles.tabPane}>
            <CommunityFeedPanel />
          </View>
        ) : null}

        {activeTab === "marketplace" ? (
          <View style={styles.tabPane}>
            <CommunityListingsScreen embedded />
          </View>
        ) : null}

        {activeTab === "deals" ? (
          <View style={styles.tabPane}>
            <DealsOffer embedded />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  tabBarWrap: {
    paddingHorizontal: sw(18),
    paddingTop: sw(12),
    paddingBottom: sw(12),
    backgroundColor: MT.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: MT.border,
  },
  tabBar: {
    flexDirection: "row",
    gap: sw(8),
    alignItems: "center",
  },
  tabButton: {
    flex: 1,
    minHeight: sw(40),
    borderRadius: sw(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    backgroundColor: T.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MT.border,
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  tabButtonActive: {},
  tabLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: T.white,
  },
  panelHost: {
    flex: 1,
    minHeight: 0,
    backgroundColor: T.canvas,
  },
  tabPane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: T.canvas,
  },
  emptyWrap: {
    paddingHorizontal: sw(24),
    paddingVertical: sw(28),
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: T.navy,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.gray,
    textAlign: "center",
  },
});
