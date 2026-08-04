import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, useWindowDimensions, Platform } from "react-native";
import { Home } from "../../constants/home-styles";
import { sw, sf, hp } from "../../utils/responsive";

const SHIMMER_TONES = {
  default: { color: "#E2E8F0", min: 0.38, max: 0.82 },
  soft: { color: "#F1F5F9", min: 0.45, max: 0.9 },
  card: { color: "#E5E7EB", min: 0.4, max: 0.78 },
  brand: { color: "rgba(20, 184, 166, 0.28)", min: 0.35, max: 0.88 },
  hero: { color: "rgba(255,255,255,0.28)", min: 0.25, max: 0.62 },
  amber: { color: "#FDE68A", min: 0.42, max: 0.82 },
  mint: { color: "#A7F3D0", min: 0.42, max: 0.82 },
  photo: { color: "#E2E8F0", min: 0.4, max: 0.78 },
};

const MP_CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

function ShimmerBlock({ style, tone = "default", delay = 0 }) {
  const opacity = useRef(new Animated.Value(SHIMMER_TONES[tone]?.min ?? 0.38)).current;
  const palette = SHIMMER_TONES[tone] ?? SHIMMER_TONES.default;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: palette.max,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: palette.min,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [opacity, palette.max, palette.min, delay]);

  return (
    <Animated.View
      style={[styles.block, { backgroundColor: palette.color }, style, { opacity }]}
    />
  );
}

export function SkeletonLine({ width = "100%", height = 14, style, tone = "default", delay = 0 }) {
  return (
    <ShimmerBlock
      tone={tone}
      delay={delay}
      style={[{ width, height, borderRadius: height / 2 }, style]}
    />
  );
}

export function SkeletonCircle({ size = 48, style, tone = "default" }) {
  return (
    <ShimmerBlock
      tone={tone}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

export function SkeletonCard({ height = 120, style }) {
  return <ShimmerBlock style={[{ height, borderRadius: 14, width: "100%" }, style]} />;
}

/** Marketplace hub loading state */
export function MarketplaceSkeleton() {
  return (
    <View style={styles.wrap}>
      <SkeletonLine width="70%" height={18} />
      <SkeletonLine width="40%" height={12} style={{ marginTop: 8 }} />
      <SkeletonCard height={48} style={{ marginTop: 20 }} />
      <View style={styles.grid}>
        <SkeletonCard height={140} style={styles.gridItem} />
        <SkeletonCard height={140} style={styles.gridItem} />
        <SkeletonCard height={140} style={styles.gridItem} />
        <SkeletonCard height={140} style={styles.gridItem} />
      </View>
      <SkeletonLine width="50%" height={16} style={{ marginTop: 8 }} />
      <FeaturedDealsSkeleton count={2} />
      <PopularNearbySkeleton count={4} style={{ marginTop: 12 }} />
    </View>
  );
}

const MP_DEAL_PALETTES = [
  {
    bg: "#FFFBEB",
    border: "#FEF3C7",
    imageBorder: "#FDE68A",
    tagBg: "#FEE685",
    glow: "rgba(254, 230, 133, 0.45)",
    accent: "#FBBF24",
    shimmer: "amber",
  },
  {
    bg: "#ECFDF5",
    border: "#D1FAE5",
    imageBorder: "#A7F3D0",
    tagBg: "#A4F4CF",
    glow: "rgba(167, 243, 208, 0.5)",
    accent: "#34D399",
    shimmer: "mint",
  },
];

const MP_DEAL_BADGE_WIDTHS = [76, 88, 72];

function MpDealMetaChipSkeleton({ width, tone = "soft", delay = 0 }) {
  return (
    <View style={styles.mpDealMetaChip}>
      <ShimmerBlock tone={tone} style={styles.mpDealMetaIcon} delay={delay} />
      <SkeletonLine width={width} height={9} tone="soft" delay={delay + 40} />
    </View>
  );
}

function MpPopularStarsSkeleton({ delay = 0 }) {
  return (
    <View style={styles.mpPopularRatingRow}>
      {[0, 1, 2, 3, 4].map((star) => (
        <ShimmerBlock
          key={star}
          tone={star < 4 ? "amber" : "soft"}
          style={styles.mpPopularStarDot}
          delay={delay + star * 35}
        />
      ))}
      <SkeletonLine width={26} height={10} tone="card" style={{ marginLeft: 2 }} delay={delay + 80} />
    </View>
  );
}

function FeaturedDealCardSkeleton({ index, isLast }) {
  const palette = MP_DEAL_PALETTES[index % MP_DEAL_PALETTES.length];
  const stagger = index * 140;

  return (
    <View
      style={[
        styles.mpDealCard,
        MP_CARD_SHADOW,
        { backgroundColor: palette.bg, borderColor: palette.border },
        !isLast && styles.mpDealCardSpacing,
      ]}
    >
      <View style={[styles.mpDealGlow, { backgroundColor: palette.glow }]} />
      <View style={[styles.mpDealAccentBar, { backgroundColor: palette.accent }]} />

      <View style={styles.mpDealBadgeShell}>
        <ShimmerBlock
          tone={palette.shimmer}
          style={[
            styles.mpDealBadge,
            { width: MP_DEAL_BADGE_WIDTHS[index % MP_DEAL_BADGE_WIDTHS.length] },
          ]}
          delay={stagger}
        />
      </View>

      <View style={styles.mpDealTopRow}>
        <View style={[styles.mpDealImageShell, { borderColor: palette.imageBorder }]}>
          <ShimmerBlock tone="photo" style={styles.mpDealImageFill} delay={stagger + 60} />
          <ShimmerBlock tone="hero" style={styles.mpDealImageShine} delay={stagger + 120} />
        </View>

        <View style={styles.mpDealBody}>
          <SkeletonLine width="88%" height={16} tone="card" delay={stagger + 30} />
          <SkeletonLine width="100%" height={10} tone="soft" style={{ marginTop: 8 }} delay={stagger + 70} />
          <SkeletonLine width="74%" height={10} tone="soft" style={{ marginTop: 5 }} delay={stagger + 100} />
          <View style={styles.mpDealMetaRow}>
            <MpDealMetaChipSkeleton width={52} tone={palette.shimmer} delay={stagger + 130} />
            <MpDealMetaChipSkeleton width={46} tone={palette.shimmer} delay={stagger + 160} />
          </View>
        </View>
      </View>
    </View>
  );
}

function PopularNearbyCardSkeleton({ index, cardW }) {
  const stagger = index * 110;
  const nameWidths = ["84%", "76%", "88%", "72%"];
  const metaLeft = [58, 48, 62, 52];
  const imageHeights = [112, 104, 112, 108];

  return (
    <View style={[styles.mpPopularCard, MP_CARD_SHADOW, { width: cardW }]}>
      <View style={[styles.mpPopularImageWrap, { height: imageHeights[index % imageHeights.length] }]}>
        <ShimmerBlock tone="photo" style={styles.mpPopularImageFill} delay={stagger} />
        <View style={[styles.mpPopularImageGradient, { backgroundColor: "rgba(15, 23, 42, 0.12)" }]} />
        <View style={styles.mpPopularCategoryChipWrap}>
          <ShimmerBlock tone="brand" style={styles.mpPopularCategoryChip} delay={stagger + 50} />
        </View>
        <ShimmerBlock tone="soft" style={styles.mpPopularHeart} delay={stagger + 80} />
      </View>

      <View style={styles.mpPopularBody}>
        <SkeletonLine
          width={nameWidths[index % nameWidths.length]}
          height={15}
          tone="card"
          delay={stagger + 40}
        />
        <MpPopularStarsSkeleton delay={stagger + 70} />
        <View style={styles.mpPopularMetaRow}>
          <SkeletonLine width={metaLeft[index % metaLeft.length]} height={9} tone="soft" delay={stagger + 100} />
          <View style={styles.mpPopularMetaDot} />
          <SkeletonLine width={36} height={9} tone="soft" delay={stagger + 120} />
        </View>
      </View>
    </View>
  );
}

/** Featured deals list — alternating yellow/green cards with badge + image row */
export function FeaturedDealsSkeleton({ count = 3 }) {
  return (
    <View style={styles.mpDealList}>
      {Array.from({ length: count }).map((_, index) => (
        <FeaturedDealCardSkeleton
          key={index}
          index={index}
          isLast={index === count - 1}
        />
      ))}
    </View>
  );
}

/** Popular nearby grid — white cards with image, name, rating, meta */
export function PopularNearbySkeleton({ count = 4, style }) {
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - 48 - 12) / 2);

  return (
    <View style={[styles.mpPopularGrid, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <PopularNearbyCardSkeleton key={index} index={index} cardW={cardW} />
      ))}
    </View>
  );
}

/** Home section placeholder */
export function HomeSectionSkeleton({ cardHeight = 118 }) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.wrap}>
      <SkeletonLine width={120} height={12} />
      <SkeletonCard height={cardHeight} style={{ marginTop: 10, width: width - 48 }} />
    </View>
  );
}

/** Profile screen — avatar, info, points card, stats grid */
export function ProfileSkeleton() {
  return (
    <>
      {/* Identity card */}
      <View style={styles.profileIdentityCard}>
        <SkeletonCircle size={sw(84)} tone="soft" />
        <SkeletonLine width={sw(150)} height={sf(18)} style={{ marginTop: sw(12) }} />
        <SkeletonLine width={sw(96)} height={sf(20)} tone="brand" style={{ marginTop: sw(10), borderRadius: 999 }} />
        <SkeletonLine width={sw(120)} height={sf(11)} tone="soft" style={{ marginTop: sw(10) }} />

        <View style={styles.profileDivider} />

        <View style={styles.profilePlaceRow}>
          <SkeletonCircle size={sw(40)} tone="brand" style={{ borderRadius: sw(12) }} />
          <View style={styles.profilePlaceCopy}>
            <SkeletonLine width={sw(70)} height={sf(9)} tone="soft" />
            <SkeletonLine width="60%" height={sf(13)} style={{ marginTop: sw(6) }} />
            <SkeletonLine width="42%" height={sf(11)} tone="soft" style={{ marginTop: sw(6) }} />
          </View>
        </View>
      </View>

      {/* Activity */}
      <View style={styles.profileSection}>
        <SkeletonLine width={sw(70)} height={sf(11)} tone="brand" style={styles.profileSectionLabel} />
        <View style={styles.profileListCard}>
          {[0, 1, 2, 3].map((key) => (
            <View
              key={key}
              style={[styles.profileRow, key < 3 && styles.profileRowBorder]}
            >
              <SkeletonCircle size={sw(34)} tone="brand" style={{ borderRadius: sw(10) }} />
              <SkeletonLine width="45%" height={sf(13)} style={{ flex: 1 }} />
              <SkeletonLine width={sw(44)} height={sf(13)} tone="soft" />
            </View>
          ))}
        </View>
      </View>

      {/* Achievements */}
      <View style={styles.profileSection}>
        <SkeletonLine width={sw(96)} height={sf(11)} tone="brand" style={styles.profileSectionLabel} />
        <View style={styles.profileAchievementsRow}>
          {[0, 1, 2].map((key) => (
            <View key={key} style={styles.profileAchievementCard}>
              <SkeletonCircle size={sw(42)} tone="brand" style={{ borderRadius: sw(13) }} />
              <SkeletonLine width={sw(52)} height={sf(11)} style={{ marginTop: sw(8) }} />
            </View>
          ))}
        </View>
      </View>

      {/* Quick access */}
      <View style={styles.profileSection}>
        <SkeletonLine width={sw(84)} height={sf(11)} tone="brand" style={styles.profileSectionLabel} />
        <View style={styles.profileListCard}>
          {[0, 1, 2].map((key) => (
            <View
              key={key}
              style={[styles.profileRowTall, key < 2 && styles.profileRowBorder]}
            >
              <SkeletonCircle size={sw(38)} tone="brand" style={{ borderRadius: sw(11) }} />
              <View style={styles.profileRowCopy}>
                <SkeletonLine width="55%" height={sf(13)} />
                <SkeletonLine width="75%" height={sf(11)} tone="soft" style={{ marginTop: sw(6) }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

/** Points history — summary cards + activity rows */
export function PointsHistorySkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <SkeletonCard height={88} style={styles.summaryItem} />
        <SkeletonCard height={88} style={styles.summaryItem} />
      </View>
      <SkeletonLine width={110} height={12} style={{ marginBottom: 16 }} />
      {[0, 1, 2, 3, 4].map((key) => (
        <View key={key} style={styles.activitySkeletonRow}>
          <SkeletonCircle size={40} style={{ borderRadius: 10 }} />
          <View style={styles.activitySkeletonBody}>
            <SkeletonLine width="70%" height={13} />
            <SkeletonLine width="50%" height={11} style={{ marginTop: 6 }} />
            <SkeletonLine width="35%" height={10} style={{ marginTop: 6 }} />
          </View>
          <SkeletonLine width={36} height={16} />
        </View>
      ))}
      <SkeletonCard height={52} style={{ marginTop: 20 }} />
    </View>
  );
}

/** Leaderboard — position card, top performers podium, ranking list */
export function LeaderboardSkeleton() {
  return (
    <View style={styles.leaderBody}>
      {/* Position card */}
      <View style={styles.leaderCard}>
        <View style={styles.leaderPositionTop}>
          <SkeletonLine width={sw(90)} height={sf(11)} tone="soft" />
          <SkeletonLine width={sw(96)} height={sf(20)} tone="brand" style={{ borderRadius: 999 }} />
        </View>
        <View style={styles.leaderPositionBody}>
          <SkeletonCircle size={sw(52)} tone="soft" />
          <View style={{ flex: 1, gap: sw(6) }}>
            <SkeletonLine width="55%" height={sf(15)} />
            <SkeletonLine width="35%" height={sf(12)} tone="soft" />
          </View>
          <View style={{ alignItems: "flex-end", gap: sw(6) }}>
            <SkeletonLine width={sw(40)} height={sf(20)} tone="brand" />
            <SkeletonLine width={sw(56)} height={sf(12)} tone="soft" />
          </View>
        </View>
      </View>

      {/* Podium */}
      <View style={styles.leaderCard}>
        <View style={styles.statsHeading}>
          <SkeletonCircle size={sw(18)} tone="brand" />
          <SkeletonLine width={sw(110)} height={sf(14)} />
        </View>
        <View style={styles.leaderPodium}>
          <View style={styles.leaderPodiumCol}>
            <SkeletonCircle size={sw(56)} tone="soft" />
            <SkeletonLine width={sw(48)} height={sf(11)} style={{ marginTop: sw(8) }} />
          </View>
          <View style={[styles.leaderPodiumCol, { marginBottom: sw(14) }]}>
            <SkeletonCircle size={sw(72)} tone="brand" />
            <SkeletonLine width={sw(52)} height={sf(11)} style={{ marginTop: sw(8) }} />
          </View>
          <View style={styles.leaderPodiumCol}>
            <SkeletonCircle size={sw(56)} tone="soft" />
            <SkeletonLine width={sw(48)} height={sf(11)} style={{ marginTop: sw(8) }} />
          </View>
        </View>
      </View>

      {/* Rankings list */}
      <View style={styles.leaderCard}>
        <View style={styles.statsHeading}>
          <SkeletonCircle size={sw(18)} tone="brand" />
          <SkeletonLine width={sw(140)} height={sf(14)} />
        </View>
        <View style={{ marginTop: sw(14), gap: sw(8) }}>
          {[0, 1, 2, 3, 4].map((key) => (
            <View key={key} style={styles.leaderListRow}>
              <SkeletonCircle size={sw(28)} tone="soft" style={{ borderRadius: sw(9) }} />
              <SkeletonCircle size={sw(40)} tone="soft" />
              <View style={{ flex: 1, gap: sw(6) }}>
                <SkeletonLine width="50%" height={sf(13)} />
                <SkeletonLine width="32%" height={sf(11)} tone="soft" />
              </View>
              <SkeletonLine width={sw(36)} height={sf(14)} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Notice board — featured hero + list cards */
export function NoticeBoardSkeleton() {
  return (
    <View style={styles.noticeSkeletonWrap}>
      <SkeletonCard height={120} style={{ marginHorizontal: 18, marginTop: 12 }} />
      <View style={styles.noticeStatsRow}>
        <SkeletonCard height={72} style={styles.noticeStatItem} />
        <SkeletonCard height={72} style={styles.noticeStatItem} />
        <SkeletonCard height={72} style={styles.noticeStatItem} />
      </View>
      <SkeletonLine width="88%" height={40} style={{ marginHorizontal: 18, marginTop: 14, borderRadius: 12 }} />
      <View style={styles.noticeTabsRow}>
        <SkeletonLine width={70} height={32} style={{ borderRadius: 12 }} />
        <SkeletonLine width={80} height={32} style={{ borderRadius: 12 }} />
        <SkeletonLine width={72} height={32} style={{ borderRadius: 12 }} />
      </View>
      {Array.from({ length: 3 }).map((_, key) => (
        <View key={key} style={styles.noticeCardSkeleton}>
          <SkeletonCircle size={40} style={{ borderRadius: 11 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonLine width="80%" height={14} />
            <SkeletonLine width="100%" height={11} />
            <SkeletonLine width="65%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Community feed — post cards */
export function CommunityFeedSkeleton({ count = 3 }) {
  return (
    <View style={styles.feedSkeletonWrap}>
      {Array.from({ length: count }).map((_, key) => (
        <View key={key} style={styles.feedCardSkeleton}>
          <View style={styles.feedUserRow}>
            <SkeletonCircle size={36} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLine width="45%" height={13} />
              <SkeletonLine width="30%" height={11} />
            </View>
          </View>
          <SkeletonLine width="100%" height={12} style={{ marginTop: 10 }} />
          <SkeletonLine width="92%" height={12} style={{ marginTop: 6 }} />
          <SkeletonLine width="60%" height={12} style={{ marginTop: 6 }} />
          <View style={styles.feedStatsRow}>
            <SkeletonLine width={40} height={11} />
            <SkeletonLine width={40} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

function MyPostCardSkeleton({ isLast = false }) {
  return (
    <View style={[styles.myPostCardSimple, isLast && styles.myPostCardSimpleLast]}>
      <View style={styles.feedUserRow}>
        <SkeletonCircle size={sw(42)} />
        <View style={styles.myPostCardCopy}>
          <SkeletonLine width="48%" height={sf(13)} />
          <SkeletonLine width="32%" height={sf(11)} tone="soft" />
        </View>
      </View>
      <SkeletonLine width="100%" height={sf(12)} style={{ marginTop: sw(10) }} />
      <SkeletonLine width="86%" height={sf(12)} style={{ marginTop: sw(6) }} />
      <View style={styles.feedStatsRow}>
        <SkeletonLine width={sw(40)} height={sf(11)} />
        <SkeletonLine width={sw(40)} height={sf(11)} />
      </View>
    </View>
  );
}

/** My Posts — simple loading placeholders */
export function MyPostsSkeleton({ count = 3 }) {
  return (
    <View style={styles.myPostsWrap}>
      <View style={styles.myPostsSummarySimple}>
        <SkeletonCircle size={sw(50)} />
        <View style={styles.myPostCardCopy}>
          <SkeletonLine width="52%" height={sf(14)} />
          <SkeletonLine width="36%" height={sf(11)} tone="soft" />
        </View>
        <SkeletonCircle size={sw(40)} />
      </View>

      <SkeletonLine width={sw(72)} height={sf(11)} tone="soft" style={styles.myPostsSectionLabel} />

      {Array.from({ length: count }).map((_, index) => (
        <MyPostCardSkeleton key={index} isLast={index === count - 1} />
      ))}
    </View>
  );
}

function HelpRequestCardSkeleton({ index = 0 }) {
  const stagger = index * 60;

  return (
    <View style={styles.helpCardShell}>
      <View style={styles.helpCardBody}>
        <View style={styles.helpCardHeader}>
          <View style={styles.helpAuthorBlock}>
            <SkeletonCircle size={sw(36)} tone="soft" delay={stagger} />
            <View style={styles.helpAuthorCopy}>
              <SkeletonLine width="52%" height={sf(12)} delay={stagger + 20} />
              <SkeletonLine width="64%" height={sf(10)} tone="soft" delay={stagger + 40} />
            </View>
          </View>
          <SkeletonLine
            width={sw(44)}
            height={sw(22)}
            tone="soft"
            style={styles.helpStatusPill}
            delay={stagger + 25}
          />
        </View>

        <SkeletonLine
          width={sw(92)}
          height={sw(22)}
          tone="brand"
          style={styles.helpTagPill}
          delay={stagger + 50}
        />

        <View style={styles.helpContentLines}>
          <SkeletonLine width="100%" height={sf(11)} delay={stagger + 65} />
          <SkeletonLine width="78%" height={sf(11)} delay={stagger + 80} />
        </View>

        <View style={styles.helpCardFooter}>
          <SkeletonLine
            width={sw(78)}
            height={sw(28)}
            tone="brand"
            style={styles.helpRespondPill}
            delay={stagger + 95}
          />
        </View>
      </View>
    </View>
  );
}

/** Neighborhood Help — compact placeholder matching HelpCard structure. */
export function NeighborhoodHelpSkeleton({ count = 2 }) {
  return (
    <View style={styles.helpSkeletonWrap}>
      {Array.from({ length: count }).map((_, index) => (
        <HelpRequestCardSkeleton key={index} index={index} />
      ))}
    </View>
  );
}

/** Full home tab — matches notices hero, quick actions, and section carousels */
export function HomeScreenSkeleton() {
  const { width } = useWindowDimensions();
  const cardWidth = width - Home.gutter * 2;
  const carouselCardWidth = Math.floor((cardWidth - sw(10) - sw(24)) / 2);
  const heroHeight = hp(13);
  const thumbSize = sw(72);

  return (
    <View style={styles.homeSkeletonWrap}>
      <View style={[styles.homeHeroShell, { width: cardWidth, height: heroHeight }]}>
        <View style={styles.homeHeroInner}>
          <View style={styles.homeHeroCopy}>
            <SkeletonLine width={sw(78)} height={sf(18)} tone="hero" style={styles.homeHeroBadge} />
            <SkeletonLine width="94%" height={sf(15)} tone="hero" style={{ marginTop: hp(0.55) }} />
            <SkeletonLine width="78%" height={sf(15)} tone="hero" style={{ marginTop: 6 }} />
            <SkeletonLine width="52%" height={sf(11)} tone="hero" style={{ marginTop: hp(0.45) }} />
          </View>
          <ShimmerBlock
            tone="hero"
            style={{ width: thumbSize, height: thumbSize, borderRadius: sw(11) }}
          />
        </View>
      </View>

      <View style={styles.homeDotsRow}>
        <ShimmerBlock tone="hero" style={styles.homeDotActive} />
        <ShimmerBlock tone="hero" style={styles.homeDot} />
        <ShimmerBlock tone="hero" style={styles.homeDot} />
      </View>

      <View style={styles.homeQuickActionsBlock}>
        <SkeletonLine width={sw(96)} height={sf(10)} tone="brand" style={styles.homeSectionLabel} />
        <View style={styles.homeChipRow}>
          {[0, 1, 2, 3, 4].map((key) => (
            <View key={key} style={styles.homeChipSkeleton}>
              <ShimmerBlock tone="soft" style={styles.homeChipIcon} />
              <SkeletonLine width={sw(44)} height={sf(10)} tone="soft" />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.homeSectionBlock}>
        <HomeSkeletonSectionHeader />
        <HomeEventCardSkeleton width={cardWidth} />
      </View>

      <View style={styles.homeSectionBlock}>
        <HomeSkeletonSectionHeader labelWidth={sw(118)} />
        <HomeFeedCardSkeleton width={cardWidth} />
      </View>

      <View style={styles.homeSectionBlock}>
        <HomeSkeletonSectionHeader labelWidth={sw(102)} />
        <View style={styles.homeDealRow}>
          <HomeDealCardSkeleton width={carouselCardWidth} />
          <HomeDealCardSkeleton width={carouselCardWidth} peek />
        </View>
      </View>

      <View style={styles.homeSectionBlock}>
        <HomeSkeletonSectionHeader labelWidth={sw(88)} />
        <View style={styles.homeDealRow}>
          <HomeMiniCardSkeleton width={carouselCardWidth} showProgress />
          <HomeMiniCardSkeleton width={carouselCardWidth} peek showProgress />
        </View>
      </View>

      <View style={[styles.homeSectionBlock, styles.homeSectionBlockLast]}>
        <HomeSkeletonSectionHeader labelWidth={sw(156)} />
        <View style={styles.homeDealRow}>
          <HomeMiniCardSkeleton width={carouselCardWidth} />
          <HomeMiniCardSkeleton width={carouselCardWidth} peek />
        </View>
      </View>
    </View>
  );
}

function HomeSkeletonSectionHeader({ labelWidth = sw(110) }) {
  return (
    <View style={styles.homeSectionHeader}>
      <SkeletonLine width={labelWidth} height={sf(10)} tone="brand" />
      <ShimmerBlock tone="soft" style={styles.homeSectionArrow} />
    </View>
  );
}

function HomeEventCardSkeleton({ width }) {
  return (
    <View style={[styles.homeWhiteCard, { width }]}>
      <ShimmerBlock tone="card" style={styles.homeEventThumb} />
      <View style={styles.homeEventBody}>
        <SkeletonLine width="88%" height={sf(13)} tone="card" />
        <SkeletonLine width="72%" height={sf(11)} tone="soft" style={{ marginTop: 8 }} />
        <SkeletonLine width="56%" height={sf(11)} tone="soft" style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

function HomeDealCardSkeleton({ width, peek = false }) {
  return (
    <View style={[styles.homeDealCard, { width }, peek && styles.homeDealCardPeek]}>
      <ShimmerBlock tone="card" style={styles.homeDealImage} />
      <View style={styles.homeDealBody}>
        <SkeletonLine width="90%" height={sf(12)} tone="card" />
        <SkeletonLine width="62%" height={sf(10)} tone="soft" style={{ marginTop: 8 }} />
        <ShimmerBlock tone="brand" style={styles.homeDealBtn} />
      </View>
    </View>
  );
}

function HomeMiniCardSkeleton({ width, peek = false, showProgress = false }) {
  return (
    <View style={[styles.homeMiniCard, { width }, peek && styles.homeDealCardPeek]}>
      <ShimmerBlock tone="soft" style={styles.homeMiniIcon} />
      <View style={styles.homeMiniCopy}>
        <SkeletonLine width="82%" height={sf(12)} tone="card" />
        <SkeletonLine width="64%" height={sf(10)} tone="soft" style={{ marginTop: 6 }} />
        {showProgress ? (
          <ShimmerBlock tone="soft" style={styles.homeMiniProgress} />
        ) : null}
      </View>
    </View>
  );
}

/** Home feed carousel card */
export function HomeFeedCardSkeleton({ width }) {
  return (
    <View style={[styles.feedCardSkeleton, { width, height: Home.feedCardHeight }]}>
      <View style={styles.feedUserRow}>
        <SkeletonCircle size={sw(32)} tone="card" />
        <View style={{ flex: 1, gap: 4 }}>
          <SkeletonLine width="48%" height={sf(12)} tone="card" />
          <SkeletonLine width="62%" height={sf(10)} tone="soft" />
        </View>
        <SkeletonLine width={sw(42)} height={sf(18)} tone="brand" style={{ borderRadius: 999 }} />
      </View>
      <SkeletonLine width="100%" height={sf(11)} tone="soft" style={{ marginTop: 8 }} />
      <SkeletonLine width="84%" height={sf(11)} tone="soft" style={{ marginTop: 4 }} />
      <View style={{ marginTop: "auto" }}>
        <View style={styles.feedStatsRow}>
          <SkeletonLine width={sw(36)} height={sf(10)} tone="soft" />
          <SkeletonLine width={sw(36)} height={sf(10)} tone="soft" />
        </View>
      </View>
    </View>
  );
}

/** Sidebar wellness hub menu rows — matches blue wellness container + white icon slots */
export function AdminDashboardSkeleton() {
  const rowLabelWidths = [sw(88), sw(104), sw(118), sw(132), sw(96), sw(72)];

  return (
    <View style={styles.adminDashSkeleton}>
      <View style={styles.adminDashStatusRow}>
        <SkeletonCircle size={sw(44)} tone="soft" />
        <View style={styles.adminDashStatusCopy}>
          <SkeletonLine width="78%" height={sf(20)} delay={0} />
          <SkeletonLine width="48%" height={sf(12)} style={{ marginTop: sw(8) }} delay={40} />
        </View>
      </View>

      <View style={styles.adminDashStatGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.adminDashStatCol}>
            <SkeletonCard height={sw(84)} style={{ width: "100%" }} />
          </View>
        ))}
      </View>

      <View style={styles.adminDashBlock}>
        <View style={styles.adminDashSectionHead}>
          <SkeletonLine width={sw(56)} height={sf(13)} delay={80} />
          <SkeletonLine width={sw(52)} height={sf(11)} tone="soft" delay={100} />
        </View>
        <View style={styles.adminDashListCard}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[styles.adminDashListRow, i === 0 && styles.adminDashListRowBorder]}
            >
              <SkeletonCircle size={sw(36)} tone="soft" />
              <View style={{ flex: 1, marginLeft: sw(12), minWidth: 0 }}>
                <SkeletonLine width="72%" height={sf(13)} delay={90 + i * 20} />
                <SkeletonLine
                  width="44%"
                  height={sf(10)}
                  tone="soft"
                  style={{ marginTop: sw(6) }}
                  delay={100 + i * 20}
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.adminDashBlock}>
        <View style={styles.adminDashSectionHead}>
          <SkeletonLine width={sw(64)} height={sf(13)} delay={120} />
          <SkeletonLine width={sw(88)} height={sf(11)} tone="soft" delay={140} />
        </View>
        <View style={styles.adminDashListCard}>
          {rowLabelWidths.map((width, index) => (
            <View
              key={index}
              style={[
                styles.adminDashListRow,
                index < rowLabelWidths.length - 1 && styles.adminDashListRowBorder,
              ]}
            >
              <SkeletonCircle size={sw(36)} tone="soft" />
              <SkeletonLine width={width} height={sf(14)} style={{ marginLeft: sw(12), flex: 1 }} />
              <SkeletonLine width={sw(12)} height={sf(14)} tone="soft" style={{ marginLeft: "auto" }} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.adminDashBlockLast}>
        <View style={styles.adminDashSectionHead}>
          <SkeletonLine width={sw(52)} height={sf(13)} delay={160} />
          <SkeletonLine width={sw(96)} height={sf(11)} tone="soft" delay={180} />
        </View>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard
            key={i}
            height={sw(64)}
            style={i < 4 ? styles.adminDashCreateGap : null}
          />
        ))}
      </View>
    </View>
  );
}

export function SidebarWellnessHubSkeleton({ count = 5 }) {
  const labelWidths = [118, 132, 104, 126, 112];

  return (
    <View style={styles.sidebarWellnessSkeletonWrap}>
      {Array.from({ length: count }).map((_, key) => (
        <View key={key} style={styles.sidebarWellnessSkeletonRow}>
          <View style={styles.sidebarWellnessIconShell}>
            <SkeletonLine
              width={sw(14)}
              height={sw(14)}
              tone="brand"
              style={styles.sidebarWellnessIconShimmer}
            />
          </View>
          <SkeletonLine
            width={labelWidths[key % labelWidths.length]}
            height={sf(12)}
            tone="brand"
            style={styles.sidebarWellnessTitle}
          />
        </View>
      ))}
    </View>
  );
}

/** Comment thread rows */
export function CommentListSkeleton({ count = 3 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, key) => (
        <View key={key} style={styles.commentSkeletonRow}>
          <View style={styles.commentSkeletonHead}>
            <SkeletonLine width={100} height={13} />
            <SkeletonLine width={48} height={10} />
          </View>
          <SkeletonLine width="92%" height={12} />
          <SkeletonLine width="75%" height={12} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: "#E5E7EB" },
  wrap: { paddingHorizontal: 24, paddingTop: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  gridItem: { width: "48%" },
  profileIdentityCard: {
    marginHorizontal: sw(18),
    marginTop: sw(6),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    paddingTop: sw(22),
    paddingHorizontal: sw(18),
    paddingBottom: sw(6),
    alignItems: "center",
  },
  profileDivider: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 0, 0, 0.07)",
    marginTop: sw(18),
    marginBottom: sw(4),
  },
  profilePlaceRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
  },
  profilePlaceCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileSection: {
    paddingHorizontal: sw(18),
    paddingTop: sw(22),
  },
  profileSectionLabel: {
    marginBottom: sw(12),
  },
  profileListCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    minHeight: sw(56),
  },
  profileRowTall: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(13),
    paddingHorizontal: sw(14),
    minHeight: sw(64),
  },
  profileRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  profileAchievementsRow: {
    flexDirection: "row",
    gap: sw(10),
  },
  profileAchievementCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    paddingVertical: sw(14),
    paddingHorizontal: sw(8),
    alignItems: "center",
  },
  statsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  summaryItem: { flex: 1 },
  activitySkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  activitySkeletonBody: { flex: 1 },
  leaderBody: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    gap: sw(14),
  },
  leaderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
    padding: sw(16),
    gap: sw(14),
  },
  leaderPositionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leaderPositionBody: {
    flexDirection: "row",
    gap: sw(12),
    alignItems: "center",
  },
  leaderPodium: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    marginTop: sw(8),
  },
  leaderPodiumCol: {
    flex: 1,
    alignItems: "center",
  },
  leaderListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    paddingVertical: sw(10),
    paddingHorizontal: sw(12),
  },
  feedSkeletonWrap: { gap: 10 },
  feedCardSkeleton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EDEDED",
    padding: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  helpSkeletonWrap: { gap: 0 },
  helpCardShell: {
    marginBottom: sw(12),
    borderRadius: sw(20),
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  helpCardBody: {
    padding: sw(14),
    gap: sw(8),
    backgroundColor: "#FFFFFF",
  },
  helpCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  helpAuthorBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minWidth: 0,
  },
  helpAuthorCopy: {
    flex: 1,
    minWidth: 0,
    gap: sw(4),
  },
  helpStatusPill: {
    borderRadius: 999,
    flexShrink: 0,
  },
  helpTagPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
  },
  helpContentLines: {
    gap: sw(5),
  },
  helpCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: sw(8),
    marginTop: sw(2),
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  helpRespondPill: {
    borderRadius: 999,
  },
  feedUserRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  feedStatsRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  myPostsWrap: {},
  myPostsSummarySimple: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(16),
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    marginBottom: sw(14),
  },
  myPostsSectionLabel: {
    marginBottom: sw(10),
    borderRadius: 4,
  },
  myPostCardCopy: { flex: 1, gap: sw(6), minWidth: 0 },
  myPostCardSimple: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: sw(14),
    marginBottom: sw(14),
  },
  myPostCardSimpleLast: {
    marginBottom: 0,
  },
  commentSkeletonRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  commentSkeletonHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  noticeSkeletonWrap: { paddingBottom: 24 },
  noticeStatsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  noticeStatItem: { flex: 1, borderRadius: 12 },
  noticeTabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  noticeCardSkeleton: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 18,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEDED",
  },
  homeSkeletonWrap: {
    paddingBottom: sw(24),
  },
  homeHeroShell: {
    marginHorizontal: Home.gutter,
    marginTop: hp(0.5),
    borderRadius: sw(14),
    backgroundColor: "#0A2A43",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  homeHeroInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: sw(16),
    paddingRight: sw(12),
  },
  homeHeroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: sw(12),
  },
  homeHeroBadge: {
    borderRadius: 999,
  },
  homeDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: sw(6),
    marginTop: hp(0.55),
    marginBottom: hp(0.15),
  },
  homeDot: {
    width: sw(6),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: "rgba(20, 184, 166, 0.18)",
  },
  homeDotActive: {
    width: sw(16),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: "rgba(20, 184, 166, 0.35)",
  },
  homeQuickActionsBlock: {
    marginTop: hp(0.35),
    paddingHorizontal: Home.gutter,
  },
  homeSectionLabel: {
    borderRadius: sf(5),
    marginBottom: hp(0.35),
  },
  homeChipRow: {
    flexDirection: "row",
    gap: sw(8),
    paddingTop: hp(0.15),
  },
  homeChipSkeleton: {
    minWidth: sw(78),
    paddingHorizontal: sw(10),
    paddingVertical: hp(0.55),
    borderRadius: sw(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    gap: hp(0.35),
  },
  homeChipIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
  },
  homeSectionBlock: {
    marginTop: Home.sectionGap,
    paddingHorizontal: Home.gutter,
    paddingBottom: Home.sectionCardBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  homeSectionBlockLast: {
    borderBottomWidth: 0,
  },
  homeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: hp(0.25),
  },
  homeSectionArrow: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
  },
  homeWhiteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(12),
    borderRadius: sw(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EDEDED",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  homeEventThumb: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(10),
  },
  homeEventBody: {
    flex: 1,
    minWidth: 0,
  },
  homeDealRow: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: hp(0.25),
  },
  homeDealCard: {
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EDEDED",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  homeDealCardPeek: {
    opacity: 0.72,
  },
  homeDealImage: {
    width: "100%",
    height: Home.dealImageH,
  },
  homeDealBody: {
    padding: sw(12),
    gap: 2,
  },
  homeDealBtn: {
    marginTop: hp(0.55),
    height: sf(28),
    borderRadius: sw(8),
    width: "100%",
  },
  homeMiniCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    padding: sw(12),
    borderRadius: sw(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EDEDED",
    backgroundColor: "#FFFFFF",
  },
  homeMiniIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
  },
  homeMiniCopy: {
    flex: 1,
    minWidth: 0,
  },
  homeMiniProgress: {
    marginTop: hp(0.45),
    height: hp(0.45),
    borderRadius: 999,
    width: "100%",
  },
  homeDealItem: {
    flex: 1,
    borderRadius: 14,
  },
  sidebarMenuSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(4),
    paddingHorizontal: sw(8),
  },
  sidebarWellnessSkeletonWrap: {
    gap: sw(2),
  },
  sidebarWellnessSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(5),
    paddingHorizontal: sw(8),
    borderRadius: sw(12),
  },
  sidebarWellnessIconShell: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(8),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C7E2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(10),
  },
  sidebarWellnessIconShimmer: {
    borderRadius: sw(4),
  },
  sidebarWellnessTitle: {
    flex: 1,
    borderRadius: sf(6),
  },
  adminDashSkeleton: {
    paddingTop: sw(4),
  },
  adminDashStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(14),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  adminDashStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  adminDashStatGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    width: "100%",
    marginBottom: sw(22),
    marginHorizontal: -5,
  },
  adminDashStatCol: {
    width: "25%",
    paddingHorizontal: 5,
  },
  adminDashBlock: {
    marginBottom: sw(28),
  },
  adminDashBlockLast: {
    marginBottom: 0,
  },
  adminDashSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  adminDashListCard: {
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#EEF2F7",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  adminDashListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(14),
    paddingVertical: sw(13),
  },
  adminDashListRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
  },
  adminDashCreateGap: {
    marginBottom: sw(16),
  },
  mpDealList: {
    gap: 0,
  },
  mpDealCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    overflow: "hidden",
    position: "relative",
  },
  mpDealCardSpacing: {
    marginBottom: 12,
  },
  mpDealGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -36,
    right: -28,
    opacity: 0.9,
  },
  mpDealAccentBar: {
    position: "absolute",
    left: 0,
    top: 18,
    bottom: 18,
    width: 3,
    borderRadius: 999,
    opacity: 0.35,
  },
  mpDealBadgeShell: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
  },
  mpDealBadge: {
    height: 24,
    borderRadius: 999,
  },
  mpDealTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingRight: 76,
  },
  mpDealImageShell: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    overflow: "hidden",
    padding: 4,
    position: "relative",
  },
  mpDealImageFill: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  mpDealImageShine: {
    position: "absolute",
    width: 28,
    height: 90,
    top: -8,
    left: 12,
    borderRadius: 14,
    transform: [{ rotate: "-18deg" }],
    opacity: 0.55,
  },
  mpDealBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  mpDealMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  mpDealMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  mpDealMetaIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  mpPopularGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  mpPopularCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 4,
  },
  mpPopularImageWrap: {
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    position: "relative",
  },
  mpPopularImageFill: {
    ...StyleSheet.absoluteFillObject,
  },
  mpPopularImageGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  mpPopularCategoryChipWrap: {
    position: "absolute",
    left: 10,
    bottom: 10,
  },
  mpPopularCategoryChip: {
    width: 56,
    height: 20,
    borderRadius: 999,
  },
  mpPopularHeart: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  mpPopularBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 7,
  },
  mpPopularRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  mpPopularStarDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  mpPopularMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mpPopularMetaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
});
