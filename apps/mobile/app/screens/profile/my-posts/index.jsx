import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import InternalPageShell from "../../../../components/layout/internal-page-shell";
import { FeedCardFooter } from "../../../../components/feed/feed-engagement";
import UserAvatar from "../../../../components/ui/user-avatar";
import CrispImage from "../../../../components/ui/crisp-image";
import AdminRowActionsMenu from "../../../../components/admin/admin-row-actions-menu";
import { MyPostsSkeleton } from "../../../../components/ui/skeleton-loader";
import { Fonts } from "../../../../constants/font";
import { Colors, Layout } from "../../../../constants/tokens";
import { getFeedTagTheme } from "../../../../constants/feed-theme";
import {
  applyLikeToPost,
  deletePost,
  fetchMyPosts,
  likePost,
  parsePostDisplayContent,
  isSensitivePost,
  feedDetailsParams,
  TOPIC_LABEL_KEY,
} from "../../../../services/feed-api";
import FeedSensitiveContent from "../../../../components/feed/feed-sensitive-content";
import { fetchMe } from "../../../../services/profile-api";
import { getProfileFields, mediaImageSource } from "../../../../utils/profile-display";
import { useTranslation } from "react-i18next";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useAppDialog } from "../../../../providers/app-dialog-provider";
import { sw, sf, hp } from "../../../../utils/responsive";
import { rnShadow } from "../../../../utils/shadow";


const PER_PAGE = 10;

function MyPostCard({ post, profileFields, onLike, onComment, onEdit, onDelete }) {
  const { t } = useTranslation();
  const theme = getFeedTagTheme(post.tag);
  const display = parsePostDisplayContent(post);
  const sensitive = isSensitivePost(post);

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <UserAvatar
            source={profileFields.avatarUrl}
            name={profileFields.displayName}
            size={sw(42)}
          />
          <View style={styles.headerText}>
            <Text style={styles.authorName} numberOfLines={1}>
              {profileFields.displayName}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.timeText}>{post.user?.time ?? t("profile.recently")}</Text>
              {sensitive ? (
                <>
                  <View style={styles.metaDot} />
                  <View style={[styles.tagChip, { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }]}>
                    <Feather name="alert-triangle" size={10} color="#B45309" />
                    <Text style={[styles.tagText, { color: "#B45309" }]}>{t("profile.sensitive")}</Text>
                  </View>
                </>
              ) : post.tag ? (
                <>
                  <View style={styles.metaDot} />
                  <View style={[styles.tagChip, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                    <Feather name={theme.icon} size={10} color={theme.text} />
                    <Text style={[styles.tagText, { color: theme.text }]}>{TOPIC_LABEL_KEY[post.tag] ? t(TOPIC_LABEL_KEY[post.tag]) : post.tag}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <AdminRowActionsMenu
            actions={[
              {
                id: "edit",
                label: t("profile.editPost"),
                icon: "create-outline",
                tone: "primary",
                onPress: () => onEdit(post),
                hidden: sensitive,
              },
              {
                id: "delete",
                label: t("profile.deletePost"),
                icon: "trash-outline",
                tone: "danger",
                onPress: () => onDelete(post),
              },
            ]}
          />
        </View>

        {sensitive ? (
          <FeedSensitiveContent
            label={post.sensitive_label}
            message={post.sensitive_message}
            reason={post.sensitive_reason}
          />
        ) : null}
        {!sensitive ? (
          <>
            {display.mainText ? (
              <Text style={styles.bodyText}>{display.mainText}</Text>
            ) : display.isPhotoOnly ? (
              <View style={styles.photoOnlyRow}>
                <Feather name="image" size={14} color={Colors.textMuted} />
                <Text style={styles.photoOnlyText}>{t("profile.myPosts.photoPost")}</Text>
              </View>
            ) : null}

            {(display.feeling || display.location) ? (
              <View style={styles.metaChipRow}>
                {display.feeling ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {display.feeling.emoji} {display.feeling.label}
                    </Text>
                  </View>
                ) : null}
                {display.location ? (
                  <View style={styles.metaChip}>
                    <Feather name="map-pin" size={11} color="#047857" />
                    <Text style={styles.metaChipText} numberOfLines={1}>
                      {display.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {display.hasImage ? (
              <View style={styles.imageWrap}>
                <CrispImage
                  source={mediaImageSource(post.image_url)}
                  style={styles.postImage}
                  contentFit="cover"
                />
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <FeedCardFooter
        likesCount={post.likes_count ?? post.likes ?? 0}
        commentsCount={post.comments_count ?? post.comments ?? 0}
        liked={post.liked_by_me ?? false}
        onLike={sensitive ? undefined : () => onLike(post.id)}
        onComment={sensitive ? undefined : () => onComment(post)}
        disabled={sensitive}
        style={styles.cardFooter}
      />
    </View>
  );
}

function PostsEmptyState({ onCreate }) {
  const { t } = useTranslation();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Feather name="message-square" size={28} color={Colors.brandPrimaryDeep} />
      </View>
      <Text style={styles.emptyTitle}>{t("profile.myPosts.emptyTitle")}</Text>
      <Text style={styles.emptyText}>
        {t("profile.myPosts.emptySubtitle")}
      </Text>
      <TouchableOpacity style={styles.emptyBtn} activeOpacity={0.85} onPress={onCreate}>
        <Feather name="edit-3" size={14} color="#FFFFFF" />
        <Text style={styles.emptyBtnText}>{t("profile.myPosts.createPost")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MyPosts() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const fields = getProfileFields(profile);

  const loadPosts = useCallback(async (pageNum, { append = false, silent = false } = {}) => {
    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      const feedData = await fetchMyPosts({ page: pageNum, perPage: PER_PAGE });
      const batch = feedData.posts ?? [];
      const meta = feedData.meta ?? {};
      const lastPage = meta.last_page ?? 1;

      setPosts((prev) => (append ? [...prev, ...batch] : batch));
      setPage(pageNum);
      setHasMore(pageNum < lastPage);
      if (meta.total != null) {
        setTotalPosts(meta.total);
      } else if (!append) {
        setTotalPosts(batch.length);
      }
    } catch {
      if (!append) setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const profileData = await fetchMe().catch(() => null);
      setProfile(profileData);
      await loadPosts(1);
    } finally {
      setLoading(false);
    }
  }, [loadPosts]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        return;
      }
      loadPosts(1, { silent: true });
    }, [loadPosts]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPosts(1, { silent: true });
  }, [loadPosts]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || loading || refreshing) return;
    loadPosts(page + 1, { append: true });
  }, [hasMore, loadPosts, page, loading, refreshing]);

  const handleLike = useCallback(async (postId) => {
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
    } catch {
      if (previous) setPosts(previous);
    }
  }, []);

  const handleComment = useCallback(
    (post) => {
      router.push({
        pathname: "/screens/community-feed/comments",
        params: feedDetailsParams(post),
      });
    },
    [router],
  );

  const handleEdit = useCallback(
    (post) => {
      router.push({
        pathname: "/screens/create-post",
        params: { postId: String(post.id) },
      });
    },
    [router],
  );

  const handleDelete = useCallback(
    async (post) => {
      const confirmed = await showConfirm(
        t("profile.myPosts.deleteTitle"),
        t("profile.myPosts.deleteMessage"),
        { confirmLabel: t("profile.myPosts.deleteConfirm"), cancelLabel: t("profile.myPosts.deleteCancel"), destructive: true },
      );

      if (confirmed !== "confirm") return;

      try {
        await deletePost(post.id);
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        setTotalPosts((prev) => Math.max(0, prev - 1));
      } catch (err) {
        await showFailure(t("profile.myPosts.deleteFailed"), err);
      }
    },
    [showConfirm, showFailure],
  );

  const renderPost = useCallback(
    ({ item }) => (
      <View style={styles.cardWrap}>
        <MyPostCard
          post={item}
          profileFields={fields}
          onLike={handleLike}
          onComment={handleComment}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </View>
    ),
    [fields, handleLike, handleComment, handleEdit, handleDelete],
  );

  const postCountLabel = t("profile.myPosts.postCount", { count: totalPosts });

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.summaryCard}>
          <UserAvatar
            source={fields.avatarUrl}
            name={fields.displayName}
            size={sw(50)}
          />
          <View style={styles.summaryBody}>
            <Text style={styles.summaryName}>{fields.displayName}</Text>
            <Text style={styles.summaryMeta}>{postCountLabel}</Text>
            {fields.communityName ? (
              <Text style={styles.summaryCommunity} numberOfLines={1}>
                {fields.communityName}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.createBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/screens/create-post")}
            accessibilityLabel={t("profile.myPosts.createPost")}
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>{t("profile.myPosts.yourPosts")}</Text>
      </>
    ),
    [fields.avatarUrl, fields.displayName, fields.communityName, postCountLabel, router, t],
  );

  return (
    <InternalPageShell
      title={t("profile.myPosts.title")}
      subtitle={t("profile.myPosts.subtitle")}
      scroll={false}
    >
      {loading ? (
        <View style={styles.pageLoading}>
          <MyPostsSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPost}
          ListHeaderComponent={listHeader}
          style={styles.page}
          contentContainerStyle={posts.length === 0 ? styles.listEmpty : styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimaryDeep} />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            <PostsEmptyState onCreate={() => router.push("/screens/create-post")} />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.brandPrimaryDeep} />
                <Text style={styles.footerLoaderText}>{t("profile.myPosts.loadingMore")}</Text>
              </View>
            ) : null
          }
        />
      )}
    </InternalPageShell>
  );
}

const CARD_RADIUS = sw(16);

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(16),
  },
  pageLoading: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(16),
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(16),
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    backgroundColor: "#D1FAF5",
    marginBottom: sw(14),
    ...Platform.select({
      ios: {
        ...rnShadow({ color: Colors.brandPrimaryDeep, offset: { width: 0, height: 4 }, opacity: 0.07, radius: 10 }),
      },
      android: { elevation: 2 },
    }),
  },
  summaryBody: { flex: 1, gap: 3, minWidth: 0 },
  summaryName: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  summaryMeta: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  summaryCommunity: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textSecondary,
  },
  createBtn: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    backgroundColor: Colors.brandPrimaryDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontWeight: "700",
    marginBottom: sw(10),
  },
  listContent: {
    paddingBottom: sw(20),
  },
  listEmpty: {
    flexGrow: 1,
    paddingBottom: sw(20),
  },
  cardWrap: {
    marginBottom: sw(14),
  },
  card: {
    borderRadius: CARD_RADIUS,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 10 }),
      },
      android: { elevation: 2 },
    }),
  },
  cardContent: {
    paddingTop: sw(14),
    paddingHorizontal: sw(14),
    paddingBottom: sw(4),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginBottom: sw(12),
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: sw(4),
    paddingTop: sw(2),
  },
  authorName: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: sw(6),
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  timeText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: hp(0.2),
    borderRadius: 999,
    borderWidth: 1,
  },
  tagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
  },
  bodyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(22),
    color: Colors.textBody,
    marginBottom: sw(10),
  },
  photoOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginBottom: sw(10),
  },
  photoOnlyText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  metaChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(6),
    marginBottom: sw(10),
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxWidth: "100%",
  },
  metaChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: Colors.textSecondary,
    fontWeight: "500",
    flexShrink: 1,
  },
  imageWrap: {
    borderRadius: sw(12),
    overflow: "hidden",
    backgroundColor: "#EEF2F7",
    marginBottom: sw(10),
  },
  postImage: {
    width: "100%",
    height: hp(24),
  },
  cardFooter: {
    marginTop: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    overflow: "hidden",
  },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(16),
  },
  footerLoaderText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  empty: {
    alignItems: "center",
    paddingVertical: sw(40),
    gap: sw(10),
  },
  emptyIconWrap: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: sf(20),
    paddingHorizontal: sw(24),
  },
  emptyBtn: {
    marginTop: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(18),
    paddingVertical: sw(11),
    borderRadius: sw(12),
    backgroundColor: Colors.brandPrimaryDeep,
  },
  emptyBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
