import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import UserAvatar from "../ui/user-avatar";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { formatCount, getCommentTimeLabel } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

/** Instagram-style like red */
export const LIKE_HEART_RED = "#ED4956";

/** Engagement counts row — likes left, comments right */
export function FeedEngagementSummary({
  likesCount,
  commentsCount,
  style,
  onCommentsPress,
}) {
  const likes = Number(likesCount ?? 0);
  const comments = Number(commentsCount ?? 0);

  if (likes <= 0 && comments <= 0) return null;

  return (
    <View style={[styles.summaryRow, style]}>
      <View style={styles.summaryLeft}>
        {likes > 0 ? (
          <View style={styles.summaryLikeGroup}>
            <LinearGradient
              colors={["#F56040", LIKE_HEART_RED, "#C13584"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.likeBadge}
            >
              <Ionicons name="heart" size={11} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryCount}>{formatCount(likes)}</Text>
              {" "}
              {likes === 1 ? "Like" : "Likes"}
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
            {comments === 1 ? "Comment" : "Comments"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Like / Comment action row with pill buttons */
export function FeedActionRow({
  liked,
  onLike,
  onComment,
  likeLabel = "Like",
  commentLabel = "Comment",
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!liked) {
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
  }, [liked, scale]);

  return (
    <View style={styles.actionRow}>
      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          liked && styles.actionBtnLiked,
          pressed && styles.actionBtnPressed,
        ]}
        onPress={onLike}
      >
        <Animated.View
          style={[
            styles.actionIconWrap,
            liked && styles.actionIconWrapLiked,
            { transform: [{ scale }] },
          ]}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? LIKE_HEART_RED : "#262626"}
          />
        </Animated.View>
        <Text style={[styles.actionLabel, liked && styles.actionLabelLiked]}>
          {likeLabel}
        </Text>
      </Pressable>

      <View style={styles.actionDivider} />

      <Pressable
        style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
        onPress={onComment}
      >
        <View style={styles.actionIconWrapComment}>
          <Feather name="message-circle" size={16} color={Colors.brandPrimaryDeep} />
        </View>
        <Text style={[styles.actionLabel, styles.actionLabelComment]}>
          {commentLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/** Combined card footer — summary + actions in one styled block */
export function FeedCardFooter({
  likesCount,
  commentsCount,
  liked,
  onLike,
  onComment,
  likeLabel,
  commentLabel = "Comment",
  style,
}) {
  const likes = Number(likesCount ?? 0);
  const comments = Number(commentsCount ?? 0);
  const hasSummary = likes > 0 || comments > 0;

  return (
    <View style={[styles.footerWrap, style]}>
      {hasSummary ? (
        <FeedEngagementSummary
          likesCount={likesCount}
          commentsCount={commentsCount}
          onCommentsPress={onComment}
        />
      ) : null}
      <FeedActionRow
        liked={liked}
        onLike={onLike}
        onComment={onComment}
        likeLabel={likeLabel ?? (liked ? "Liked" : "Like")}
        commentLabel={commentLabel}
      />
    </View>
  );
}

/** Comment bubble with meta row */
export function FeedCommentBubble({
  comment,
  onReply,
  onProfile,
  onLike,
  pending = false,
  now,
  depth = 0,
}) {
  const authorName = comment.user?.display_name ?? comment.user?.name ?? "Neighbor";
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
              Replying to <Text style={styles.replyHintName}>{parentAuthor}</Text>
            </Text>
          ) : null}
          <Text style={styles.bubbleText}>{comment.content ?? comment.body}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.metaTime}>{timeLabel}</Text>
          <Pressable onPress={() => onLike?.(comment)} hitSlop={8}>
            <Text style={[styles.metaAction, liked && styles.metaActionLiked]}>
              {liked ? "Liked" : "Like"}
              {likeCount > 0 ? ` · ${formatCount(likeCount)}` : ""}
            </Text>
          </Pressable>
          <Pressable onPress={() => onReply?.(comment)} hitSlop={8}>
            <Text style={styles.metaAction}>Reply</Text>
          </Pressable>
          {pending ? (
            <ActivityIndicator size="small" color="#65676B" style={{ marginLeft: 4 }} />
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
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    borderBottomLeftRadius: sw(16),
    borderBottomRightRadius: sw(16),
    overflow: "hidden",
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
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.brandPrimaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
  },
  summaryCount: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    color: "#334155",
  },
  summaryComments: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
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
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(10),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  actionBtnLiked: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
  },
  actionBtnPressed: {
    backgroundColor: "#F1F5F9",
    transform: [{ scale: 0.98 }],
  },
  actionIconWrap: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconWrapLiked: {
    backgroundColor: "transparent",
  },
  actionIconWrapComment: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionDivider: {
    width: 0,
  },
  actionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#475569",
    fontWeight: "600",
  },
  actionLabelLiked: {
    color: LIKE_HEART_RED,
  },
  actionLabelComment: {
    color: Colors.brandPrimaryDeep,
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
    backgroundColor: "#F0F2F5",
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
    backgroundColor: "#E7F3FF",
  },
  bubbleName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#050505",
    fontWeight: "700",
    marginBottom: sw(3),
  },
  replyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#65676B",
    marginBottom: sw(4),
  },
  replyHintName: {
    fontFamily: Fonts.semiBold,
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  bubbleText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#050505",
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: sw(6),
    marginLeft: sw(14),
  },
  metaTime: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#65676B",
    fontWeight: "700",
  },
  metaAction: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#65676B",
    fontWeight: "700",
  },
  metaActionLiked: {
    color: Colors.brandPrimaryDeep,
  },
});
