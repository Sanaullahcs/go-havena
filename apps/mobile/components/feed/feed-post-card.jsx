import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import UserAvatar from "../ui/user-avatar";
import FeedPostContent from "./feed-post-content";
import FeedPostImage from "./feed-post-image";
import FeedSensitiveContent from "./feed-sensitive-content";
import FeedPostOptions from "./feed-post-options";
import { FeedCardFooter, LIKE_HEART_RED } from "./feed-engagement";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { getFeedTagTheme } from "../../constants/feed-theme";
import { formatCount, isSensitivePost, timeAgo } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

export default function FeedPostCard({
  post,
  now,
  onLike,
  onComments,
  onProfile,
  onShare,
  footerVariant = "compact",
  showOptions = true,
  style,
  contentTextStyle,
}) {
  const authorName = post.user?.display_name ?? post.user?.name ?? "Neighbor";
  const isLiked = post.liked_by_me ?? false;
  const likeCount = formatCount(post.likes_count ?? post.likes);
  const commentCount = formatCount(post.comments_count ?? post.comments);
  const theme = getFeedTagTheme(post.tag);
  const relativeTime = timeAgo(post.created_at, now) || post.user?.time || "";
  const isSensitive = isSensitivePost(post);
  const isEngagement = footerVariant === "engagement";

  const likeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLiked) { likeScale.setValue(1); return; }
    likeScale.setValue(0.7);
    Animated.spring(likeScale, {
      toValue: 1, friction: 3, tension: 200, useNativeDriver: true,
    }).start();
  }, [isLiked, likeScale]);

  const handleLike = useCallback(() => {
    if (!isSensitive) onLike?.(post.id);
  }, [isSensitive, onLike, post.id]);

  const handleComment = useCallback(() => {
    if (!isSensitive) onComments?.();
  }, [isSensitive, onComments]);

  const handleShare = useCallback(() => {
    onShare?.();
  }, [onShare]);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardInner}>
        {/* Author */}
        <View style={styles.headerRow}>
          <Pressable style={styles.userRow} onPress={onProfile} hitSlop={6}>
            <UserAvatar
              source={post.user?.avatar}
              name={authorName}
              size={sw(isEngagement ? 40 : 36)}
              style={styles.avatar}
            />
            <View style={styles.userText}>
              <Text style={[styles.userName, isEngagement && styles.userNameLarge]} numberOfLines={1}>
                {authorName}
              </Text>
              <Text style={styles.userMeta} numberOfLines={1}>
                {relativeTime}
                {post.user?.location ? ` · ${post.user.location}` : ""}
              </Text>
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            {post.status === "pending" ? (
              <View style={[styles.tag, styles.tagWarn]}>
                <Text style={[styles.tagText, { color: "#B45309" }]}>Pending</Text>
              </View>
            ) : isSensitive ? (
              <View style={[styles.tag, styles.tagWarn]}>
                <Text style={[styles.tagText, { color: "#B45309" }]}>Sensitive</Text>
              </View>
            ) : post.tag ? (
              <View style={[styles.tag, { backgroundColor: theme.bg }]}>
                <Text style={[styles.tagText, { color: theme.text }]}>{post.tag}</Text>
              </View>
            ) : null}
            {showOptions && !isSensitive ? <FeedPostOptions post={post} /> : null}
          </View>
        </View>

        {/* Content */}
        {isSensitive ? (
          <FeedSensitiveContent message={post.sensitive_message} />
        ) : (
          <>
            <FeedPostContent
              post={post}
              textStyle={contentTextStyle ?? (isEngagement ? styles.contentLarge : undefined)}
              collapsedLines={isEngagement ? 8 : 6}
            />
            {post.image_url ? (
              <FeedPostImage uri={post.image_url} style={styles.postImageWrap} />
            ) : null}
          </>
        )}

        {/* Footer */}
        {isEngagement ? (
          <FeedCardFooter
            likesCount={post.likes_count}
            commentsCount={post.comments_count}
            liked={isLiked}
            onLike={isSensitive ? undefined : handleLike}
            onComment={isSensitive ? undefined : handleComment}
            likeLabel={isLiked ? "Liked" : "Like"}
            disabled={isSensitive}
            style={styles.engagementFooter}
          />
        ) : (
          <View style={[styles.footer, isSensitive && styles.footerDisabled]}>
            <View style={styles.divider} />
            <View style={styles.actionRow}>
              {/* Like */}
              <Pressable
                style={styles.actionBtn}
                onPress={handleLike}
                disabled={isSensitive}
                hitSlop={4}
              >
                <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                  <Ionicons
                    name={isLiked ? "heart" : "heart-outline"}
                    size={sf(18)}
                    color={isSensitive ? T.border : isLiked ? LIKE_HEART_RED : T.navy}
                  />
                </Animated.View>
                <Text
                  style={[
                    styles.actionText,
                    isLiked && !isSensitive && styles.actionTextLiked,
                    isSensitive && styles.actionTextDisabled,
                  ]}
                >
                  {likeCount || "Like"}
                </Text>
              </Pressable>

              {/* Comment */}
              <Pressable
                style={styles.actionBtn}
                onPress={handleComment}
                disabled={isSensitive}
                hitSlop={4}
              >
                <Feather
                  name="message-circle"
                  size={sf(16)}
                  color={isSensitive ? T.border : T.gray}
                />
                <Text style={[styles.actionText, isSensitive && styles.actionTextDisabled]}>
                  {commentCount || "Comment"}
                </Text>
              </Pressable>

              {/* Share */}
              <Pressable
                style={styles.actionBtn}
                onPress={handleShare}
                hitSlop={4}
              >
                <Feather name="share-2" size={sf(15)} color={T.gray} />
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sw(16),
    marginBottom: sw(12),
    backgroundColor: T.white,
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
  cardInner: {
    padding: sw(14),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(10),
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  avatar: {
    marginRight: sw(10),
  },
  userText: { flex: 1, minWidth: 0 },
  userName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
  },
  userNameLarge: {
    fontSize: sf(15),
    lineHeight: sf(20),
  },
  userMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: T.gray,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 0,
  },
  tag: {
    flexShrink: 0,
    alignSelf: "flex-start",
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  tagWarn: {
    backgroundColor: "#FEF3C7",
  },
  tagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "600",
    color: T.deepTeal,
  },
  contentLarge: {
    fontSize: sf(15),
    lineHeight: sf(22),
    color: T.navy,
  },
  postImageWrap: {
    marginBottom: sw(10),
  },
  footer: {
    marginTop: sw(4),
  },
  footerDisabled: {
    opacity: 0.55,
  },
  engagementFooter: {
    marginTop: sw(10),
    marginHorizontal: -sw(14),
    marginBottom: -sw(14),
    borderBottomLeftRadius: sw(16),
    borderBottomRightRadius: sw(16),
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginBottom: sw(8),
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingVertical: sw(4),
    paddingHorizontal: sw(8),
  },
  actionText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
    fontWeight: "500",
  },
  actionTextLiked: {
    color: LIKE_HEART_RED,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  actionTextDisabled: {
    color: T.border,
  },
});
