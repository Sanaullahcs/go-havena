import TopBar from "../../components/ui/top-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
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
import { isHomeSectionEnabled } from "../../constants/resident-features";
import { sw } from "../../utils/responsive";

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
          ) : (
            <>
              <Notices items={carouselNotices} noticesLoaded={featureOn("notices") && noticesLoaded} />
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
});
