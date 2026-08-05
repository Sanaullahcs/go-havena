import { Text, View, StyleSheet, Pressable, useWindowDimensions, Animated, Platform } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LIKE_HEART_RED } from "../feed/feed-engagement";
import UserAvatar from "../ui/user-avatar";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
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
import { sw, sf } from "../../utils/responsive";
import { FlatList } from "react-native";

function formatCount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

const CARD_GAP = sw(12);
const PEEK = sw(40);
const IMAGE_RATIO = 0.48;
const BOTTOM_AREA_H = sw(100);

function FeedCard({ post, width, height, imageH, onPress, onComments, onLike, onProfile, now }) {
  const authorName = post.user?.display_name ?? post.user?.name ?? "Neighbor";
  const likeCount = formatCount(post.likes_count ?? post.likes);
  const commentCount = formatCount(post.comments_count ?? post.comments);
  const isLiked = post.liked_by_me ?? false;
  const likeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLiked) { likeScale.setValue(1); return; }
    likeScale.setValue(0.7);
    Animated.spring(likeScale, {
      toValue: 1, friction: 3, tension: 200, useNativeDriver: true,
    }).start();
  }, [isLiked, likeScale]);

  const display = parsePostDisplayContent(post);
  const relativeTime = timeAgo(post.created_at, now) || post.user?.time || "";
  const sensitive = isSensitivePost(post);
  const bodyText = sensitive
    ? null
    : display.mainText || (display.hasImage ? "Shared a photo" : "");
  const hasImage = !sensitive && display.hasImage;
  const isTextOnly = !hasImage && !sensitive;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardInner, { height }, isTextOnly && styles.cardInnerTextOnly]}>
        {/* Image block — only for image posts */}
        {hasImage ? (
          <View style={[styles.imageWrap, { height: imageH }]}>
            <CrispImage
              source={mediaImageSource(post.image_url)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="center"
            />
          </View>
        ) : null}

        {/* Text-only: quote-style body on navy bg */}
        {isTextOnly && bodyText ? (
          <View style={styles.quoteBlock}>
            <Ionicons name="chatbox-ellipses-outline" size={sf(18)} color="rgba(20,184,166,0.5)" style={{ marginBottom: sw(6) }} />
            <Text style={styles.quoteText} numberOfLines={4}>{bodyText}</Text>
          </View>
        ) : null}

        {/* Content area */}
        <View style={styles.contentArea}>
          {/* Author row */}
          <Pressable style={styles.authorRow} onPress={onProfile} hitSlop={6}>
            <UserAvatar
              source={post.user?.avatar}
              name={authorName}
              size={sw(30)}
              style={styles.avatar}
            />
            <View style={styles.authorCopy}>
              <Text style={[styles.authorName, isTextOnly && styles.authorNameLight]} numberOfLines={1}>{authorName}</Text>
              <Text style={[styles.authorMeta, isTextOnly && styles.authorMetaLight]} numberOfLines={1}>
                {relativeTime}
                {post.user?.location ? ` · ${post.user.location}` : ""}
              </Text>
            </View>
            {sensitive ? (
              <View style={[styles.chip, styles.chipWarn]}>
                <Text style={[styles.chipText, styles.chipWarnText]}>Sensitive</Text>
              </View>
            ) : post.tag ? (
              <View style={[styles.chip, isTextOnly && styles.chipDark]}>
                <Text style={[styles.chipText, isTextOnly && styles.chipTextDark]}>{post.tag}</Text>
              </View>
            ) : null}
          </Pressable>

          {/* Sensitive content */}
          {sensitive ? (
            <View style={styles.sensitiveWrap}>
              <FeedSensitiveContent compact />
            </View>
          ) : null}

          {/* Body text — only for image posts (text-only uses quoteBlock above) */}
          {hasImage && bodyText ? (
            <Text style={styles.bodyText} numberOfLines={2}>{bodyText}</Text>
          ) : null}

          {/* Engagement bar */}
          <View style={[styles.engagementBar, isTextOnly && styles.engagementBarDark]}>
            <Pressable style={styles.engBtn} onPress={onLike} disabled={sensitive}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={sf(16)}
                  color={sensitive ? T.border : isLiked ? LIKE_HEART_RED : isTextOnly ? "rgba(255,255,255,0.8)" : T.navy}
                />
              </Animated.View>
              <Text style={[styles.engCount, isTextOnly && styles.engCountLight, isLiked && !sensitive && { color: LIKE_HEART_RED }]}>
                {likeCount}
              </Text>
            </Pressable>
            <Pressable style={styles.engBtn} onPress={onComments} disabled={sensitive}>
              <Ionicons name="chatbubble-outline" size={sf(14)} color={sensitive ? T.border : isTextOnly ? "rgba(255,255,255,0.6)" : T.gray} />
              <Text style={[styles.engCount, isTextOnly && styles.engCountLight]}>{commentCount}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.engBtn} hitSlop={8}>
              <Ionicons name="share-outline" size={sf(16)} color={isTextOnly ? "rgba(255,255,255,0.6)" : T.gray} />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function Communities({ posts = [], onPostsChange }) {
  const router = useRouter();
  const now = useNow(30000);
  const { width: screenWidth } = useWindowDimensions();

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor(contentWidth - PEEK);
    const imageH = Math.round(cardWidth * IMAGE_RATIO);
    const cardHeight = imageH + BOTTOM_AREA_H;
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, cardHeight, imageH, snap };
  }, [screenWidth]);

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

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ width: layout.cardWidth, height: layout.cardHeight, flexShrink: 0 }}>
        <FeedCard
          post={item}
          width={layout.cardWidth}
          height={layout.cardHeight}
          imageH={layout.imageH}
          now={now}
          onPress={() =>
            router.push({
              pathname: "/screens/community-feed/comments",
              params: { postId: String(item.id) },
            })
          }
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
      </View>
    ),
    [layout.cardWidth, now, router, handleLike],
  );

  if (posts.length === 0) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label="Community Feed"
          onPress={() => router.push("/(tabs)/marketplace")}
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
        onPress={() => router.push("/(tabs)/marketplace")}
      />
      <FlatList
        data={posts}
        horizontal
        style={styles.carousel}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={layout.snap}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: layout.snap,
          offset: layout.snap * index,
          index,
        })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const RADIUS = sw(16);

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingRight: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          borderCurve: "continuous",
        }
      : { elevation: 3 }),
  },
  cardPressed: { opacity: 0.95, transform: [{ scale: 0.98 }] },
  cardInner: {
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  cardInnerTextOnly: {
    backgroundColor: T.navy,
    borderColor: "rgba(20,184,166,0.15)",
  },
  imageWrap: {
    width: "100%",
    backgroundColor: T.canvas,
  },
  quoteBlock: {
    flex: 1,
    paddingHorizontal: sw(18),
    paddingTop: sw(18),
    paddingBottom: sw(10),
    justifyContent: "center",
  },
  quoteText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14.5),
    lineHeight: sf(21),
    color: "#FFFFFF",
    fontWeight: "500",
  },
  contentArea: {
    paddingHorizontal: sw(14),
    paddingTop: sw(12),
    paddingBottom: sw(10),
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: sw(8),
  },
  avatar: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(15),
    marginRight: sw(8),
  },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    fontFamily: Fonts.bold,
    fontSize: sf(12.5),
    lineHeight: sf(16),
    color: T.navy,
    fontWeight: "700",
  },
  authorNameLight: {
    color: "#FFFFFF",
  },
  authorMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: T.gray,
    marginTop: 1,
  },
  authorMetaLight: {
    color: "rgba(255,255,255,0.55)",
  },
  chip: {
    flexShrink: 0,
    backgroundColor: T.mint,
    borderRadius: 999,
    paddingHorizontal: sw(7),
    paddingVertical: sw(2),
  },
  chipDark: {
    backgroundColor: "rgba(20,184,166,0.2)",
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9),
    color: T.deepTeal,
    fontWeight: "600",
  },
  chipTextDark: {
    color: T.teal,
  },
  chipWarn: { backgroundColor: "rgba(217, 119, 6, 0.12)" },
  chipWarnText: { color: "#D97706" },
  sensitiveWrap: {
    paddingVertical: sw(4),
    overflow: "hidden",
  },
  bodyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12.5),
    lineHeight: sf(17),
    color: T.navy,
    marginBottom: sw(4),
  },
  engagementBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: sw(6),
    paddingTop: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
  },
  engagementBarDark: {
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  engBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  engCount: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: T.gray,
    fontWeight: "600",
  },
  engCountLight: {
    color: "rgba(255,255,255,0.6)",
  },
});
