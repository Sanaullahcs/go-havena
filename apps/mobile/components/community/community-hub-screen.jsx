import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import ScreenHeader from "../layout/screen-header";
import { HeaderIconSlot } from "../layout/header-chrome";
import CommunitySegmentTabs from "./community-segment-tabs";
import CommunityFeedPanel from "./community-feed-panel";
import MarketplaceHubPanel from "./marketplace-hub-panel";
import { MarketplaceTheme as T } from "../../constants/marketplace-theme";
import { HomeTheme } from "../../constants/home-theme";
import { MarketplaceRoutes } from "../../constants/marketplace-routes";

function resolveHubTab(tabParam) {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  return value === "marketplace" ? "marketplace" : "feed";
}

export default function CommunityHubScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState(() => resolveHubTab(tabParam));

  useEffect(() => {
    setActiveTab(resolveHubTab(tabParam));
  }, [tabParam]);

  const headerSubtitle = useMemo(
    () =>
      activeTab === "feed"
        ? "Posts and conversations"
        : "Deals, shops & neighbor listings",
    [activeTab],
  );

  const headerRight = useCallback(() => {
    if (activeTab === "feed") {
      return (
        <Pressable
          onPress={() => router.push("/screens/community-feed/search")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Search community feed"
        >
          <HeaderIconSlot>
            <Feather name="search" size={18} color={HomeTheme.navy} />
          </HeaderIconSlot>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: MarketplaceRoutes.DEALS,
          })
        }
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Browse all deals"
      >
        <HeaderIconSlot>
          <Feather name="tag" size={18} color={HomeTheme.navy} />
        </HeaderIconSlot>
      </Pressable>
    );
  }, [activeTab, router]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title="Community"
        subtitle={headerSubtitle}
        iconOnly
        right={headerRight()}
      />

      <CommunitySegmentTabs value={activeTab} onChange={setActiveTab} />

      <View style={styles.panel}>
        {activeTab === "feed" ? <CommunityFeedPanel /> : <MarketplaceHubPanel />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.screenBg,
  },
  panel: {
    flex: 1,
  },
});
