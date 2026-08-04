import { Text, View, StyleSheet, Pressable, useWindowDimensions, Animated } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LIKE_HEART_RED } from "../feed/feed-engagement";
import UserAvatar from "../ui/user-avatar";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import HomeSectionHeader from "./section-header";
import SectionCarousel from "./section-carousel";
import HomeSectionCard from "./home-section-card";
import {
  likePost,
  applyLikeToPost,
  timeAgo,
  parsePostDisplayContent,
  isSensitivePost,
} from "../../services/feed-api";
import FeedSensitiveContent from "../feed/feed-sensitive-content";
import { openNeighborProfile } from "../../services/profile-api";
import { mediaImageSource } from "../../utils/profile-display";
import { useNow } from "../../hooks/use-now";
import HomeSectionEmpty from "./home-section-empty";
import { sw, sf, hp } from "../../utils/responsive";

function formatCount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

const CARD_HEIGHT = Home.feedCardHeight;

function FeedCard({ post, width, onPress, onComments, onLike, onProfile, now }) {
  const authorName = post.user?.display_name ?? post.user?.name ?? "Neighbor";
  const likeCount = formatCount(post.likes_count ?? post.likes);
  const commentCount = formatCount(post.comments_count ?? post.comments);
  const isLiked = post.liked_by_me ?? false;
  const likeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLiked) {
      likeScale.setValue(1);
      return;
    }
    likeScale.setValue(0.7);
    Animated.spring(likeScale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [isLiked, likeScale]);

  const display = parsePostDisplayContent(post);
  const relativeTime = timeAgo(post.created_at, now) || post.user?.time || "";
  const sensitive = isSensitivePost(post);
  const bodyText = sensitive
    ? null
    : display.mainText || (display.hasImage ? "Shared a photo with the community" : "");

  return (
    <HomeSectionCard
      style={{
        width,
        maxWidth: width,
        height: CARD_HEIGHT,
        minHeight: CARD_HEIGHT,
        maxHeight: CARD_HEIGHT,
      }}
      contentStyle={styles.cardContent}
      onPress={onPress}
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.userRow} onPress={onProfile} hitSlop={6}>
          <UserAvatar
            source={post.user?.avatar}
            name={authorName}
            size={sw(32)}
            style={styles.avatar}
          />
          <View style={styles.userText}>
            <Text style={styles.userName} numberOfLines={1}>
              {authorName}
            </Text>
            <Text style={styles.userMeta} numberOfLines={1}>
              {relativeTime}
              {post.user?.location ? ` · ${post.user.location}` : ""}
            </Text>
          </View>
        </Pressable>
        {sensitive ? (
          <View style={[styles.tag, styles.sensitiveTag]}>
            <Text style={[styles.tagText, styles.sensitiveTagText]}>Sensitive</Text>
          </View>
        ) : post.tag ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{post.tag}</Text>
          </View>
        ) : null}
      </View>

      {sensitive ? (
        <View style={styles.sensitiveWrap}>
          <FeedSensitiveContent compact />
        </View>
      ) : (
        <View style={styles.bodyRow}>
          {display.hasImage ? (
            <View style={styles.thumbWrap}>
              <CrispImage
                source={mediaImageSource(post.image_url)}
                style={styles.thumb}
                contentFit="cover"
                contentPosition="center"
              />
            </View>
          ) : null}
          <View style={styles.textCol}>
            <Text style={styles.content} numberOfLines={2}>
              {bodyText}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.footer, sensitive && styles.footerDisabled]}>
        <View style={styles.divider} />
        <View style={styles.stats}>
          <Pressable style={styles.stat} onPress={onLike} disabled={sensitive}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={sf(16)}
                color={sensitive ? "#CBD5E1" : isLiked ? LIKE_HEART_RED : "#262626"}
              />
            </Animated.View>
            <Text
              style={[
                styles.statText,
                isLiked && !sensitive && styles.statTextLiked,
                sensitive && styles.statTextDisabled,
              ]}
            >
              {likeCount}
            </Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={onComments} disabled={sensitive}>
            <Feather
              name="message-circle"
              size={sf(16)}
              color={sensitive ? "#CBD5E1" : "#99A1AF"}
            />
            <Text style={[styles.statText, sensitive && styles.statTextDisabled]}>
              {commentCount}
            </Text>
          </Pressable>
        </View>
      </View>
    </HomeSectionCard>
  );
}

export default function Communities({ posts = [], onPostsChange }) {
  const router = useRouter();
  const now = useNow(30000);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => screenWidth - Home.gutter * 2, [screenWidth]);

  const handleLike = useCallback(
    async (postId) => {
      let previous = posts;
      const optimistic = posts.map((p) =>
        p.id === postId
          ? applyLikeToPost(p, {
              liked: !p.liked_by_me,
              likes_count: (p.likes_count ?? 0) + (p.liked_by_me ? -1 : 1),
            })
          : p,
      );
      onPostsChange?.(optimistic);

      try {
        const result = await likePost(postId);
        onPostsChange?.((current) =>
          current.map((p) => (p.id === postId ? applyLikeToPost(p, result) : p)),
        );
      } catch {
        onPostsChange?.(previous);
      }
    },
    [posts, onPostsChange],
  );

  if (posts.length === 0) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Community Feed"
          onPress={() => router.push("/screens/community-feed")}
        />
        <HomeSectionEmpty
          message="No posts yet"
          hint="Be the first to share with your neighbors."
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label="Community Feed"
        onPress={() => router.push("/screens/community-feed")}
      />

      <SectionCarousel
        style={styles.feedCarousel}
        data={posts}
        screenWidth={screenWidth}
        cardWidth={cardWidth}
        itemHeight={CARD_HEIGHT}
        fullPageSnap
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, width }) => (
          <FeedCard
            post={item}
            width={width}
            now={now}
            onPress={() => router.push("/screens/community-feed")}
            onLike={() => handleLike(item.id)}
            onProfile={() =>
              openNeighborProfile(router, {
                userId: item.user_id ?? item.user?.id,
                isMine: item.is_mine,
              })
            }
            onComments={() =>
              router.push({
                pathname: "/screens/community-feed/comments",
                params: { postId: String(item.id) },
              })
            }
          />
        )}
      />
    </View>
  );
}

const THUMB_SIZE = sw(48);

const styles = StyleSheet.create({
  feedCarousel: {
    alignSelf: "stretch",
  },
  cardContent: {
    width: "100%",
    flex: 1,
    paddingHorizontal: sw(12),
    paddingTop: sw(12),
    paddingBottom: sw(10),
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(10),
    width: "100%",
  },
  userRow: { flexGrow: 1, flexShrink: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  avatar: { width: sw(32), height: sw(32), borderRadius: sw(16), marginRight: sw(8) },
  userText: { flex: 1, minWidth: 0 },
  userName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: "#101828",
    fontWeight: "700",
  },
  userMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#99A1AF",
    marginTop: 1,
  },
  bodyRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    width: "100%",
    minHeight: 0,
  },
  sensitiveWrap: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    maxHeight: sw(56),
    justifyContent: "center",
    overflow: "hidden",
  },
  sensitiveTag: {
    backgroundColor: "#FEF3C7",
  },
  sensitiveTagText: {
    color: "#B45309",
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: sw(10),
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
    flexShrink: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  textCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  content: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#334155",
  },
  tag: {
    flexShrink: 0,
    alignSelf: "center",
    backgroundColor: "#F3E8FF",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: hp(0.2),
  },
  tagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#7C3AED",
    fontWeight: "600",
  },
  footer: {
    marginTop: sw(10),
    width: "100%",
  },
  footerDisabled: {
    opacity: 0.55,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginBottom: sw(8) },
  stats: { flexDirection: "row", gap: sw(14), alignItems: "center" },
  stat: { flexDirection: "row", alignItems: "center", gap: sw(5), minWidth: sw(36) },
  statText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#4A5565",
    fontWeight: "600",
    minWidth: sw(12),
  },
  statTextLiked: { color: LIKE_HEART_RED },
  statTextDisabled: { color: "#CBD5E1" },
});
