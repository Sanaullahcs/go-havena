import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import UserAvatar from "../ui/user-avatar";
import FeedPostContent from "./feed-post-content";
import FeedPostImage from "./feed-post-image";
import FeedPostOptions from "./feed-post-options";
import { FeedCardFooter, LIKE_HEART_RED } from "./feed-engagement";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { getFeedTagTheme } from "../../constants/feed-theme";
import { formatCount, timeAgo } from "../../services/feed-api";
import { sw, sf, hp } from "../../utils/responsive";

/**
 * Shared community feed post card — list, comments header, and search detail.
 */
export default function FeedPostCard({
  post,
  now,
  onLike,
  onComments,
  onProfile,
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

  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardInner}>
        <View style={styles.headerRow}>
          <Pressable style={styles.userRow} onPress={onProfile} hitSlop={6}>
            <UserAvatar
              source={post.user?.avatar}
              name={authorName}
              size={sw(footerVariant === "engagement" ? 44 : 34)}
              style={styles.avatar}
            />
            <View style={styles.userText}>
              <Text style={[styles.userName, footerVariant === "engagement" && styles.userNameLarge]} numberOfLines={1}>
                {authorName}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.userMeta} numberOfLines={1}>
                  {relativeTime}
                  {post.user?.location ? ` · ${post.user.location}` : ""}
                </Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            {post.status === "pending" ? (
              <View style={[styles.tag, { backgroundColor: "#FEF3C7" }]}>
                <Feather name="clock" size={10} color="#B45309" />
                <Text style={[styles.tagText, { color: "#B45309" }]}>Pending</Text>
              </View>
            ) : post.tag ? (
              <View style={[styles.tag, { backgroundColor: theme.bg }]}>
                <Text style={[styles.tagText, { color: theme.text }]}>{post.tag}</Text>
              </View>
            ) : null}
            {showOptions ? <FeedPostOptions post={post} /> : null}
          </View>
        </View>

        <FeedPostContent
          post={post}
          textStyle={contentTextStyle ?? (footerVariant === "engagement" ? styles.contentLarge : undefined)}
          collapsedLines={footerVariant === "engagement" ? 8 : 6}
        />

        {post.image_url ? (
          <FeedPostImage uri={post.image_url} style={styles.postImageWrap} />
        ) : null}

        {footerVariant === "engagement" ? (
          <FeedCardFooter
            likesCount={post.likes_count}
            commentsCount={post.comments_count}
            liked={isLiked}
            onLike={() => onLike?.(post.id)}
            onComment={onComments}
            likeLabel={isLiked ? "Liked" : "Like"}
            style={styles.engagementFooter}
          />
        ) : (
          <View style={styles.footer}>
            <View style={styles.divider} />
            <View style={styles.stats}>
              <Pressable style={styles.stat} onPress={() => onLike?.(post.id)}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={sf(16)}
                  color={isLiked ? LIKE_HEART_RED : "#262626"}
                />
                <Text style={[styles.statText, isLiked && styles.statTextLiked]}>{likeCount}</Text>
              </Pressable>
              <Pressable style={styles.stat} onPress={onComments}>
                <Feather name="message-circle" size={sf(14)} color="#99A1AF" />
                <Text style={styles.statText}>{commentCount}</Text>
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
    marginBottom: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
    color: "#101828",
    fontWeight: "700",
  },
  userNameLarge: {
    fontSize: sf(15),
    lineHeight: sf(20),
    color: "#050505",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 1,
  },
  userMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#99A1AF",
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
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: hp(0.25),
    borderRadius: 999,
  },
  tagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "600",
    flexShrink: 0,
  },
  contentLarge: {
    fontSize: sf(15),
    lineHeight: sf(22),
    color: "#050505",
  },
  postImageWrap: {
    marginBottom: sw(10),
  },
  footer: {
    marginTop: sw(4),
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
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: hp(0.4),
  },
  stats: {
    flexDirection: "row",
    gap: sw(16),
    alignItems: "center",
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    minWidth: sw(36),
  },
  statText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#4A5565",
    fontWeight: "600",
    minWidth: sw(12),
  },
  statTextLiked: {
    color: LIKE_HEART_RED,
  },
});
