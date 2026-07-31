import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import UserAvatar from "../../../components/ui/user-avatar";
import { CommunityFeedSkeleton } from "../../../components/ui/skeleton-loader";
import FeedPostCard from "../../../components/feed/feed-post-card";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
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
              <Feather
                name="search"
                size={18}
                color={Colors.brandPrimaryDeep}
              />
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
            tintColor={Colors.brandPrimary}
          />
        }
      >
        {!accessBlocked ? (
          <>
            <TouchableOpacity
              style={styles.composerCard}
              activeOpacity={0.88}
              onPress={() => router.push("/screens/create-post")}
            >
              <UserAvatar
                source={currentUser?.profile?.avatar_url ?? currentUser?.avatar_url}
                name={displayName}
                size={sw(40)}
              />
              <View style={styles.composerInput}>
                <Text style={styles.composerPlaceholder}>What's on your mind?</Text>
              </View>
              <LinearGradient
                colors={[Colors.brandPrimaryDeep, Colors.brandPrimary]}
                style={styles.composerBtn}
              >
                <Feather name="edit-3" size={16} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

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
                <Text
                  style={[styles.chipText, !activeTopic && styles.chipTextActive]}
                >
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
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => setActiveTopic(isActive ? null : topic)}
                  >
                    <Feather
                      name={theme.icon}
                      size={12}
                      color={isActive ? theme.text : "#6B7280"}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        isActive && {
                          color: theme.text,
                          fontFamily: Fonts.semiBold,
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

        {!loading && !accessBlocked && filtered.length > 0 ? (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent Posts</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
          </View>
        ) : null}

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
            <LinearGradient
              colors={["#EFF6FF", "#ECFDF5"]}
              style={styles.emptyIcon}
            >
              <Feather
                name={emptyReason === "no_approved_membership" ? "users" : "message-square"}
                size={32}
                color={Colors.brandPrimaryDeep}
              />
            </LinearGradient>
            <Text style={styles.emptyTitle}>
              {emptyReason === "no_approved_membership" ? "Join your community" : "No posts yet"}
            </Text>
            <Text style={styles.emptyText}>
              {getFeedEmptyMessage(emptyReason)}
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              activeOpacity={0.9}
              onPress={() =>
                router.push(
                  emptyReason === "no_approved_membership"
                    ? "/screens/region"
                    : "/screens/create-post",
                )
              }
            >
              <LinearGradient
                colors={[Colors.brandPrimaryDeep, Colors.brandPrimary]}
                style={styles.emptyBtnGradient}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyBtnText}>
                  {emptyReason === "no_approved_membership" ? "Select region" : "Create Post"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
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
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  scroll: { paddingHorizontal: sw(18), paddingTop: sw(12), paddingBottom: sw(32) },
  composerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    padding: sw(12),
    marginBottom: sw(14),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: "#0052DF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  composerInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: sw(12),
    paddingVertical: sw(10),
    paddingHorizontal: sw(14),
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  composerPlaceholder: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#9CA3AF",
  },
  composerBtn: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  chipsScroll: { marginBottom: sw(16), marginHorizontal: -sw(18) },
  chipsRow: {
    paddingHorizontal: sw(18),
    gap: sw(8),
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: Colors.brandPrimaryDeep,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#6B7280",
    flexShrink: 0,
  },
  chipTextActive: {
    color: Colors.brandPrimaryDeep,
    fontFamily: Fonts.semiBold,
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
    color: "#101828",
    fontWeight: "700",
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
    fontWeight: "700",
    marginBottom: sw(6),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: sf(19),
    marginBottom: sw(20),
  },
  emptyBtn: {
    borderRadius: sw(14),
    overflow: "hidden",
  },
  emptyBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(24),
    paddingVertical: sw(12),
  },
  emptyBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
