import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  Share,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import UserAvatar from "../../../components/ui/user-avatar";
import { CommunityFeedSkeleton } from "../../../components/ui/skeleton-loader";
import FeedPostCard from "../../../components/feed/feed-post-card";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import {
  fetchFeed,
  likePost,
  applyLikeToPost,
  FEED_TOPICS,
} from "../../../services/feed-api";
import { getUser } from "../../../services/auth-session";
import { useApiAction } from "../../../hooks/use-api-action";
import { getFeedEmptyMessage } from "../../../hooks/use-community-feed";
import { getFeedTagTheme } from "../../../constants/feed-theme";
import { openNeighborProfile } from "../../../services/profile-api";
import { useNow } from "../../../hooks/use-now";
import { sw, sf, hp } from "../../../utils/responsive";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";

export default function CommunityFeedScreen() {
  const router = useRouter();
  const now = useNow(30000);
  const [activeTopic, setActiveTopic] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [emptyReason, setEmptyReason] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const { showFailure } = useApiAction();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("feed");
      if (blocked) {
        setPosts([]);
        setEmptyReason(null);
        setError(blocked);
        return;
      }

      const result = await fetchFeed({ perPage: 20 });
      setPosts(result.posts ?? []);
      setEmptyReason(result.emptyReason ?? null);
    } catch (err) {
      const restricted = await resolveLoadRestriction("feed", err);
      if (restricted) {
        setPosts([]);
        setEmptyReason(null);
        setError(restricted);
        return;
      }
      setError(err);
      if (!silent) setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    getUser().then(setCurrentUser);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const handleLike = useCallback(
    async (postId) => {
      let previous = null;
      setPosts((prev) => {
        previous = prev;
        return prev.map((p) =>
          p.id === postId
            ? applyLikeToPost(p, {
                liked: !p.liked_by_me,
                likes_count: (p.likes_count ?? 0) + (p.liked_by_me ? -1 : 1),
              })
            : p,
        );
      });
      try {
        const result = await likePost(postId);
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? applyLikeToPost(p, result) : p)),
        );
      } catch (err) {
        if (previous) setPosts(previous);
        await showFailure("Could not update like", err);
      }
    },
    [showFailure],
  );

  const handleShare = useCallback(async (post) => {
    try {
      const text = post.content || post.body || "";
      const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
      await Share.share({
        message: preview || "Check out this post on Havena!",
      });
    } catch (_) {}
  }, []);

  const filtered = useMemo(() => {
    if (!activeTopic) return posts;
    return posts.filter((post) => post.tag === activeTopic);
  }, [posts, activeTopic]);

  const displayName =
    currentUser?.profile?.display_name ?? currentUser?.name ?? "You";

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Community Feed"
        right={
          accessBlocked ? null : (
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
          )
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.teal}
            colors={[T.teal]}
          />
        }
      >
        {!accessBlocked ? (
          <>
            {/* Composer */}
            <TouchableOpacity
              style={styles.composerCard}
              activeOpacity={0.88}
              onPress={() => router.push("/screens/create-post")}
            >
              <UserAvatar
                source={currentUser?.profile?.avatar_url ?? currentUser?.avatar_url}
                name={displayName}
                size={sw(38)}
              />
              <View style={styles.composerInput}>
                <Text style={styles.composerPlaceholder}>What's on your mind?</Text>
              </View>
              <View style={styles.composerBtn}>
                <Feather name="edit-3" size={sf(16)} color={T.white} />
              </View>
            </TouchableOpacity>

            {/* Topic chips — text only, no icons */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              style={styles.chipsScroll}
            >
              <Pressable
                style={[styles.chip, !activeTopic && styles.chipActive]}
                onPress={() => setActiveTopic(null)}
              >
                <Text style={[styles.chipText, !activeTopic && styles.chipTextActive]}>
                  All
                </Text>
              </Pressable>
              {FEED_TOPICS.map((topic) => {
                const theme = getFeedTagTheme(topic);
                const isActive = activeTopic === topic;
                return (
                  <Pressable
                    key={topic}
                    style={[
                      styles.chip,
                      isActive && {
                        backgroundColor: theme.bg,
                        borderColor: theme.border || theme.text,
                      },
                    ]}
                    onPress={() => setActiveTopic(isActive ? null : topic)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isActive && {
                          color: theme.text,
                          fontFamily: Fonts.semiBold,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {topic}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* Section title */}
        {!loading && !accessBlocked && filtered.length > 0 ? (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent Posts</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
          </View>
        ) : null}

        {/* Content */}
        {loading ? (
          <CommunityFeedSkeleton count={4} />
        ) : error ? (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature="feed"
            defaultTitle="Could not load feed"
            onRetry={() => load()}
          />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyCircle}>
              <Feather name="message-square" size={sf(28)} color={T.teal} />
            </View>
            <Text style={styles.emptyTitle}>
              {emptyReason === "no_approved_membership" ? "Join your community" : "No posts yet"}
            </Text>
            <Text style={styles.emptyText}>
              {getFeedEmptyMessage(emptyReason)}
            </Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() =>
                router.push(
                  emptyReason === "no_approved_membership"
                    ? "/screens/region"
                    : "/screens/create-post",
                )
              }
            >
              <Text style={styles.emptyBtnText}>
                {emptyReason === "no_approved_membership" ? "Select region" : "Create Post"}
              </Text>
            </Pressable>
          </View>
        ) : (
          filtered.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              now={now}
              onLike={handleLike}
              onProfile={() =>
                openNeighborProfile(router, {
                  userId: post.user_id ?? post.user?.id,
                  isMine: post.is_mine,
                })
              }
              onComments={() =>
                router.push({
                  pathname: "/screens/community-feed/comments",
                  params: { postId: String(post.id) },
                })
              }
              onShare={() => handleShare(post)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: {
    paddingHorizontal: sw(18),
    paddingTop: sw(10),
    paddingBottom: sw(32),
  },
  composerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: T.white,
    borderRadius: sw(16),
    padding: sw(12),
    marginBottom: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        }
      : { elevation: 2 }),
  },
  composerInput: {
    flex: 1,
    backgroundColor: T.canvas,
    borderRadius: sw(12),
    paddingVertical: sw(10),
    paddingHorizontal: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
  },
  composerPlaceholder: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: T.gray,
  },
  composerBtn: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    backgroundColor: T.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsScroll: {
    marginBottom: sw(16),
    marginHorizontal: -sw(18),
  },
  chipsRow: {
    paddingHorizontal: sw(18),
    gap: sw(8),
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(14),
    paddingVertical: sw(7),
    borderRadius: 999,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: T.mint,
    borderColor: T.teal,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
    flexShrink: 0,
    fontWeight: "500",
  },
  chipTextActive: {
    color: T.navy,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(12),
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: T.navy,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: T.mint,
    paddingHorizontal: sw(8),
    paddingVertical: sw(2),
    borderRadius: 999,
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.deepTeal,
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    paddingTop: hp(6),
    paddingHorizontal: sw(24),
  },
  emptyCircle: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(16),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: T.navy,
    fontWeight: "700",
    marginBottom: sw(6),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: T.gray,
    textAlign: "center",
    lineHeight: sf(19),
    marginBottom: sw(20),
  },
  emptyBtn: {
    backgroundColor: T.teal,
    paddingHorizontal: sw(28),
    paddingVertical: sw(12),
    borderRadius: 999,
  },
  emptyBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: T.navy,
    fontWeight: "700",
  },
});
