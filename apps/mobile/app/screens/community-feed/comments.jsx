import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import FeedPostCard from "../../../components/feed/feed-post-card";
import {
  FeedCommentBubble,
} from "../../../components/feed/feed-engagement";
import { CommentListSkeleton } from "../../../components/ui/skeleton-loader";
import UserAvatar from "../../../components/ui/user-avatar";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import {
  addComment,
  applyLikeToPost,
  fetchComments,
  fetchPost,
  formatCount,
  isSensitivePost,
  likePost,
  toggleCommentLike,
} from "../../../services/feed-api";
import { getUser } from "../../../services/auth-session";
import { openNeighborProfile } from "../../../services/profile-api";
import { getProfileFields } from "../../../utils/profile-display";
import { validateFeedCommentForm, hasFieldErrors, LIMITS } from "../../../utils/form-validation";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { sw, sf } from "../../../utils/responsive";
import { useApiAction } from "../../../hooks/use-api-action";
import { useNow } from "../../../hooks/use-now";

const PREVIEW_REPLY_COUNT = 1;

function getThreadRootId(comment, list) {
  if (!comment) return null;
  if (!(Number(comment.depth) > 0) || !comment.parent_id) return comment.id;
  const byId = new Map(list.map((c) => [String(c.id), c]));
  let cur = comment;
  const seen = new Set();
  while (cur?.parent_id && byId.has(String(cur.parent_id)) && !seen.has(String(cur.id))) {
    seen.add(String(cur.id));
    cur = byId.get(String(cur.parent_id));
  }
  return cur?.id ?? comment.id;
}

/** Flatten API thread order into display rows with collapsed reply previews. */
function buildCommentDisplayRows(comments, expandedThreads) {
  const rows = [];
  let i = 0;

  while (i < comments.length) {
    const item = comments[i];
    const depth = Number(item.depth) || 0;

    if (depth === 0) {
      rows.push({ type: "comment", comment: item });
      i += 1;

      const replies = [];
      while (i < comments.length && (Number(comments[i].depth) || 0) > 0) {
        replies.push(comments[i]);
        i += 1;
      }

      const rootKey = String(item.id);
      const expanded = Boolean(expandedThreads[rootKey]);

      if (replies.length > PREVIEW_REPLY_COUNT && !expanded) {
        for (const reply of replies.slice(0, PREVIEW_REPLY_COUNT)) {
          rows.push({ type: "comment", comment: reply });
        }
        rows.push({
          type: "view_all",
          rootId: item.id,
          count: replies.length,
        });
      } else {
        for (const reply of replies) {
          rows.push({ type: "comment", comment: reply });
        }
        if (expanded && replies.length > PREVIEW_REPLY_COUNT) {
          rows.push({ type: "hide", rootId: item.id, count: replies.length });
        }
      }
      continue;
    }

    rows.push({ type: "comment", comment: item });
    i += 1;
  }

  return rows;
}

export default function FeedCommentsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const { postId = "1" } = useLocalSearchParams();
  const now = useNow(30000);

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const { clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [liking, setLiking] = useState(false);
  const [likingCommentId, setLikingCommentId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState({});
  const { showFailure } = useApiAction();

  const displayRows = useMemo(
    () => buildCommentDisplayRows(comments, expandedThreads),
    [comments, expandedThreads],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [postData, commentsData] = await Promise.all([
        fetchPost(postId).catch(() => null),
        fetchComments(postId),
      ]);
      const realCount = commentsData.length;
      setComments(commentsData);
      setPost(
        postData
          ? { ...postData, comments_count: realCount, comments: realCount }
          : null,
      );
    } catch (err) {
      setPost(null);
      setComments([]);
      if (!silent) await showFailure(t("feed.comments.couldNotLoad"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [postId, showFailure]);

  useEffect(() => {
    load();
    getUser().then(setCurrentUser);
  }, [load]);

  const profileFields = getProfileFields(currentUser);
  const isSensitive = isSensitivePost(post);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleLike = async () => {
    if (!post || liking || isSensitivePost(post)) return;
    setLiking(true);
    const prev = post;
    setPost((p) =>
      applyLikeToPost(p, {
        liked: !p.liked_by_me,
        likes_count: (p.likes_count ?? 0) + (p.liked_by_me ? -1 : 1),
      }),
    );
    try {
      const result = await likePost(postId);
      setPost((p) => applyLikeToPost(p, result));
    } catch (err) {
      setPost(prev);
      await showFailure(t("feed.comments.couldNotLike"), err);
    } finally {
      setLiking(false);
    }
  };

  const handleReply = (comment) => {
    const name = comment.user?.display_name ?? comment.user?.name ?? t("feed.neighbor");
    const depth = Math.max(0, Math.min(Number(comment.depth) || 0, 2));
    const rootId = getThreadRootId(comment, comments);
    setReplyTo({
      id: comment.id,
      name,
      depth,
      parent_id: comment.parent_id ?? null,
      rootId,
    });
    if (rootId != null) {
      setExpandedThreads((prev) => ({ ...prev, [String(rootId)]: true }));
    }
    inputRef.current?.focus();
  };

  const handleLikeComment = async (comment) => {
    if (!comment || likingCommentId === comment.id) return;

    const prevComment = comment;
    const previousLiked = Boolean(comment.liked_by_me);
    const previousCount = Number(comment.likes_count ?? 0);

    setLikingCommentId(comment.id);
    setComments((prev) =>
      prev.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              liked_by_me: !previousLiked,
              likes_count: Math.max(previousCount + (previousLiked ? -1 : 1), 0),
            }
          : item,
      ),
    );

    try {
      const result = await toggleCommentLike(postId, comment.id);
      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                liked_by_me: Boolean(result.liked),
                likes_count: Number(result.likes_count ?? 0),
              }
            : item,
        ),
      );
    } catch (err) {
      setComments((prev) =>
        prev.map((item) =>
          item.id === prevComment.id
            ? { ...item, liked_by_me: previousLiked, likes_count: previousCount }
            : item,
        ),
      );
      await showFailure(t("feed.comments.couldNotLikeComment"), err);
    } finally {
      setLikingCommentId(null);
    }
  };

  const clearReply = () => setReplyTo(null);

  const toggleThread = (rootId) => {
    const key = String(rootId);
    setExpandedThreads((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const insertCommentInThread = (list, comment) => {
    if (!comment?.parent_id) {
      return [...list, comment];
    }

    const parentIndex = list.findIndex((c) => String(c.id) === String(comment.parent_id));
    if (parentIndex < 0) {
      return [...list, comment];
    }

    let insertAt = parentIndex + 1;
    const parentDepth = Number(list[parentIndex]?.depth) || 0;
    while (
      insertAt < list.length &&
      (Number(list[insertAt]?.depth) || 0) > parentDepth
    ) {
      insertAt += 1;
    }

    const next = [...list];
    next.splice(insertAt, 0, comment);
    return next;
  };

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const liveErrors = useMemo(() => validateFeedCommentForm(draft), [draft]);
  const canComment = useMemo(
    () => !isSensitive && !hasFieldErrors(liveErrors) && !sending,
    [isSensitive, liveErrors, sending],
  );

  const submit = async () => {
    if (isSensitive || !validateOnSubmit(liveErrors) || sending) return;
    setSending(true);

    const text = draft.trim();
    const parentId = replyTo?.id ?? null;
    const depth = parentId != null ? Math.min((replyTo?.depth ?? 0) + 1, 2) : 0;
    const optimisticId = `opt-${Date.now()}`;

    const optimistic = {
      id: optimisticId,
      parent_id: parentId,
      depth,
      parent_author_name: replyTo?.name ?? null,
      content: text,
      body: text,
      created_at: new Date().toISOString(),
      time_ago: t("feed.comments.justNow"),
      is_mine: true,
      pending: true,
      user: {
        display_name: profileFields.displayName,
        name: profileFields.displayName,
        avatar: profileFields.avatarUrl,
      },
    };

    setComments((prev) => insertCommentInThread(prev, optimistic));
    setDraft("");
    clearReply();
    resetTouched();
    if (parentId != null) {
      const rootId = replyTo?.rootId ?? getThreadRootId({ id: parentId, parent_id: replyTo?.parent_id, depth: replyTo?.depth }, comments);
      if (rootId != null) {
        setExpandedThreads((prev) => ({ ...prev, [String(rootId)]: true }));
      }
    }
    setPost((p) =>
      p
        ? {
            ...p,
            comments_count: (p.comments_count ?? 0) + 1,
            comments: (p.comments_count ?? 0) + 1,
          }
        : p,
    );
    // Only jump to the end for new top-level comments; keep nested replies in place.
    if (!parentId) {
      scrollToBottom();
    }

    try {
      const { comment, comments_count } = await addComment(postId, text, parentId);
      setComments((prev) =>
        prev.map((c) => (c.id === optimisticId ? { ...comment, pending: false } : c)),
      );
      if (comments_count != null) {
        setPost((p) =>
          p ? { ...p, comments_count, comments: comments_count } : p,
        );
      }
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      setPost((p) =>
        p
          ? {
              ...p,
              comments_count: Math.max((p.comments_count ?? 1) - 1, 0),
              comments: Math.max((p.comments_count ?? 1) - 1, 0),
            }
          : p,
      );
      await showFailure(t("feed.comments.couldNotPost"), err);
    } finally {
      setSending(false);
    }
  };

  const focusComposer = () => inputRef.current?.focus();

  const commentCountLabel = loading ? "..." : formatCount(comments.length);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("feed.comments.title")}
        subtitle={post ? t("feed.comments.subtitle", { count: commentCountLabel }) : undefined}
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        contentContainerStyle={styles.scroll}
        footerBorderless
        footerStyle={styles.composerWrap}
        scrollProps={{
          refreshControl: (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimary} />
          ),
        }}
        footer={
          isSensitive ? (
            <View style={styles.sensitiveComposer}>
              <Feather name="alert-triangle" size={14} color="#B45309" />
              <Text style={styles.sensitiveComposerText}>
                {t("feed.comments.sensitiveDisabled")}
              </Text>
            </View>
          ) : (
            <>
            {replyTo ? (
              <View style={styles.replyBanner}>
                <Feather name="corner-down-right" size={14} color={Colors.brandPrimaryDeep} />
                <Text style={styles.replyBannerText} numberOfLines={1}>
                  {t("feed.comments.replyingTo")} <Text style={styles.replyBannerName}>{replyTo.name}</Text>
                </Text>
                <TouchableOpacity onPress={clearReply} hitSlop={8}>
                  <Feather name="x" size={16} color="#65676B" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.composer}>
              <UserAvatar
                source={profileFields.avatarUrl}
                name={profileFields.displayName}
                size={sw(32)}
              />
              <View style={[styles.inputWrap, showError("body", liveErrors) && styles.inputError]}>
                <LocaleTextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={(text) => {
                    setDraft(text);
                    clearError("body");
                  }}
                  placeholder={replyTo ? t("feed.comments.replyPlaceholder", { name: replyTo.name }) : t("feed.comments.placeholder")}
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input]}
                  multiline
                  maxLength={LIMITS.feedComment}
                />
                {showError("body", liveErrors) ? <Text style={styles.errorText}>{showError("body", liveErrors)}</Text> : null}
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, !canComment && styles.sendBtnDisabled]}
                onPress={submit}
                disabled={!canComment}
                activeOpacity={0.85}
              >
                <View
                  style={styles.sendBtnInner}
                >
                  <Feather name="send" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>
            </>
          )
        }
      >
          {post ? (
            <>
              <FeedPostCard
                post={post}
                now={now}
                footerVariant="engagement"
                style={styles.postCard}
                onLike={handleLike}
                onComments={focusComposer}
                onProfile={() =>
                  openNeighborProfile(router, {
                    userId: post.user_id ?? post.user?.id,
                    isMine: post.is_mine,
                  })
                }
              />
              <View style={{ paddingHorizontal: sw(4), marginBottom: sw(4) }}>
</View>
            </>
          ) : null}

          <View style={styles.commentsCard}>
            <View style={styles.commentsHeader}>
              <Text style={styles.sectionTitle}>{t("feed.comments.allComments")}</Text>
              <View style={styles.sortPill}>
                <Feather name="clock" size={12} color="#65676B" />
                <Text style={styles.sortText}>{t("feed.comments.mostRecent")}</Text>
              </View>
            </View>

            {loading ? (
              <CommentListSkeleton count={4} />
            ) : comments.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View
                  style={styles.emptyIcon}
                >
                  <Feather name="message-circle" size={28} color={Colors.brandPrimaryDeep} />
                </View>
                <Text style={styles.emptyTitle}>{t("feed.comments.emptyTitle")}</Text>
                <Text style={styles.emptyText}>
                  {isSensitive
                    ? t("feed.comments.emptySensitive")
                    : t("feed.comments.emptyStart")}
                </Text>
                {!isSensitive ? (
                  <TouchableOpacity style={styles.emptyBtn} onPress={focusComposer}>
                    <Text style={styles.emptyBtnText}>{t("feed.comments.writeComment")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              displayRows.map((row) => {
                if (row.type === "view_all") {
                  return (
                    <TouchableOpacity
                      key={`view-all-${row.rootId}`}
                      style={styles.threadToggle}
                      onPress={() => toggleThread(row.rootId)}
                      activeOpacity={0.7}
                    >
                      <Feather name="message-circle" size={14} color={Colors.brandPrimaryDeep} />
                      <Text style={styles.threadToggleText}>
                        {t("feed.comments.viewAllReplies", { count: row.count })}
                      </Text>
                    </TouchableOpacity>
                  );
                }

                if (row.type === "hide") {
                  return (
                    <TouchableOpacity
                      key={`hide-${row.rootId}`}
                      style={styles.threadToggle}
                      onPress={() => toggleThread(row.rootId)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.threadToggleText}>{t("feed.comments.hideReplies")}</Text>
                    </TouchableOpacity>
                  );
                }

                const item = row.comment;
                return (
                  <FeedCommentBubble
                    key={String(item.id)}
                    comment={item}
                    depth={item.depth}
                    pending={item.pending}
                    now={now}
                    onReply={handleReply}
                    onLike={handleLikeComment}
                    onProfile={() =>
                      openNeighborProfile(router, {
                        userId: item.user_id ?? item.user?.id,
                        isMine: item.is_mine,
                      })
                    }
                  />
                );
              })
            )}
          </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F0F2F5" },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: sw(14), paddingBottom: sw(24) },
  postCard: {
    marginBottom: sw(10),
    marginTop: sw(8),
  },
  commentsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    padding: sw(16),
    borderWidth: 1,
    borderColor: "#E4E6EB",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(16),
    paddingBottom: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E6EB",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#050505",
    fontWeight: "700",
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "#F0F2F5",
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
  },
  sortText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#65676B",
  },
  threadToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(6),
    paddingStart: sw(46),
    marginBottom: sw(10),
  },
  threadToggleText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: sw(28),
    paddingHorizontal: sw(16),
  },
  emptyIcon: {
    width: sw(64),
    height: sw(64),
    borderRadius: sw(32),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(14),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#050505",
    fontWeight: "700",
    marginBottom: sw(6),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#65676B",
    textAlign: "center",
    lineHeight: sf(19),
    marginBottom: sw(16),
  },
  emptyBtn: {
    backgroundColor: "#D1FAF5",
    paddingHorizontal: sw(18),
    paddingVertical: sw(10),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  emptyBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  composerWrap: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E4E6EB",
    paddingBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  sensitiveComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    backgroundColor: "#FFFBEB",
  },
  sensitiveComposerText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#B45309",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingTop: sw(10),
    paddingBottom: sw(4),
    backgroundColor: "#D1FAF5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(20, 184, 166, 0.28)",
  },
  replyBannerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#65676B",
  },
  replyBannerName: {
    fontFamily: Fonts.bold,
    color: Colors.brandPrimaryDeep,
    fontWeight: "700",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(12),
    paddingTop: sw(8),
    paddingBottom: sw(8),
  },
  inputWrap: {
    flex: 1,
    backgroundColor: "#F0F2F5",
    borderRadius: sw(18),
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
    minHeight: sw(34),
    maxHeight: sw(96),
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E4E6EB",
  },
  input: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#050505",
    maxHeight: sw(72),
    paddingVertical: 0,
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#DC2626",
  },
  sendBtn: {
    borderRadius: sw(17),
    overflow: "hidden",
  },
  sendBtnInner: {
    width: sw(34),
    height: sw(34),
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.7 },
});
