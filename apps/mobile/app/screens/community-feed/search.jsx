import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import SearchInput from "../../../components/ui/search-input";
import UserAvatar from "../../../components/ui/user-avatar";
import { CommunityFeedSkeleton } from "../../../components/ui/skeleton-loader";
import {
  FEED_TOPICS,
  searchFeed,
  parsePostDisplayContent,
  timeAgo,
  isSensitivePost,
  TOPIC_LABEL_KEY,
} from "../../../services/feed-api";
import { getFeedTagTheme } from "../../../constants/feed-theme";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { useNow } from "../../../hooks/use-now";
import { sw, sf } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";

export default function FeedSearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const now = useNow(30000);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);

  const trimmedQuery = query.trim();
  const hasFilter = trimmedQuery.length > 0 || Boolean(activeTopic);

  const matchingTopics = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q || activeTopic) return FEED_TOPICS;
    return FEED_TOPICS.filter((t) => t.toLowerCase().includes(q));
  }, [trimmedQuery, activeTopic]);

  useEffect(() => {
    if (!hasFilter) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const { posts } = await searchFeed({
          q: trimmedQuery || undefined,
          topic: activeTopic ?? undefined,
        });
        if (!cancelled) setResults(posts ?? []);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError(err?.message ?? t("feed.search.couldNotSearch"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, activeTopic, hasFilter]);

  const openPost = (postId) => {
    router.push({
      pathname: "/screens/community-feed/comments",
      params: { postId: String(postId) },
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("feed.search.title")} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("feed.search.placeholder")}
              autoFocus
            />
          </View>
          {trimmedQuery ? (
            <Pressable
              style={styles.clearBtn}
              onPress={() => setQuery("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("feed.search.clearSearch")}
            >
              <Feather name="x" size={sf(16)} color="#64748B" />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>{t("feed.search.topics")}</Text>
        <View style={styles.chips}>
          {matchingTopics.map((topic) => {
            const theme = getFeedTagTheme(topic);
            const isActive = activeTopic === topic;
            return (
              <Pressable
                key={topic}
                style={[
                  styles.chip,
                  isActive && {
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setActiveTopic(isActive ? null : topic)}
              >
                <Feather
                  name={theme.icon}
                  size={12}
                  color={isActive ? theme.text : "#6B7280"}
                />
                <Text
                  style={[
                    styles.chipText,
                    isActive && { color: theme.text, fontFamily: Fonts.semiBold },
                  ]}
                >
                  {TOPIC_LABEL_KEY[topic] ? t(TOPIC_LABEL_KEY[topic]) : topic}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!hasFilter ? (
          <View style={styles.idle}>
            <View style={styles.idleIcon}>
              <Feather name="search" size={sf(22)} color={Colors.brandPrimaryDeep} />
            </View>
            <Text style={styles.idleTitle}>{t("feed.search.searchCommunity")}</Text>
            <Text style={styles.idleText}>
              {t("feed.search.searchHint")}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsHead}>
              <Text style={styles.sectionLabel}>
                {loading ? t("feed.search.results") : t("feed.search.resultsWithCount", { count: results.length })}
              </Text>
              {loading ? (
                <ActivityIndicator size="small" color={Colors.brandPrimaryDeep} />
              ) : null}
            </View>

            {loading && results.length === 0 ? (
              <CommunityFeedSkeleton count={3} />
            ) : error ? (
              <Text style={styles.emptyText}>{error}</Text>
            ) : results.length === 0 ? (
              <Text style={styles.emptyText}>{t("feed.search.noResults")}</Text>
            ) : (
              results.map((post) => {
                const authorName =
                  post.user?.display_name ?? post.user?.name ?? t("feed.neighbor");
                const display = parsePostDisplayContent(post);
                const sensitive = isSensitivePost(post);
                const body = sensitive
                  ? `⚠️ ${t("feed.search.sensitiveHidden")}`
                  : display.mainText ||
                    (display.hasImage ? t("feed.search.sharedPhoto") : t("feed.search.viewPost"));
                const theme = getFeedTagTheme(post.tag);
                const relativeTime =
                  timeAgo(post.created_at, now) || post.user?.time || "";

                return (
                  <Pressable
                    key={post.id}
                    style={styles.resultCard}
                    onPress={() => openPost(post.id)}
                  >
                    <UserAvatar
                      source={post.user?.avatar}
                      name={authorName}
                      size={sw(36)}
                    />
                    <View style={styles.resultBody}>
                      <View style={styles.resultTop}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {authorName}
                        </Text>
                        {relativeTime ? (
                          <Text style={styles.resultTime}>{relativeTime}</Text>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.resultContent, sensitive && styles.resultSensitive]}
                        numberOfLines={2}
                      >
                        {body}
                      </Text>
                      {sensitive ? (
                        <View style={[styles.resultTag, { backgroundColor: "#FEF3C7" }]}>
                          <Text style={[styles.resultTagText, { color: "#B45309" }]}>
                            {t("feed.search.sensitive")}
                          </Text>
                        </View>
                      ) : post.tag ? (
                        <View style={[styles.resultTag, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.resultTagText, { color: theme.text }]}>
                            {TOPIC_LABEL_KEY[post.tag] ? t(TOPIC_LABEL_KEY[post.tag]) : post.tag}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Feather name={chevronForward()} size={sf(16)} color="#94A3B8" />
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { paddingHorizontal: sw(18), paddingTop: sw(12), paddingBottom: sw(32) },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  searchField: { flex: 1, minWidth: 0 },
  clearBtn: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionLabel: {
    marginTop: sw(20),
    marginBottom: sw(10),
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    fontWeight: "700",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#6B7280",
  },
  idle: {
    marginTop: sw(36),
    alignItems: "center",
    paddingHorizontal: sw(16),
  },
  idleIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(16),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D1FAF5",
    marginBottom: sw(12),
  },
  idleTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
    fontWeight: "700",
    marginBottom: sw(6),
  },
  idleText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#64748B",
    textAlign: "center",
  },
  resultsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#64748B",
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    padding: sw(12),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginBottom: sw(8),
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(2),
  },
  resultTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#101828",
    fontWeight: "700",
  },
  resultTime: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  resultContent: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#475569",
  },
  resultSensitive: {
    color: "#B45309",
    fontFamily: Fonts.medium,
  },
  resultTag: {
    alignSelf: "flex-start",
    marginTop: sw(6),
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  resultTagText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
  },
});
