import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import UserAvatar from "../ui/user-avatar";
import { CommunityFeedSkeleton } from "../ui/skeleton-loader";
import FeedPostCard from "../feed/feed-post-card";
import SharePostSheet from "../feed/share-post-sheet";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  fetchFeed,
  likePost,
  applyLikeToPost,
  FEED_TOPICS,
  TOPIC_LABEL_KEY,
  areFeedPostsUnchanged,
} from "../../services/feed-api";
import { useTranslation } from "react-i18next";
import { getUser } from "../../services/auth-session";
import { useApiAction } from "../../hooks/use-api-action";
import { getFeedEmptyMessage } from "../../hooks/use-community-feed";
import { getFeedTagTheme } from "../../constants/feed-theme";
import { openNeighborProfile } from "../../services/profile-api";
import { useNow } from "../../hooks/use-now";
import { sw, sf, hp } from "../../utils/responsive";
import GuestFeatureErrorState from "../guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../utils/account-access-sync";
import { rnShadow } from "../../utils/shadow";


/** Embedded community feed — used inside the Community tab and full feed screen. */
export default function CommunityFeedPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const now = useNow(30000);
  const [activeTopic, setActiveTopic] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [emptyReason, setEmptyReason] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [sharePost, setSharePost] = useState(null);
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
      const nextPosts = result.posts ?? [];
      setPosts((prev) => (areFeedPostsUnchanged(prev, nextPosts) ? prev : nextPosts));
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

  const hasLoadedRef = React.useRef(false);

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
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        return;
      }
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
        await showFailure(t("feed.couldNotLike"), err);
      }
    },
    [showFailure],
  );

  const handleShare = useCallback((post) => {
    setSharePost(post);
  }, []);

  const filtered = useMemo(() => {
    if (!activeTopic) return posts;
    return posts.filter((post) => post.tag === activeTopic);
  }, [posts, activeTopic]);

  const displayName =
    currentUser?.profile?.display_name ?? currentUser?.name ?? t("common.you");

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <>
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
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
              <Text style={styles.composerPlaceholder}>{t("feed.createPost.placeholder")}</Text>
            </View>
            <View style={styles.composerBtn}>
              <Feather name="edit-3" size={sf(16)} color={T.white} />
            </View>
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
              <Text style={[styles.chipText, !activeTopic && styles.chipTextActive]}>
                {t("common.all")}
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
                    {TOPIC_LABEL_KEY[topic] ? t(TOPIC_LABEL_KEY[topic]) : topic}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {!loading && !accessBlocked && filtered.length > 0 ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t("feed.recentPosts")}</Text>
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
          defaultTitle={t("feed.couldNotLoadFeed")}
          onRetry={() => load()}
        />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyCircle}>
            <Feather name="message-square" size={sf(28)} color={T.teal} />
          </View>
          <Text style={styles.emptyTitle}>
            {emptyReason === "no_approved_membership" ? t("feed.joinCommunity") : t("feed.noPostsYet")}
          </Text>
          <Text style={styles.emptyText}>{getFeedEmptyMessage(emptyReason)}</Text>
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
              {emptyReason === "no_approved_membership" ? t("feed.selectRegion") : t("feed.createPostBtn")}
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
            onDeleted={(postId) =>
              setPosts((prev) => prev.filter((item) => String(item.id) !== String(postId)))
            }
          />
        ))
      )}
    </ScrollView>
    <SharePostSheet
      visible={Boolean(sharePost)}
      post={sharePost}
      onClose={() => setSharePost(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: sw(18),
    paddingTop: sw(4),
    paddingBottom: sw(28),
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
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 2 }, opacity: 0.06, radius: 8 }),
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
