import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { pollTimeLeftLabel, parseApiDate } from "../../services/feed-api";
import { sw, sf } from "../../utils/responsive";

function formatDateTime(iso, locale) {
  if (!iso) return "—";
  const d = parseApiDate(iso);
  if (!d) return "—";
  try {
    return d.toLocaleString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function PollDetailMeta({ poll, now, t, locale }) {
  const closed = Boolean(poll?.closed);
  const isMultiple = (poll?.voting_method ?? "single") === "multiple";

  return (
    <View style={styles.block}>
      <View style={styles.statusRow}>
        <Text style={styles.sectionLabel}>{t("feed.poll.status")}</Text>
        <View style={[styles.statusPill, closed ? styles.statusEnded : styles.statusActive]}>
          <Text style={[styles.statusText, closed ? styles.statusEndedText : styles.statusActiveText]}>
            {closed ? t("feed.poll.statusEnded") : t("feed.poll.statusActive")}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Feather name="calendar" size={sf(14)} color={T.gray} />
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel}>{t("feed.poll.started")}</Text>
          <Text style={styles.rowValue}>{formatDateTime(poll?.started_at, locale)}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Feather name="flag" size={sf(14)} color={T.gray} />
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel}>{t("feed.poll.ends")}</Text>
          <Text style={styles.rowValue}>{formatDateTime(poll?.ends_at, locale)}</Text>
        </View>
      </View>

      {!closed ? (
        <View style={styles.row}>
          <Feather name="clock" size={sf(14)} color={T.gray} />
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>{t("feed.poll.timeRemaining")}</Text>
            <Text style={[styles.rowValue, styles.accent]}>
              {pollTimeLeftLabel(poll?.ends_at, false, t, now)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>{t("feed.poll.votingMethod")}</Text>
      <Text style={styles.methodTitle}>
        {isMultiple ? t("feed.poll.methodMultipleTitle") : t("feed.poll.methodSingleTitle")}
      </Text>
      <Text style={styles.methodBody}>
        {isMultiple ? t("feed.poll.methodMultipleBody") : t("feed.poll.methodSingleBody")}
      </Text>
      <Text style={styles.methodHint}>
        {poll?.voting_paused || poll?.voting_paused_reason === "sensitive"
          ? t("feed.poll.voteChangesPausedSensitive")
          : poll?.vote_changes_allowed === false || closed
            ? t("feed.poll.voteChangesClosed")
            : t("feed.poll.voteChangesOpen")}
      </Text>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t("feed.poll.optionsCount")}</Text>
          <Text style={styles.statValue}>{poll?.options_count ?? (poll?.options ?? []).length}</Text>
        </View>
        {poll?.total_votes != null ? (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("feed.poll.totalVotes")}</Text>
            <Text style={[styles.statValue, styles.accent]}>{poll.total_votes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PollFinalResults({ poll, t }) {
  if (!poll?.closed) return null;

  const options = poll.options ?? [];
  const winners = options.filter((o) => o.is_winner);

  return (
    <View style={[styles.block, styles.final]}>
      <Text style={styles.sectionLabel}>{t("feed.poll.finalResults")}</Text>
      {poll.no_participation ? (
        <Text style={styles.finalText}>{t("feed.poll.noParticipation")}</Text>
      ) : poll.is_tie && winners.length > 0 ? (
        <Text style={styles.finalText}>
          <Text style={styles.finalBold}>{t("feed.poll.tie")}: </Text>
          {winners.map((w) => w.label).join(", ")}
        </Text>
      ) : winners.length === 1 ? (
        <Text style={styles.finalText}>
          <Text style={styles.finalBold}>{t("feed.poll.winner")}: </Text>
          {winners[0].label} ({winners[0].votes ?? 0}, {winners[0].percent ?? 0}%)
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    padding: sw(12),
    gap: sw(10),
    backgroundColor: "#F8FAFC",
  },
  final: {
    backgroundColor: "#FFFFFF",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: "#D1FAE5",
  },
  statusEnded: {
    backgroundColor: "#E2E8F0",
  },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    fontWeight: "600",
  },
  statusActiveText: { color: "#047857" },
  statusEndedText: { color: "#475569" },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: T.gray,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  rowBody: { flex: 1, gap: sw(2) },
  rowLabel: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
  },
  rowValue: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
  },
  accent: { color: "#1B4F8A" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginVertical: sw(2),
  },
  methodTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
    fontWeight: "600",
  },
  methodBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  methodHint: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#047857",
  },
  statRow: {
    flexDirection: "row",
    gap: sw(16),
  },
  stat: { gap: sw(2) },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: T.gray,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: T.navy,
    fontWeight: "700",
  },
  finalText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
  },
  finalBold: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    color: "#1B4F8A",
  },
});
