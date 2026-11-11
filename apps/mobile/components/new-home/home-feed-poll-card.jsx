import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import UserAvatar from "../ui/user-avatar";
import FeedSensitiveContent from "../feed/feed-sensitive-content";
import { TOPIC_LABEL_KEY, isSensitivePost, pollTimeLeftLabel, timeAgo } from "../../services/feed-api";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";

const RADIUS = sw(16);
const PREVIEW_OPTIONS = 2;

function formatCount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function HomeFeedPollCardInner({
  post,
  width,
  height,
  imageH,
  now,
  onPress,
  onShare,
  onProfile,
}) {
  const { t } = useTranslation();
  const poll = post?.poll;
  const sensitive = isSensitivePost(post);
  const authorName = post.user?.display_name ?? post.user?.name ?? t("feed.neighbor");
  const relativeTime = timeAgo(post.created_at, now) || post.user?.time || "";
  const voteCount = Number(poll?.total_votes ?? 0);

  if (!poll && !sensitive) return null;

  const closed =
    Boolean(poll?.closed) ||
    pollTimeLeftLabel(poll?.ends_at, false, t, now) === t("feed.poll.closed");
  const timeLabel = pollTimeLeftLabel(poll?.ends_at, closed, t, now);
  const options = poll?.options ?? [];
  const preview = options.slice(0, PREVIEW_OPTIONS);
  const moreCount = Math.max(0, options.length - preview.length);
  const leading = options.find((o) => o.is_leading || o.is_winner);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        !sensitive && { minHeight: height },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardInner, !sensitive && { minHeight: height }]}>
        <View style={[styles.hero, { height: imageH }]}>
          {sensitive ? (
            <FeedSensitiveContent
              compact
              label={post.sensitive_label}
              message={post.sensitive_message}
              reason={post.sensitive_reason}
              style={styles.sensitiveHero}
            />
          ) : (
            <>
              <View style={styles.accentRail} />
              <View style={styles.heroContent}>
                <View style={styles.metaRow}>
                  <View style={styles.pollPill}>
                    <Feather name="bar-chart-2" size={sf(11)} color={T.deepTeal} />
                    <Text style={styles.pollPillText}>{t("feed.poll.badge")}</Text>
                  </View>
                  <Text style={[styles.statusText, closed && styles.statusTextMuted]} numberOfLines={1}>
                    {closed ? t("feed.poll.closed") : timeLabel}
                  </Text>
                </View>

                <Ionicons
                  name="chatbox-ellipses-outline"
                  size={sf(20)}
                  color="rgba(20,184,166,0.55)"
                  style={styles.quoteIcon}
                />
                <Text style={styles.question} numberOfLines={2}>
                  {poll?.question}
                </Text>

                {preview.length > 0 ? (
                  <View style={styles.previewList}>
                    {preview.map((option, index) => (
                      <View key={option.id} style={styles.previewRow}>
                        <Text style={styles.previewIndex}>{index + 1}</Text>
                        <Text style={styles.previewLabel} numberOfLines={1}>
                          {option.label}
                        </Text>
                        {option.percent != null && closed ? (
                          <Text style={styles.previewPct}>{Math.round(Number(option.percent))}%</Text>
                        ) : null}
                      </View>
                    ))}
                    {moreCount > 0 ? (
                      <Text style={styles.previewMore}>
                        {t("feed.poll.homeMoreOptions", { count: moreCount })}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.heroFoot}>
                  <Text style={styles.heroFootText}>{t("feed.poll.votes", { count: voteCount })}</Text>
                  {leading?.label && closed ? (
                    <>
                      <Text style={styles.heroFootDot}>·</Text>
                      <Text style={styles.heroFootLead} numberOfLines={1}>
                        {leading.label}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.heroFootDot}>·</Text>
                      <Text style={styles.heroFootHint}>{t("feed.poll.homeOpen")}</Text>
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.contentArea}>
          <Pressable style={styles.authorRow} onPress={onProfile} hitSlop={6}>
            <UserAvatar source={post.user?.avatar} name={authorName} size={sw(30)} style={styles.avatar} />
            <View style={styles.authorCopy}>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorName}
              </Text>
              <Text style={styles.authorMeta} numberOfLines={1}>
                {relativeTime}
                {post.author_unit ? ` · ${t("nav.unit", { number: post.author_unit })}` : ""}
              </Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {t(TOPIC_LABEL_KEY.Poll)}
              </Text>
            </View>
          </Pressable>

          {!sensitive ? <View style={styles.bodySpacer} /> : null}

          {sensitive ? (
            <FeedSensitiveContent
              compact
              label={post.sensitive_label}
              message={post.sensitive_message}
              reason={post.sensitive_reason}
              style={styles.sensitiveWarning}
            />
          ) : null}

          <View style={[styles.engagementBar, sensitive && styles.engagementBarTight]}>
            <View style={styles.engBtn}>
              <Feather name="bar-chart-2" size={sf(16)} color={T.navy} />
              <Text style={styles.engCount}>{formatCount(voteCount)}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.engBtn} hitSlop={8} onPress={onShare} disabled={sensitive}>
              <Ionicons name="share-outline" size={sf(18)} color={sensitive ? T.border : T.gray} />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export const HomeFeedPollCard = React.memo(HomeFeedPollCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 3 }, opacity: 0.08, radius: 10 }),
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
  hero: {
    width: "100%",
    backgroundColor: T.white,
    overflow: "hidden",
    flexDirection: "row",
  },
  accentRail: {
    width: sw(3),
    backgroundColor: T.teal,
  },
  heroContent: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(10),
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(6),
  },
  pollPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(7),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  pollPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9),
    color: T.deepTeal,
    fontWeight: "600",
  },
  statusText: {
    flexShrink: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: T.deepTeal,
    fontWeight: "500",
    textAlign: "right",
  },
  statusTextMuted: {
    color: T.gray,
    fontFamily: Fonts.regular,
    fontWeight: "400",
  },
  quoteIcon: {
    marginBottom: sw(4),
  },
  question: {
    fontFamily: Fonts.medium,
    fontSize: sf(14.5),
    lineHeight: sf(21),
    color: T.navy,
    fontWeight: "500",
    writingDirection: "auto",
  },
  previewList: {
    marginTop: sw(8),
    gap: sw(4),
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(3),
    paddingHorizontal: sw(8),
    borderRadius: sw(8),
    backgroundColor: T.canvas,
  },
  previewIndex: {
    width: sw(16),
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: T.teal,
    fontWeight: "700",
    textAlign: "center",
  },
  previewLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: T.navy,
  },
  previewPct: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: T.gray,
    fontWeight: "600",
  },
  previewMore: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: T.teal,
    marginTop: sw(2),
    paddingHorizontal: sw(4),
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(6),
    minWidth: 0,
  },
  heroFootText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: T.navy,
    fontWeight: "600",
  },
  heroFootDot: {
    marginHorizontal: sw(4),
    color: T.gray,
    fontSize: sf(10),
  },
  heroFootHint: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: T.teal,
    fontWeight: "500",
  },
  heroFootLead: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: T.deepTeal,
    fontWeight: "500",
  },
  sensitiveHero: {
    flex: 1,
    margin: sw(12),
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
  },
  authorMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: T.gray,
    marginTop: 1,
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
  bodySpacer: {
    flex: 1,
    minHeight: sw(4),
  },
  sensitiveWarning: {
    width: "100%",
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
  engagementBarTight: {
    marginTop: sw(2),
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
