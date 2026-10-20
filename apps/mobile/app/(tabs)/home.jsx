import TopBar from "../../components/ui/top-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import ScreenShell from "../../components/layout/screen-shell";
import React from "react";
import { useTranslation } from "react-i18next";
import { useSideMenu } from "../../hooks/use-side-menu";
import Notices from "../../components/new-home/Notices";
import HappeningSoon from "../../components/new-home/HappeningSoon";
import Communities from "../../components/new-home/communities";
import DealsCornor from "../../components/new-home/deals-cornor";
import Wellness from "../../components/new-home/Wellness";
import PropertyNew from "../../components/new-home/Property";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { useHomeScreen } from "../../hooks/use-home-screen";
import { HomeScreenSkeleton } from "../../components/ui/skeleton-loader";
import GuestFeatureErrorState from "../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";
import { useSessionUser } from "../../hooks/use-session-user";
import { hasAnyEnabledResidentFeature, isHomeSectionEnabled } from "../../constants/resident-features";
import { isCommunityAdminRole } from "../../services/community-access";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export default function Home() {
  const { t } = useTranslation();
  const menu = useSideMenu();
  const sessionUser = useSessionUser();
  const featureOn = (key) => isHomeSectionEnabled(sessionUser, key);
  const {
    carouselNotices,
    noticesLoaded,
    upcomingEvents,
    posts,
    setPosts,
    deals,
    wellnessCategories,
    amenities,
    loading,
    refreshing,
    restrictionError,
    onRefresh,
  } = useHomeScreen();

  const accessBlocked = Boolean(
    restrictionError && isFeatureAccessBlockedError(restrictionError),
  );
  const showNoFeatures =
    !loading &&
    !accessBlocked &&
    isCommunityAdminRole(sessionUser) &&
    !hasAnyEnabledResidentFeature(sessionUser);

  return (
    <ScreenShell menu={menu}>
      <SafeAreaView style={homeStyles.screen} edges={["left", "right"]}>
        <TopBar onMenuPress={menu.openMenu} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            homeStyles.scrollContent,
            styles.scrollContent,
            { paddingBottom: sw(24) },
            showNoFeatures && styles.emptyScroll,
          ]}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={T.teal}
              colors={[T.teal]}
            />
          }
        >
          {loading ? (
            <HomeScreenSkeleton />
          ) : accessBlocked ? (
            <GuestFeatureErrorState
              error={restrictionError}
              fallbackFeature="feed"
              defaultTitle={t("home.couldNotLoad")}
              onRetry={onRefresh}
            />
          ) : showNoFeatures ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name="grid" size={sf(18)} color={T.teal} />
              </View>
              <Text style={styles.emptyMessage}>{t("home.noFeatures")}</Text>
            </View>
          ) : (
            <>
              <Notices items={carouselNotices} noticesLoaded={noticesLoaded} />
              {featureOn("events") ? <HappeningSoon items={upcomingEvents} /> : null}
              {featureOn("feed") ? <Communities posts={posts} onPostsChange={setPosts} /> : null}
              {featureOn("marketplace") ? <DealsCornor items={deals} /> : null}
              {featureOn("wellness") ? <Wellness items={wellnessCategories} /> : null}
              {featureOn("amenities") ? <PropertyNew items={amenities} /> : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, alignSelf: "stretch", overflow: "hidden" },
  scrollContent: { width: "100%", alignItems: "stretch" },
  emptyScroll: { flexGrow: 1, justifyContent: "center" },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: sw(32),
  },
  emptyIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  emptyMessage: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(22),
    color: T.navy,
    textAlign: "center",
  },
});
