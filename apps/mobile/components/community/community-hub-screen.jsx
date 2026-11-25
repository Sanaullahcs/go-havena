import React, { useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import ScreenHeader from "../layout/screen-header";
import { HeaderIconSlot } from "../layout/header-chrome";
import MarketplaceHubPanel from "./marketplace-hub-panel";
import { MarketplaceTheme as T } from "../../constants/marketplace-theme";
import { HomeTheme } from "../../constants/home-theme";
import { MarketplaceRoutes } from "../../constants/marketplace-routes";

/** Marketplace tab root — deals, shops, and neighbor listings. */
export default function CommunityHubScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={() => router.push(MarketplaceRoutes.DEALS)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t("deals.browseAll")}
      >
        <HeaderIconSlot>
          <Feather name="tag" size={18} color={HomeTheme.navy} />
        </HeaderIconSlot>
      </Pressable>
    ),
    [router, t],
  );

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("marketplace.title")}
        subtitle={t("marketplace.subtitle")}
        showBack
        iconOnly
        right={headerRight()}
      />

      <View style={styles.panel}>
        <MarketplaceHubPanel />
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
