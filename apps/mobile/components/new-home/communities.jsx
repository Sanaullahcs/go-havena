import {
  Text,
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Animated,
  Platform,
  FlatList,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LIKE_HEART_RED } from "../feed/feed-engagement";
import UserAvatar from "../ui/user-avatar";
import CrispImage from "../ui/crisp-image";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { TOPIC_LABEL_KEY } from "../../services/feed-api";
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
import SharePostSheet from "../feed/share-post-sheet";
import { openNeighborProfile } from "../../services/profile-api";
import { useNow } from "../../hooks/use-now";
import { sw, sf } from "../../utils/responsive";
import { navigateAppRoute } from "../../utils/app-navigation";

const COMMUNITY_FEED_ROUTE = "/screens/community-feed";

function formatCount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

const CARD_GAP = sw(12);
const PEEK = sw(40);
const IMAGE_RATIO = 0.48;
const BOTTOM_AREA_H = sw(140);

function FeedCard({
  post,
  width,
  height,
  imageH,
  onPress,
  onComments,
  onLike,
  onShare,
  onProfile,
  now,
}) {
  const { t, i18n } = useTranslation();
  const authorName = post.user?.display_name ?? post.user?.name ?? t("feed.neighbor");
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
    : display.mainText || (display.hasImage ? t("feed.sharedPhoto") : "");
  const hasImage = !sensitive && display.hasImage;
  const isTextOnly = !hasImage && !sensitive;
  const showImageCaption = hasImage && Boolean(bodyText) && bodyText !== t("feed.sharedPhoto");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width, minHeight: height }, pressed && styles.cardPressed]}
    >
      <View style={[styles.cardInner, { minHeight: height }]}>
        {hasImage ? (
          <View style={[styles.imageWrap, { height: imageH }]}>
            <CrispImage
              source={post.image_url}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="center"
            />
          </View>
        ) : null}

        {isTextOnly && bodyText ? (
          <View style={[styles.quoteBlock, { height: imageH }]}>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={sf(20)}
              color="rgba(20,184,166,0.55)"
              style={styles.quoteIcon}
            />
            <Text style={styles.quoteText} numberOfLines={4}>
              {bodyText}
            </Text>
          </View>
        ) : null}

        <View style={[styles.contentArea, { minHeight: BOTTOM_AREA_H }]}>
          <Pressable style={styles.authorRow} onPress={onProfile} hitSlop={6}>
            <UserAvatar
              source={post.user?.avatar}
              name={authorName}
              size={sw(30)}
              style={styles.avatar}
            />
            <View style={styles.authorCopy}>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorName}
              </Text>
              <Text style={styles.authorMeta} numberOfLines={1}>
                {relativeTime}
                {post.author_unit ? ` · ${t("nav.unit", { number: post.author_unit })}` : ""}
              </Text>
            </View>
            {sensitive ? (
              <View style={[styles.chip, styles.chipWarn]}>
                <Text style={[styles.chipText, styles.chipWarnText]}>{t("feed.sensitive")}</Text>
              </View>
            ) : post.tag ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{TOPIC_LABEL_KEY[post.tag] ? t(TOPIC_LABEL_KEY[post.tag]) : post.tag}</Text>
              </View>
            ) : null}
          </Pressable>

          {sensitive ? (
            <View style={styles.sensitiveWrap}>
              <FeedSensitiveContent compact />
            </View>
          ) : null}

          {showImageCaption ? (
            <Text style={styles.bodyText} numberOfLines={2}>
              {bodyText}
            </Text>
          ) : (
            <View style={styles.bodySpacer} />
          )}
<View style={styles.engagementBar}>
            <Pressable style={styles.engBtn} onPress={onLike} disabled={sensitive}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={sf(18)}
                  color={sensitive ? T.border : isLiked ? LIKE_HEART_RED : T.navy}
                />
              </Animated.View>
              <Text style={[styles.engCount, isLiked && !sensitive && { color: LIKE_HEART_RED }]}>
                {likeCount}
              </Text>
            </Pressable>
            <Pressable style={styles.engBtn} onPress={onComments} disabled={sensitive}>
              <Ionicons
                name="chatbubble-outline"
                size={sf(17)}
                color={sensitive ? T.border : T.gray}
              />
              <Text style={styles.engCount}>{commentCount}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              style={styles.engBtn}
              hitSlop={8}
              onPress={onShare}
              disabled={sensitive}
            >
              <Ionicons
                name="share-outline"
                size={sf(18)}
                color={sensitive ? T.border : T.gray}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function Communities({ posts = [], onPostsChange }) {
  const router = useRouter();
  const { t } = useTranslation();
  const now = useNow(30000);
  const [sharePost, setSharePost] = useState(null);
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
      const previous = posts;
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

  const handleShare = useCallback((post) => {
    setSharePost(post);
  }, []);

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ width: layout.cardWidth, minHeight: layout.cardHeight, flexShrink: 0 }}>
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
          onShare={() => handleShare(item)}
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
    [layout.cardWidth, layout.cardHeight, layout.imageH, now, router, handleLike, handleShare],
  );

  if (posts.length === 0) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader
          label={t("community.feed")}
          onPress={() => navigateAppRoute(router, COMMUNITY_FEED_ROUTE)}
        />
        <HomeSectionEmpty
          message={t("common.noResults")}
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label={t("community.feed")}
        onPress={() => navigateAppRoute(router, COMMUNITY_FEED_ROUTE)}
      />
      <FlatList
        data={posts}
        horizontal
        style={[styles.carousel, { minHeight: layout.cardHeight }]}
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
      <SharePostSheet
        visible={Boolean(sharePost)}
        post={sharePost}
        onClose={() => setSharePost(null)}
      />
    </View>
  );
}

const RADIUS = sw(16);

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingEnd: PEEK, alignItems: "flex-start" },
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
  imageWrap: {
    width: "100%",
    backgroundColor: T.canvas,
  },
  quoteBlock: {
    width: "100%",
    paddingHorizontal: sw(18),
    paddingTop: sw(18),
    paddingBottom: sw(10),
    backgroundColor: T.white,
  },
  quoteIcon: {
    marginBottom: sw(8),
  },
  quoteText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14.5),
    lineHeight: sf(21),
    color: T.navy,
    fontWeight: "500",
    writingDirection: "auto",
  },
  contentArea: {
    paddingHorizontal: sw(14),
    paddingTop: sw(10),
    paddingBottom: sw(10),
    flexDirection: "column",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: sw(6),
  },
  avatar: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(15),
    marginEnd: sw(8),
  },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    fontFamily: Fonts.bold,
    fontSize: sf(12.5),
    lineHeight: sf(16),
    color: T.navy,
    fontWeight: "700",
    writingDirection: "auto",
  },
  authorMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: T.gray,
    marginTop: 1,
    writingDirection: "auto",
  },
  chip: {
    flexShrink: 0,
    backgroundColor: T.mint,
    borderRadius: 999,
    paddingHorizontal: sw(7),
    paddingVertical: sw(2),
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9),
    color: T.deepTeal,
    fontWeight: "600",
  },
  chipWarn: { backgroundColor: "rgba(217, 119, 6, 0.12)" },
  chipWarnText: { color: "#D97706" },
  sensitiveWrap: {
    paddingVertical: sw(4),
    overflow: "hidden",
    marginBottom: sw(4),
  },
  bodyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12.5),
    lineHeight: sf(17),
    color: T.navy,
    marginBottom: sw(8),
    flexShrink: 1,
    writingDirection: "auto",
  },
  bodySpacer: {
    marginBottom: sw(8),
  },
  engagementBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: "auto",
    paddingTop: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
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
});
