import TopBar from "../../components/ui/top-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import ScreenShell from "../../components/layout/screen-shell";
import React from "react";
import { useSideMenu } from "../../hooks/use-side-menu";
import Notices from "../../components/new-home/Notices";
import HappeningSoon from "../../components/new-home/HappeningSoon";
import Communities from "../../components/new-home/communities";
import DealsCornor from "../../components/new-home/deals-cornor";
import WellnessNew from "../../components/new-home/Wellness";
import PropertyNew from "../../components/new-home/Property";
import { homeStyles } from "../../constants/home-styles";
import { useHomeScreen } from "../../hooks/use-home-screen";
import { HomeScreenSkeleton } from "../../components/ui/skeleton-loader";
import GuestFeatureErrorState from "../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";

export default function Home() {
  const menu = useSideMenu();
  const {
    carouselNotices,
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
          contentContainerStyle={homeStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0052DF"
              colors={["#0052DF"]}
            />
          }
        >
          {loading ? (
            <HomeScreenSkeleton />
          ) : accessBlocked ? (
            <GuestFeatureErrorState
              error={restrictionError}
              fallbackFeature="feed"
              defaultTitle="Could not load home"
              onRetry={onRefresh}
            />
          ) : (
            <>
              <Notices items={carouselNotices} />
              <HappeningSoon items={upcomingEvents} />
              <Communities posts={posts} onPostsChange={setPosts} />
              <DealsCornor items={deals} />
              <WellnessNew items={wellnessCategories} />
              <PropertyNew items={amenities} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
});
