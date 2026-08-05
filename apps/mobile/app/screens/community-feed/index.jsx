import React from "react";
import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import CommunityFeedPanel from "../../../components/community/community-feed-panel";
import { HomeTheme as T } from "../../../constants/home-theme";

export default function CommunityFeedScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.canvas }} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Community Feed"
        right={
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
        }
      />
      <CommunityFeedPanel />
    </SafeAreaView>
  );
}
