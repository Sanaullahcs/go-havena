import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import UserAvatar from "../../../components/ui/user-avatar";
import CrispImage from "../../../components/ui/crisp-image";
import { NeighborhoodHelpSkeleton } from "../../../components/ui/skeleton-loader";
import { fetchFeed } from "../../../services/feed-api";
import { mediaImageSource } from "../../../utils/profile-display";
import { getFeedTagTheme } from "../../../constants/feed-theme";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { sw, sf, hp } from "../../../utils/responsive";

const HELP_THEME = getFeedTagTheme("Help");

function HelpCard({ post, onPress }) {
  const authorName = post.user?.display_name ?? post.user?.name ?? "Neighbor";
  const isPending = post.status === "pending";
  const statusLabel = isPending ? "Pending" : "Open";
  const statusStyle = isPending ? styles.statusPending : styles.statusOpen;
  const statusTextStyle = isPending ? styles.statusPendingText : styles.statusOpenText;

  return (
    <View style={styles.cardShell}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.authorBlock}>
              <UserAvatar source={post.user?.avatar} name={authorName} size={sw(40)} />
              <View style={styles.authorCopy}>
                <Text style={styles.authorName} numberOfLines={1}>
                  {authorName}
                </Text>
                <Text style={styles.authorMeta} numberOfLines={1}>
                  {post.user?.time ?? "Recently"}
                  {post.user?.location ? ` · ${post.user.location}` : ""}
                </Text>
              </View>
            </View>

            <View style={[styles.statusBadge, statusStyle]}>
              {isPending ? (
                <Feather name="clock" size={sf(10)} color="#B45309" />
              ) : null}
              <Text style={[styles.statusBadgeText, statusTextStyle]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={[styles.helpTag, { backgroundColor: HELP_THEME.bg, borderColor: HELP_THEME.border }]}>
            <Feather name="life-buoy" size={sf(11)} color={HELP_THEME.text} />
            <Text style={[styles.helpTagText, { color: HELP_THEME.text }]}>Help request</Text>
          </View>

          {post.content ? (
            <Text style={styles.cardContent} numberOfLines={4}>
              {post.content}
            </Text>
          ) : null}

          {post.image_url ? (
            <CrispImage
              source={mediaImageSource(post.image_url)}
              style={styles.cardImage}
              contentFit="cover"
            />
          ) : null}

          <View style={styles.cardFooter}>
            <View style={[styles.respondBtn, { backgroundColor: HELP_THEME.bg }]}>
              <Text style={[styles.respondBtnText, { color: HELP_THEME.text }]}>Respond</Text>
              <Feather name="arrow-right" size={sf(14)} color={HELP_THEME.text} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const footerPad = Math.max(insets.bottom, 12);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { posts: data } = await fetchFeed({ category: "help", perPage: 30 });
      setPosts(data ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(posts.length > 0);
    }, [load]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const openComposer = () =>
    router.push({ pathname: "/screens/create-post", params: { category: "help" } });

  const openPost = (post) =>
    router.push({
      pathname: "/screens/community-feed/comments",
      params: { postId: String(post.id) },
    });

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title="Neighborhood Help" subtitle="Ask neighbors or lend a hand" />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Recent requests</Text>
        {posts.length > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{posts.length}</Text>
          </View>
        ) : null}
      </View>

      <FlatList
        style={styles.list}
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <HelpCard post={item} onPress={() => openPost(item)} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          posts.length === 0 && styles.listContentEmpty,
          { paddingBottom: sw(12) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimary} />
        }
        ListEmptyComponent={
          loading ? (
            <NeighborhoodHelpSkeleton count={2} />
          ) : (
            <View style={styles.empty}>
              <LinearGradient colors={["#EFF6FF", "#FFFFFF"]} style={styles.emptyIcon}>
                <Feather name="inbox" size={sf(28)} color={Colors.brandPrimaryDeep} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>No help requests yet</Text>
              <Text style={styles.emptyText}>
                Be the first to ask. Use the button below to post a request.
              </Text>
            </View>
          )
        }
      />

      <View style={[styles.stickyFooter, { paddingBottom: footerPad }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={openComposer}
        >
          <LinearGradient
            colors={[Colors.brandPrimaryDeep, Colors.brandPrimary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Feather name="edit-3" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.ctaText}>Ask for help</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  list: { flex: 1, minHeight: 0 },
  listContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 0,
    gap: sw(10),
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(8),
    backgroundColor: "#F7F8FC",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#101828",
  },
  countBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: sw(8),
    paddingVertical: sw(2),
    borderRadius: 999,
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },

  cardShell: {
    borderRadius: sw(16),
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  card: {
    backgroundColor: "#FFFFFF",
  },
  cardPressed: { opacity: 0.97, transform: [{ scale: 0.995 }] },
  cardBody: {
    padding: sw(12),
    gap: sw(8),
    backgroundColor: "#FFFFFF",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(10),
  },
  authorBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    minWidth: 0,
  },
  authorCopy: {
    flex: 1,
    minWidth: 0,
    gap: sw(2),
  },
  authorName: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: "#0F172A",
  },
  authorMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#94A3B8",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    flexShrink: 0,
  },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusPendingText: {
    color: "#B45309",
  },
  statusOpen: {
    backgroundColor: "#F1F5F9",
  },
  statusOpenText: {
    color: "#64748B",
  },
  helpTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    borderWidth: 1,
  },
  helpTagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  cardContent: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(22),
    color: "#334155",
  },
  cardImage: {
    width: "100%",
    height: hp(20),
    borderRadius: sw(16),
    backgroundColor: "#EEF2F7",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: sw(12),
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  respondBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
  },
  respondBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
  },

  empty: {
    alignItems: "center",
    paddingTop: hp(4),
    paddingHorizontal: sw(24),
  },
  emptyIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(16),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#101828",
    marginBottom: sw(6),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: sf(19),
  },

  stickyFooter: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    backgroundColor: "#F7F8FC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.08)",
  },
  cta: {
    borderRadius: 999,
    overflow: "hidden",
  },
  ctaPressed: { opacity: 0.94 },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(14),
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});
