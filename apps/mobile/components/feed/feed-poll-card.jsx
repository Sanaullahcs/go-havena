import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { pollTimeLeftLabel, voteOnPoll } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

export default function FeedPollCard({ post, now, onVoted }) {
  const { t } = useTranslation();
  const poll = post?.poll;
  const [selectedId, setSelectedId] = useState(poll?.voted_option_id ?? null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  if (!poll) return null;

  const closed = Boolean(poll.closed) || pollTimeLeftLabel(poll.ends_at, false, t, now) === t("feed.poll.closed");
  const resultsVisible = Boolean(poll.results_visible) || closed;
  const timeLabel = pollTimeLeftLabel(poll.ends_at, closed || poll.closed, t, now);
  const voteCount = Number(poll.total_votes ?? 0);

  const submit = async () => {
    if (voting || resultsVisible || closed) return;
    if (!selectedId) {
      setError(t("feed.poll.selectOption"));
      return;
    }
    setVoting(true);
    setError("");
    try {
      const updated = await voteOnPoll(post.id, selectedId);
      onVoted?.(updated);
    } catch (err) {
      setError(err?.message || t("feed.poll.couldNotVote"));
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.question}>{poll.question}</Text>
      {poll.description ? <Text style={styles.description}>{poll.description}</Text> : null}
      <Text style={styles.helper}>{t("feed.poll.feedback")}</Text>

      <View style={styles.options}>
        {(poll.options ?? []).map((option) => {
          const selected = String(selectedId) === String(option.id);
          const voted = String(poll.voted_option_id) === String(option.id);
          const percent = Number(option.percent ?? 0);
          return (
            <Pressable
              key={option.id}
              disabled={resultsVisible || voting}
              onPress={() => {
                setSelectedId(option.id);
                setError("");
              }}
              style={[styles.option, (selected || voted) && styles.optionSelected]}
            >
              {resultsVisible ? (
                <View style={[styles.bar, { width: `${Math.max(percent, voted ? 8 : 0)}%` }]} />
              ) : null}
              <View style={styles.optionRow}>
                {!resultsVisible ? (
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                ) : null}
                <Text style={styles.optionLabel} numberOfLines={2}>{option.label}</Text>
                {resultsVisible ? (
                  <Text style={styles.percent}>{percent}%</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {resultsVisible ? (
        <Text style={styles.meta}>
          {closed || poll.closed
            ? `${t("feed.poll.votes", { count: voteCount })} · ${t("feed.poll.closed")}`
            : `${t("feed.poll.votes", { count: voteCount })} · ${timeLabel}`}
        </Text>
      ) : (
        <>
          <Text style={styles.meta}>{timeLabel}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.voteBtn, (!selectedId || voting) && styles.voteBtnDisabled]}
            disabled={voting}
            onPress={submit}
          >
            {voting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.voteText}>{t("feed.poll.vote")}</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: sw(10), gap: sw(8) },
  question: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(21),
    color: T.navy,
    fontWeight: "600",
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.navy,
  },
  helper: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
  },
  options: { gap: sw(8) },
  option: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(10),
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    minHeight: sw(44),
    justifyContent: "center",
  },
  optionSelected: { borderColor: "#1B4F8A" },
  bar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#D1FAF5",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  radio: {
    width: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    borderWidth: 1.5,
    borderColor: "#1B4F8A",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: "#1B4F8A" },
  radioDot: {
    width: sw(8),
    height: sw(8),
    borderRadius: sw(4),
    backgroundColor: "#1B4F8A",
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: T.navy,
  },
  percent: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
  },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
  },
  error: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  voteBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#1B4F8A",
    borderRadius: sw(8),
    paddingHorizontal: sw(16),
    minHeight: sw(36),
    alignItems: "center",
    justifyContent: "center",
  },
  voteBtnDisabled: { opacity: 0.55 },
  voteText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
