import { Text, View, StyleSheet, Pressable, useWindowDimensions, Animated } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LIKE_HEART_RED } from "../feed/feed-engagement";
import UserAvatar from "../ui/user-avatar";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import SectionCarousel from "./section-carousel";
import HomeSectionCard from "./home-section-card";
import {
  likePost,
  applyLikeToPost,
  timeAgo,
  parsePostDisplayContent,
} from "../../services/feed-api";
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

function FeedCard({ post, width, onPress, onComments, onLike, onProfile, onShare, now }) {
  const authorName = post.user?.display_name ?? post.user?.name ?? "Neighbor";
  const likeCount = formatCount(post.likes_count ?? post.likes);
  const commentCount = formatCount(post.comments_count ?? post.comments);
  const isLiked = post.liked_by_me ?? false;
  const likeScale = useRef(new Animated.Value(1)).current;
  const roleLabel = post.user?.role_label || (post.user?.is_admin ? "Admin" : null);

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
  const bodyText = display.mainText || (display.hasImage ? "Shared a photo with the community" : "");

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
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {authorName}
              </Text>
              {roleLabel ? (
                <View style={styles.adminPill}>
                  <Text style={styles.adminPillText}>{roleLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.userMeta} numberOfLines={1}>
              {relativeTime}
              {post.user?.location ? ` · ${post.user.location}` : ""}
            </Text>
          </View>
        </Pressable>
        {post.tag ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{post.tag}</Text>
          </View>
        ) : null}
      </View>

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

      <View style={styles.footer}>
        <View style={styles.divider} />
        <View style={styles.stats}>
          <Pressable style={styles.stat} onPress={onLike}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={sf(16)}
                color={isLiked ? LIKE_HEART_RED : HomeTheme.mediumGray}
              />
            </Animated.View>
            <Text style={[styles.statText, isLiked && styles.statTextLiked]}>{likeCount}</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={onComments}>
            <Feather name="message-circle" size={sf(16)} color={HomeTheme.mediumGray} />
            <Text style={styles.statText}>{commentCount}</Text>
          </Pressable>
          <Pressable style={[styles.stat, styles.shareStat]} onPress={onShare}>
            <Feather name="share-2" size={sf(15)} color={HomeTheme.seaGreen} />
            <Text style={styles.shareText}>Share</Text>
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
          label="Community Board"
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
        label="Community Board"
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
            onShare={() => router.push("/screens/community-feed")}
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  userName: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: HomeTheme.darkText,
    fontWeight: "700",
  },
  adminPill: {
    marginLeft: sw(6),
    paddingHorizontal: sw(7),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: HomeTheme.primaryTeal,
    flexShrink: 0,
  },
  adminPillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  userMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: HomeTheme.mediumGray,
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
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: sw(10),
    overflow: "hidden",
    backgroundColor: "#E8F8F6",
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
    color: HomeTheme.darkText,
  },
  tag: {
    flexShrink: 0,
    alignSelf: "center",
    backgroundColor: "rgba(0, 201, 136, 0.12)",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: hp(0.2),
  },
  tagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: HomeTheme.freshGreen,
    fontWeight: "600",
  },
  footer: {
    marginTop: sw(10),
    width: "100%",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HomeTheme.lightBorder, marginBottom: sw(8) },
  stats: { flexDirection: "row", gap: sw(14), alignItems: "center" },
  stat: { flexDirection: "row", alignItems: "center", gap: sw(5), minWidth: sw(36) },
  shareStat: { marginLeft: "auto" },
  statText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: HomeTheme.mediumGray,
    fontWeight: "600",
    minWidth: sw(12),
  },
  shareText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: HomeTheme.seaGreen,
    fontWeight: "600",
  },
  statTextLiked: { color: LIKE_HEART_RED },
});
