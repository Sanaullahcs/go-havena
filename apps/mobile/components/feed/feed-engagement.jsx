import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";

import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import UserAvatar from "../ui/user-avatar";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { formatCount, getCommentTimeLabel } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

export const LIKE_HEART_RED = "#ED4956";

export function FeedEngagementSummary({
  likesCount,
  commentsCount,
  style,
  onCommentsPress,
}) {
  const { t } = useTranslation();
  const likes = Number(likesCount ?? 0);
  const comments = Number(commentsCount ?? 0);

  if (likes <= 0 && comments <= 0) return null;

  return (
    <View style={[styles.summaryRow, style]}>
      <View style={styles.summaryLeft}>
        {likes > 0 ? (
          <View style={styles.summaryLikeGroup}>
            <View style={styles.likeBadge}>
              <Ionicons name="heart" size={11} color="#FFFFFF" />
            </View>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryCount}>{formatCount(likes)}</Text>
              {" "}
              {t("feed.likeCount", { count: likes })}
            </Text>
          </View>
        ) : null}
      </View>
      {comments > 0 ? (
        <Pressable
          onPress={onCommentsPress}
          disabled={!onCommentsPress}
          hitSlop={8}
          style={({ pressed }) => pressed && onCommentsPress && styles.summaryCommentsPressed}
        >
          <Text style={styles.summaryComments}>
            <Text style={styles.summaryCount}>{formatCount(comments)}</Text>
            {" "}
            {t("feed.commentCount", { count: comments })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FeedActionRow({
  liked,
  onLike,
  onComment,
  likeLabel,
  commentLabel,
  disabled = false,
}) {
  const { t } = useTranslation();
  const resolvedLikeLabel = likeLabel ?? (liked ? t("feed.liked") : t("feed.like"));
  const resolvedCommentLabel = commentLabel ?? t("feed.comment");
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!liked || disabled) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.7);
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [liked, scale, disabled]);

  return (
    <View style={[styles.actionRow, disabled && styles.actionRowDisabled]}>
      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          liked && !disabled && styles.actionBtnLiked,
          pressed && !disabled && styles.actionBtnPressed,
        ]}
        onPress={onLike}
        disabled={disabled || !onLike}
      >
        <Animated.View
          style={[styles.actionIconWrap, { transform: [{ scale }] }]}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={disabled ? T.border : liked ? LIKE_HEART_RED : T.navy}
          />
        </Animated.View>
        <Text
          style={[
            styles.actionLabel,
            liked && !disabled && styles.actionLabelLiked,
            disabled && styles.actionLabelDisabled,
          ]}
        >
          {resolvedLikeLabel}
        </Text>
      </Pressable>

      <View style={styles.actionDivider} />

      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          pressed && !disabled && styles.actionBtnPressed,
        ]}
        onPress={onComment}
        disabled={disabled || !onComment}
      >
        <View style={styles.actionIconWrapComment}>
          <Feather
            name="message-circle"
            size={16}
            color={disabled ? T.border : T.deepTeal}
          />
        </View>
        <Text
          style={[
            styles.actionLabel,
            styles.actionLabelComment,
            disabled && styles.actionLabelDisabled,
          ]}
        >
          {resolvedCommentLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function FeedCardFooter({
  likesCount,
  commentsCount,
  liked,
  onLike,
  onComment,
  likeLabel,
  commentLabel,
  disabled = false,
  style,
}) {
  const { t } = useTranslation();
  const likes = Number(likesCount ?? 0);
  const comments = Number(commentsCount ?? 0);
  const hasSummary = likes > 0 || comments > 0;

  return (
    <View style={[styles.footerWrap, style, disabled && styles.footerDisabled]}>
      {hasSummary ? (
        <FeedEngagementSummary
          likesCount={likesCount}
          commentsCount={commentsCount}
          onCommentsPress={disabled ? undefined : onComment}
        />
      ) : null}
      <FeedActionRow
        liked={liked}
        onLike={onLike}
        onComment={onComment}
        likeLabel={likeLabel ?? (liked ? t("feed.liked") : t("feed.like"))}
        commentLabel={commentLabel ?? t("feed.comment")}
        disabled={disabled}
      />
    </View>
  );
}

export function FeedCommentBubble({
  comment,
  onReply,
  onProfile,
  onLike,
  pending = false,
  now,
  depth = 0,
}) {
  const { t } = useTranslation();
  const authorName = comment.user?.display_name ?? comment.user?.name ?? t("feed.neighbor");
  const timeLabel = getCommentTimeLabel(
    { ...comment, pending: pending || comment.pending },
    now ?? Date.now(),
  );
  const indentLevel = Math.max(0, Math.min(depth ?? comment.depth ?? 0, 2));
  const parentAuthor = comment.parent_author_name;
  const likeCount = Number(comment.likes_count ?? 0);
  const liked = Boolean(comment.liked_by_me);

  return (
    <View
      style={[
        styles.commentRow,
        pending && styles.commentRowPending,
        indentLevel > 0 && styles[`commentRowNested${indentLevel}`],
      ]}
    >
      <Pressable onPress={onProfile} hitSlop={6} disabled={!onProfile}>
        <UserAvatar
          source={comment.user?.avatar}
          name={authorName}
          size={sw(indentLevel > 0 ? 28 : 36)}
        />
      </Pressable>
      <View style={styles.commentBody}>
        <View
          style={[
            styles.bubble,
            comment.is_mine && styles.bubbleMine,
            indentLevel > 0 && styles.bubbleNested,
          ]}
        >
          <Pressable onPress={onProfile} disabled={!onProfile}>
            <Text style={styles.bubbleName}>{authorName}</Text>
          </Pressable>
          {parentAuthor && indentLevel > 0 ? (
            <Text style={styles.replyHint}>
              {t("feed.replyingTo")} <Text style={styles.replyHintName}>{parentAuthor}</Text>
            </Text>
          ) : null}
          <Text style={styles.bubbleText}>{comment.content ?? comment.body}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.metaTime}>{timeLabel}</Text>
          <Pressable onPress={() => onLike?.(comment)} hitSlop={8}>
            <Text style={[styles.metaAction, liked && styles.metaActionLiked]}>
              {liked ? t("feed.liked") : t("feed.like")}
              {likeCount > 0 ? ` · ${formatCount(likeCount)}` : ""}
            </Text>
          </Pressable>
          <Pressable onPress={() => onReply?.(comment)} hitSlop={8}>
            <Text style={styles.metaAction}>{t("feed.reply")}</Text>
          </Pressable>
          {pending ? (
            <ActivityIndicator size="small" color={T.gray} style={{ marginStart: 4 }} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    marginTop: sw(10),
    marginHorizontal: -sw(14),
    marginBottom: -sw(14),
    backgroundColor: T.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
    borderBottomLeftRadius: sw(16),
    borderBottomRightRadius: sw(16),
    overflow: "hidden",
  },
  footerDisabled: {
    opacity: 0.6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(14),
    paddingTop: sw(10),
    paddingBottom: sw(8),
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  summaryLikeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  likeBadge: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: LIKE_HEART_RED,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
  },
  summaryCount: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    color: T.navy,
  },
  summaryComments: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
  },
  summaryCommentsPressed: {
    opacity: 0.65,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(10),
    paddingBottom: sw(10),
    paddingTop: sw(4),
    gap: sw(8),
  },
  actionRowDisabled: {
    opacity: 0.7,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(10),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  actionBtnLiked: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
  },
  actionBtnPressed: {
    backgroundColor: T.canvas,
    transform: [{ scale: 0.98 }],
  },
  actionIconWrap: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconWrapComment: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDivider: {
    width: 0,
  },
  actionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
  },
  actionLabelDisabled: {
    color: T.border,
  },
  actionLabelLiked: {
    color: LIKE_HEART_RED,
  },
  actionLabelComment: {
    color: T.deepTeal,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginBottom: sw(14),
    width: "100%",
  },
  commentRowNested1: {
    paddingStart: sw(28),
  },
  commentRowNested2: {
    paddingStart: sw(48),
  },
  commentRowPending: {
    opacity: 0.85,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  bubble: {
    backgroundColor: T.canvas,
    borderRadius: sw(18),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  bubbleNested: {
    backgroundColor: "#F5F6F8",
  },
  bubbleMine: {
    backgroundColor: T.mint,
  },
  bubbleName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "700",
    marginBottom: sw(3),
  },
  replyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: T.gray,
    marginBottom: sw(4),
  },
  replyHintName: {
    fontFamily: Fonts.semiBold,
    color: T.deepTeal,
    fontWeight: "600",
  },
  bubbleText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: sw(6),
    marginStart: sw(14),
  },
  metaTime: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.gray,
    fontWeight: "700",
  },
  metaAction: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.gray,
    fontWeight: "700",
  },
  metaActionLiked: {
    color: T.deepTeal,
  },
});
