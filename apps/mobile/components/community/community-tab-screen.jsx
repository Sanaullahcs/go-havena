import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import ScreenHeader from "../layout/screen-header";
import { HeaderIconSlot } from "../layout/header-chrome";
import CommunityFeedPanel from "./community-feed-panel";
import CommunityListingsScreen from "../../app/screens/community-listings";
import DealsOffer from "../../app/(tabs)/marketplace/deals-offer";
import { HomeTheme as T } from "../../constants/home-theme";
import { MarketplaceTheme as MT } from "../../constants/marketplace-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

const TABS = [
  { id: "feed", label: "Feed", icon: "message-circle" },
  { id: "marketplace", label: "Marketplace", icon: "shopping-bag" },
  { id: "deals", label: "Deals", icon: "tag" },
];

const TAB_SUBTITLES = {
  feed: "Posts, updates & conversations",
  marketplace: "Neighbor listings & services",
  deals: "Local deals & offers",
};

/** Community bottom-tab root — Feed, Marketplace listings, and Deals in one screen. */
export default function CommunityTabScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("feed");

  const headerRight = useCallback(() => {
    if (activeTab !== "feed") return null;
    return (
      <Pressable
        onPress={() => router.push("/screens/community-feed/search")}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Search community feed"
      >
        <HeaderIconSlot>
          <Feather name="search" size={18} color={T.navy} />
        </HeaderIconSlot>
      </Pressable>
    );
  }, [activeTab, router]);

  const subtitle = TAB_SUBTITLES[activeTab] ?? TAB_SUBTITLES.feed;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title="Community"
        subtitle={subtitle}
        showBack={false}
        iconOnly
        right={headerRight()}
      />

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <Feather
                  name={tab.icon}
                  size={sf(14)}
                  color={active ? T.white : T.gray}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

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
  tabButtonActive: {
    backgroundColor: T.teal,
    borderColor: T.teal,
  },
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
});
