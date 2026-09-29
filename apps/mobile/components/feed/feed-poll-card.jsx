import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { pollTimeLeftLabel, voteOnPoll } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

const POLL_PRIMARY = "#1B4F8A";
const POLL_SOFT = "#E8F0F7";
const POLL_BORDER = "rgba(27, 79, 138, 0.28)";
const RESULT_TRACK = "#E8EEF5";
const RESULT_BAR = "#93C5FD";
const RESULT_BAR_SELECTED = "#1B4F8A";
const SELECTED_BLUE = "#1B4F8A";

const OPTION_ICON_TONES = [
  { bg: "#DBEAFE", color: "#1B4F8A", icon: "activity" },
  { bg: "#D1FAE5", color: "#059669", icon: "droplet" },
  { bg: "#FFEDD5", color: "#EA580C", icon: "sun" },
  { bg: "#E8F0F7", color: "#1B4F8A", icon: "monitor" },
];

export default function FeedPollCard({ post, now, onVoted }) {
  const { t } = useTranslation();
  const poll = post?.poll;
  const [selectedId, setSelectedId] = useState(poll?.voted_option_id ?? null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (poll?.voted_option_id != null) {
      setSelectedId(poll.voted_option_id);
    }
  }, [poll?.voted_option_id]);

  if (!poll) return null;

  const closed =
    Boolean(poll.closed) || pollTimeLeftLabel(poll.ends_at, false, t, now) === t("feed.poll.closed");
  const resultsVisible = Boolean(poll.results_visible) || closed;
  const timeLabel = pollTimeLeftLabel(poll.ends_at, closed || poll.closed, t, now);
  const voteCount = Number(poll.total_votes ?? 0);
  const hasVoted = poll.voted_option_id != null;

  const submit = async (optionId) => {
    const targetId = optionId ?? selectedId;
    if (voting || resultsVisible || closed) return;
    if (!targetId) {
      setError(t("feed.poll.selectOption"));
      return;
    }
    setSelectedId(targetId);
    setVoting(true);
    setError("");
    try {
      const updated = await voteOnPoll(post.id, targetId);
      onVoted?.(updated);
    } catch (err) {
      setError(err?.message || t("feed.poll.couldNotVote"));
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={styles.root}>
      {poll.description ? <Text style={styles.intro}>{poll.description}</Text> : null}

      <View style={styles.wrap}>
        <View style={styles.metaRow}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeIcon}>
              <Feather name="bar-chart-2" size={sf(12)} color={POLL_PRIMARY} />
            </View>
            <Text style={styles.badge}>{t("feed.poll.badge")}</Text>
          </View>
          <View style={styles.endsRow}>
            <Feather name="clock" size={sf(12)} color={T.gray} />
            <Text style={styles.endsText}>
              {closed || poll.closed
                ? t("feed.poll.closed")
                : t("feed.poll.endsIn", { time: timeLabel })}
            </Text>
          </View>
        </View>

        <Text style={styles.question}>{poll.question}</Text>

        <View style={styles.options}>
          {(poll.options ?? []).map((option, index) => {
            const selected = String(selectedId) === String(option.id);
            const voted = String(poll.voted_option_id) === String(option.id);
            const percent = Number(option.percent ?? 0);
            const tone = OPTION_ICON_TONES[index % OPTION_ICON_TONES.length];

            if (resultsVisible) {
              return (
                <View key={option.id} style={styles.resultOuter}>
                  {voted ? (
                    <View style={styles.checkBadge}>
                      <Feather name="check" size={sf(12)} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.checkSpacer} />
                  )}
                  <View style={[styles.resultCard, voted && styles.resultCardVoted]}>
                    <View style={styles.resultTop}>
                      <View style={[styles.optionIcon, { backgroundColor: voted ? "#DBEAFE" : tone.bg }]}>
                        <Feather
                          name={tone.icon}
                          size={sf(14)}
                          color={voted ? SELECTED_BLUE : tone.color}
                        />
                      </View>
                      <Text style={styles.optionLabel} numberOfLines={2}>
                        {option.label}
                      </Text>
                      <Text style={styles.percent}>{percent}%</Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${Math.max(percent, 0)}%`,
                            backgroundColor: voted ? RESULT_BAR_SELECTED : RESULT_BAR,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            }

            return (
              <Pressable
                key={option.id}
                disabled={voting}
                onPress={() => {
                  setError("");
                  void submit(option.id);
                }}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.optionIcon, { backgroundColor: tone.bg }]}>
                  <Feather name={tone.icon} size={sf(14)} color={tone.color} />
                </View>
                <Text style={styles.optionLabel} numberOfLines={2}>
                  {option.label}
                </Text>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.footerRow}>
          <Text style={styles.meta}>{t("feed.poll.votes", { count: voteCount })}</Text>
          {hasVoted ? (
            <>
              <View style={styles.footerDivider} />
              <View style={styles.recordedRow}>
                <View style={styles.recordedDot}>
                  <Feather name="check" size={sf(10)} color="#FFFFFF" />
                </View>
                <Text style={styles.recordedText}>{t("feed.poll.voteRecorded")}</Text>
              </View>
            </>
          ) : null}
          {voting ? <ActivityIndicator size="small" color={POLL_PRIMARY} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: sw(10),
    gap: sw(10),
  },
  intro: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
  },
  wrap: {
    gap: sw(12),
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(14),
    padding: sw(12),
    backgroundColor: "#FFFFFF",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  badgeIcon: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: POLL_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(11),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: T.gray,
  },
  endsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    flexShrink: 1,
  },
  endsText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: T.gray,
    flexShrink: 1,
  },
  question: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: T.navy,
    fontWeight: "600",
  },
  options: { gap: sw(8) },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    minHeight: sw(52),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  optionSelected: {
    borderColor: POLL_BORDER,
    backgroundColor: POLL_SOFT,
  },
  optionIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    color: T.navy,
  },
  radio: {
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: POLL_PRIMARY },
  radioDot: {
    width: sw(9),
    height: sw(9),
    borderRadius: sw(5),
    backgroundColor: POLL_PRIMARY,
  },
  resultOuter: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  checkBadge: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: SELECTED_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  checkSpacer: {
    width: sw(22),
    height: sw(22),
  },
  resultCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    gap: sw(8),
  },
  resultCardVoted: {
    borderColor: SELECTED_BLUE,
    backgroundColor: "#FFFFFF",
  },
  resultTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  percent: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
  },
  track: {
    height: sw(8),
    borderRadius: sw(999),
    backgroundColor: RESULT_TRACK,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: sw(999),
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    flexWrap: "wrap",
  },
  footerDivider: {
    width: 1,
    height: sw(12),
    backgroundColor: T.border,
  },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
  },
  recordedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 1,
  },
  recordedDot: {
    width: sw(16),
    height: sw(16),
    borderRadius: sw(8),
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  recordedText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#16A34A",
    flexShrink: 1,
  },
  error: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#B91C1C",
  },
});
