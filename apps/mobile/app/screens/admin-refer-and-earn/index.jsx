import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { AdminTheme, adminSharedStyles } from "../../../constants/admin-theme";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sf, sw } from "../../../utils/responsive";
import { formatDisplayDate } from "../../../utils/form-datetime";
import {
  fetchMyReferralDashboard,
  formatReferralMoney,
  formatReferralRewardLabel,
} from "../../../services/referrals-api";
import { useApiAction } from "../../../hooks/use-api-action";

const STATUS_META = {
  qualified: { labelKey: "admin.referralStatusRewarded", bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  disqualified: { labelKey: "admin.referralStatusDisqualified", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  pending_qualification: { labelKey: "admin.referralStatusPendingPayment", bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  locked: { labelKey: "admin.referralStatusSignedUp", bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
};

function refereeLabel(row) {
  return row.referee?.name || row.referee?.phone || `#${row.referee?.id ?? "?"}`;
}

function CopyIcon({ copied, size = 16, color = "#64748B", copiedColor = "#047857" }) {
  return (
    <View style={styles.copyIconWrap}>
      <Feather
        name={copied ? "check" : "clipboard"}
        size={sf(size)}
        color={copied ? copiedColor : color}
      />
    </View>
  );
}

function referralStatusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.locked;
}

function StatCard({ label, value, hint, tone }) {
  const palette = {
    blue: { bg: "#EFF6FF", text: "#1D4ED8", icon: "users" },
    amber: { bg: "#FFFBEB", text: "#B45309", icon: "clock" },
    green: { bg: "#ECFDF5", text: "#047857", icon: "check-circle" },
    red: { bg: "#FEF2F2", text: "#B91C1C", icon: "x-circle" },
  }[tone] ?? { bg: "#F8FAFC", text: "#475569", icon: "activity" };

  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: palette.bg }]}>
        <Feather name={palette.icon} size={sf(16)} color={palette.text} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function HistoryRow({ row, t, showDivider }) {
  const status = referralStatusMeta(row.status);
  const rewardLabel =
    row.reward?.status === "credited"
      ? formatReferralMoney(row.reward.amount_cents)
      : row.reward?.status === "pending"
        ? t("admin.referralRewardPending")
        : formatReferralRewardLabel(row);

  return (
    <View>
      <View style={styles.historyRow}>
        <View style={styles.historyMain}>
          <Text style={styles.historyName} numberOfLines={1}>
            {refereeLabel(row)}
          </Text>
          {row.referee?.phone ? (
            <Text style={styles.historyMeta} numberOfLines={1}>
              {row.referee.phone}
            </Text>
          ) : null}
          {row.referee_community?.name ? (
            <Text style={styles.historyMeta} numberOfLines={1}>
              {row.referee_community.name}
            </Text>
          ) : null}
        </View>
        <View style={styles.historySide}>
          <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
            <Text style={[styles.statusPillText, { color: status.text }]}>{t(status.labelKey)}</Text>
          </View>
          <Text style={styles.historyReward}>{rewardLabel}</Text>
          {row.locked_at ? (
            <Text style={styles.historyDate}>{formatDisplayDate(row.locked_at)}</Text>
          ) : null}
        </View>
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}

export default function AdminReferAndEarnScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showSuccess } = useApiAction();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      setData(await fetchMyReferralDashboard());
    } catch (err) {
      setError(err?.message ?? t("admin.referAndEarnLoadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rewardLabel = useMemo(
    () =>
      data?.reward_label ??
      formatReferralRewardLabel({
        reward_type: data?.reward_type,
        reward_percent: data?.reward_percent ?? 5,
        reward_fixed_cents: data?.reward_fixed_cents,
      }),
    [data],
  );

  const rewardHint =
    data?.reward_type === "fixed"
      ? t("admin.referralRewardHintFixed")
      : t("admin.referralRewardHintPercent");

  const referralLink = data?.referral_link ?? null;
  const referralCode = data?.referral_code ?? null;

  const copyText = async (text, kind) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(kind);
    await showSuccess(
      t("admin.referralCopiedTitle"),
      kind === "link" ? t("admin.referralLinkCopied") : t("admin.referralCodeCopied"),
    );
    setTimeout(() => setCopied(null), 2000);
  };

  const shareLink = async () => {
    if (!referralLink) return;
    try {
      await Share.share({
        title: t("admin.referralShareTitle"),
        message: t("admin.referralShareMessage", { link: referralLink }),
        url: referralLink,
      });
    } catch {
      // user dismissed
    }
  };

  const scrollBottom = Math.max(insets.bottom, 16) + sw(16);

  return (
    <SafeAreaView style={adminSharedStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("admin.referAndEarn")}
        subtitle={t("admin.referAndEarnSubtitle", { reward: rewardLabel })}
      />

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
        </View>
      ) : error && !data ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={sf(28)} color={AdminTheme.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>{t("admin.tryAgain")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={adminSharedStyles.body}
          contentContainerStyle={[adminSharedStyles.scrollContent, { paddingBottom: scrollBottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={Colors.brandPrimaryDeep}
            />
          }
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroBadgeRow}>
                <View style={styles.rewardBadge}>
                  <Feather name="award" size={sf(12)} color="#0F766E" />
                  <Text style={styles.rewardBadgeText}>{rewardLabel}</Text>
                </View>
                <View
                  style={[
                    styles.programBadge,
                    data?.program_active ? styles.programBadgeActive : styles.programBadgePaused,
                  ]}
                >
                  <Feather
                    name={data?.program_active ? "check-circle" : "clock"}
                    size={sf(12)}
                    color={data?.program_active ? "#047857" : "#B45309"}
                  />
                  <Text
                    style={[
                      styles.programBadgeText,
                      data?.program_active ? styles.programBadgeTextActive : styles.programBadgeTextPaused,
                    ]}
                  >
                    {data?.program_active ? t("admin.referralProgramActive") : t("admin.referralProgramPaused")}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>{t("admin.referralInviteLink")}</Text>
              <Text style={styles.heroHint}>{t("admin.referralInviteHint")}</Text>

              {!data?.program_active ? (
                <View style={styles.pausedBanner}>
                  <Text style={styles.pausedBannerText}>{t("admin.referralProgramPausedMsg")}</Text>
                </View>
              ) : null}

              {referralCode ? (
                <Pressable
                  style={({ pressed }) => [styles.codeChip, pressed && styles.pressed]}
                  onPress={() => copyText(referralCode, "code")}
                >
                  <Text style={styles.codeChipText}>{referralCode}</Text>
                  <CopyIcon copied={copied === "code"} size={14} />
                </Pressable>
              ) : null}

              {referralLink ? (
                <>
                  <View style={styles.linkBox}>
                    <Feather name="link" size={sf(16)} color="#94A3B8" />
                    <Text style={styles.linkText} numberOfLines={2}>
                      {referralLink}
                    </Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                      onPress={() => copyText(referralLink, "link")}
                    >
                      <CopyIcon copied={copied === "link"} size={16} color="#FFFFFF" copiedColor="#A7F3D0" />
                      <Text style={styles.primaryBtnText} numberOfLines={1}>
                        {copied === "link" ? t("admin.referralCopied") : t("admin.referralCopyLink")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                      onPress={shareLink}
                    >
                      <Feather name="share-2" size={sf(16)} color={AdminTheme.text} />
                      <Text style={styles.secondaryBtnText}>{t("admin.referralShare")}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.linkPlaceholder}>
                  <Text style={styles.linkPlaceholderText}>{t("admin.referralLinkLocked")}</Text>
                </View>
              )}
            </View>

            <View style={styles.rewardPanel}>
              <Text style={styles.rewardPanelLabel}>{t("admin.referralRewardLabel")}</Text>
              <Text style={styles.rewardPanelValue}>{rewardLabel}</Text>
              <Text style={styles.rewardPanelHint}>{rewardHint}</Text>
              <View style={styles.rewardDivider} />
              <Text style={styles.lifetimeLabel}>{t("admin.referralLifetimeEarned")}</Text>
              <Text style={styles.lifetimeValue}>
                {formatReferralMoney(data?.stats?.total_credit_earned_cents ?? 0)}
              </Text>
            </View>
          </View>

          <View style={styles.stepsCard}>
            {[
              { n: "1", title: t("admin.referralStepShare"), desc: t("admin.referralStepShareDesc") },
              { n: "2", title: t("admin.referralStepSubscribe"), desc: t("admin.referralStepSubscribeDesc") },
              { n: "3", title: t("admin.referralStepEarn"), desc: t("admin.referralStepEarnDesc", { reward: rewardLabel }) },
            ].map((step) => (
              <View key={step.n} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{step.n}</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.statsGrid}>
            <StatCard
              label={t("admin.referralStatTotal")}
              value={String(data?.stats?.total_referrals ?? 0)}
              hint={t("admin.referralStatTotalHint")}
              tone="blue"
            />
            <StatCard
              label={t("admin.referralStatPending")}
              value={String(data?.stats?.pending_referrals ?? 0)}
              hint={t("admin.referralStatPendingHint")}
              tone="amber"
            />
            <StatCard
              label={t("admin.referralStatSuccessful")}
              value={String(data?.stats?.successful_referrals ?? 0)}
              hint={t("admin.referralStatSuccessfulHint")}
              tone="green"
            />
            <StatCard
              label={t("admin.referralStatDisqualified")}
              value={String(data?.stats?.disqualified_referrals ?? 0)}
              hint={t("admin.referralStatDisqualifiedHint")}
              tone="red"
            />
          </View>

          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>{t("admin.referralHistory")}</Text>
                <Text style={styles.historySubtitle}>{t("admin.referralHistoryHint")}</Text>
              </View>
              <View style={styles.historyCountPill}>
                <Text style={styles.historyCountText}>{data?.history?.length ?? 0}</Text>
              </View>
            </View>

            {(data?.history?.length ?? 0) === 0 ? (
              <View style={styles.historyEmpty}>
                <View style={styles.historyEmptyIcon}>
                  <Feather name="award" size={sf(20)} color="#0F766E" />
                </View>
                <Text style={styles.historyEmptyTitle}>{t("admin.referralHistoryEmpty")}</Text>
                <Text style={styles.historyEmptyText}>{t("admin.referralHistoryEmptyHint")}</Text>
              </View>
            ) : (
              data.history.map((row, index) => (
                <HistoryRow
                  key={row.id}
                  row={row}
                  t={t}
                  showDivider={index < data.history.length - 1}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(24),
    gap: sw(12),
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: AdminTheme.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: sw(4),
    paddingHorizontal: sw(16),
    paddingVertical: sw(10),
    borderRadius: sw(999),
    backgroundColor: AdminTheme.heroBg,
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  heroCard: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(18),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  heroTop: {
    padding: sw(16),
    gap: sw(12),
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
  },
  rewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    backgroundColor: "#CCFBF1",
  },
  rewardBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#115E59",
  },
  programBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    borderWidth: 1,
  },
  programBadgeActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  programBadgePaused: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  programBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  programBadgeTextActive: { color: "#047857" },
  programBadgeTextPaused: { color: "#B45309" },
  heroTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  heroHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    lineHeight: sf(18),
  },
  pausedBanner: {
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  pausedBannerText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#92400E",
    lineHeight: sf(18),
  },
  codeChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
  },
  codeChipText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    letterSpacing: 1.2,
    color: AdminTheme.text,
    flexShrink: 1,
  },
  copyIconWrap: {
    flexShrink: 0,
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  linkText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textSecondary,
    lineHeight: sf(18),
  },
  actionRow: {
    flexDirection: "row",
    gap: sw(10),
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: AdminTheme.heroBg,
  },
  primaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
    flexShrink: 1,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: AdminTheme.surface,
  },
  secondaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  linkPlaceholder: {
    borderRadius: sw(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(14),
  },
  linkPlaceholderText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: AdminTheme.textMuted,
    lineHeight: sf(20),
  },
  rewardPanel: {
    borderTopWidth: 1,
    borderTopColor: AdminTheme.borderSubtle,
    backgroundColor: "#F0FDFA",
    padding: sw(16),
  },
  rewardPanelLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#0F766E",
  },
  rewardPanelValue: {
    marginTop: sw(6),
    fontFamily: Fonts.bold,
    fontSize: sf(28),
    color: AdminTheme.text,
  },
  rewardPanelHint: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    lineHeight: sf(18),
  },
  rewardDivider: {
    height: 1,
    backgroundColor: "rgba(20, 184, 166, 0.25)",
    marginVertical: sw(14),
  },
  lifetimeLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  lifetimeValue: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: AdminTheme.text,
  },
  stepsCard: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    padding: sw(14),
    gap: sw(12),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  stepRow: {
    flexDirection: "row",
    gap: sw(12),
    alignItems: "flex-start",
  },
  stepBadge: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AdminTheme.heroBg,
  },
  stepBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#FFFFFF",
  },
  stepCopy: { flex: 1 },
  stepTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  stepDesc: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    lineHeight: sf(18),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(10),
  },
  statCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(14),
    padding: sw(14),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  statIconWrap: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    color: AdminTheme.text,
  },
  statLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: AdminTheme.text,
  },
  statHint: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
  },
  historyCard: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    padding: sw(14),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(12),
    marginBottom: sw(12),
  },
  historyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: AdminTheme.text,
  },
  historySubtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  historyCountPill: {
    minWidth: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: AdminTheme.border,
  },
  historyCountText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: AdminTheme.textSecondary,
  },
  historyEmpty: {
    alignItems: "center",
    paddingVertical: sw(24),
    paddingHorizontal: sw(12),
  },
  historyEmptyIcon: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CCFBF1",
  },
  historyEmptyTitle: {
    marginTop: sw(12),
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  historyEmptyText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    textAlign: "center",
    lineHeight: sf(18),
  },
  historyRow: {
    flexDirection: "row",
    gap: sw(12),
    paddingVertical: sw(12),
  },
  historyMain: { flex: 1, minWidth: 0 },
  historySide: { alignItems: "flex-end", gap: sw(6), maxWidth: "42%" },
  historyName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  historyMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
  },
  historyReward: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: AdminTheme.text,
  },
  historyDate: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
  },
  statusPill: {
    borderRadius: sw(999),
    borderWidth: 1,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  statusPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
  },
  divider: {
    height: 1,
    backgroundColor: AdminTheme.borderSubtle,
  },
  pressed: { opacity: 0.88 },
});
