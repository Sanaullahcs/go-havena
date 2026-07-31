import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import UserAvatar from "../../../components/ui/user-avatar";
import CrispImage from "../../../components/ui/crisp-image";
import { Fonts } from "../../../constants/font";
import { Colors, Layout, Shadows } from "../../../constants/tokens";
import { fetchNotice, getCategoryTheme, formatDisplayTime12h } from "../../../services/notices-api";
import { sw, sf, hp } from "../../../utils/responsive";

const HERO_HEIGHT = hp(28);

function formatPublishedLabel(notice) {
  if (!notice?.publishedAt && !notice?.createdAt) return "";
  try {
    const date = new Date(notice.publishedAt ?? notice.createdAt);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return notice.timeLabel ?? "";
  }
}

function formatNoticeDateLabel(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function InfoTile({ icon, label, value, accent, bg }) {
  if (!value) return null;
  return (
    <View style={[styles.infoTile, { backgroundColor: bg }]}>
      <View style={[styles.infoTileIcon, { backgroundColor: `${accent}20` }]}>
        <Feather name={icon} size={sf(15)} color={accent} />
      </View>
      <Text style={styles.infoTileLabel}>{label}</Text>
      <Text style={styles.infoTileValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function SectionHeader({ icon, title, accent }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: `${accent}14` }]}>
        <Feather name={icon} size={sf(14)} color={accent} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function NoticeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("Notice not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotice(id);
      setNotice(data);
    } catch {
      setError("Unable to load this notice. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const theme = useMemo(
    () => (notice ? getCategoryTheme(notice.category) : getCategoryTheme("general")),
    [notice],
  );

  const publishedLabel = useMemo(
    () => (notice ? formatPublishedLabel(notice) : ""),
    [notice],
  );

  const noticeDateLabel = useMemo(
    () => (notice?.eventDate ? formatNoticeDateLabel(notice.eventDate) : ""),
    [notice],
  );

  const scheduleDateLabel = useMemo(() => {
    if (notice?.isAlert) return "Alert Date";
    if (notice?.isEvent) return "Event Date";
    return "Notice Date";
  }, [notice]);

  const startTimeLabel = useMemo(
    () => (notice?.eventTime ? formatDisplayTime12h(notice.eventTime) : ""),
    [notice],
  );

  const endTimeLabel = useMemo(
    () => (notice?.eventTimeEnd ? formatDisplayTime12h(notice.eventTimeEnd) : ""),
    [notice],
  );

  const heroGradient = useMemo(() => {
    if (notice?.isAlert) return ["#7F1D1D", "#B91C1C", "#EF4444"];
    if (notice?.isEvent) return ["#1E3A5F", "#0052DF", "#0179FF"];
    return ["#0F172A", "#113D6F", "#0052DF"];
  }, [notice]);

  const onShare = useCallback(async () => {
    if (!notice) return;
    try {
      await Share.share({
        title: notice.title,
        message: `${notice.title}\n\n${notice.body}${notice.location ? `\n\nLocation: ${notice.location}` : ""}`,
      });
    } catch {
      // user dismissed
    }
  }, [notice]);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <View style={[styles.hero, { height: HERO_HEIGHT }]}>
          {notice?.imageUrl ? (
            <>
              <CrispImage source={{ uri: notice.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["rgba(15,23,42,0.15)", "rgba(15,23,42,0.55)", "rgba(15,23,42,0.88)"]}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : (
            <LinearGradient
              colors={heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <View style={styles.heroTopBar}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                onPress={() => router.back()}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={sf(20)} color="#FFFFFF" />
              </Pressable>
              {!loading && notice ? (
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                  onPress={onShare}
                  accessibilityLabel="Share notice"
                >
                  <Feather name="share-2" size={sf(18)} color="#FFFFFF" />
                </Pressable>
              ) : (
                <View style={styles.iconBtnPlaceholder} />
              )}
            </View>

            {!loading && notice ? (
              <View style={styles.heroBottom}>
                <View style={[styles.heroBadge, { backgroundColor: `${theme.accent}33`, borderColor: `${theme.accent}55` }]}>
                  <Feather name={theme.icon} size={sf(11)} color="#FFFFFF" />
                  <Text style={styles.heroBadgeText}>{theme.label}</Text>
                </View>
                {notice.isEvent ? (
                  <View style={styles.heroTag}>
                    <Feather name="zap" size={sf(10)} color="#FDE68A" />
                    <Text style={styles.heroTagText}>Community Event</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </SafeAreaView>
        </View>

        {/* Content sheet */}
        <View style={styles.sheet}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.brandPrimaryDeep} size="large" />
              <Text style={styles.loadingText}>Loading notice...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <View style={styles.errorIcon}>
                <Feather name="alert-circle" size={sf(28)} color="#9CA3AF" />
              </View>
              <Text style={styles.errorTitle}>Something went wrong</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.9 }]} onPress={load}>
                <Feather name="refresh-cw" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : notice ? (
            <>
              <Text style={styles.title}>{notice.title}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Feather name="clock" size={sf(12)} color={Colors.brandPrimaryDeep} />
                  <Text style={styles.metaChipText}>{notice.timeLabel}</Text>
                </View>
                {publishedLabel ? (
                  <View style={styles.metaChipMuted}>
                    <Text style={styles.metaChipMutedText} numberOfLines={1}>
                      {publishedLabel}
                    </Text>
                  </View>
                ) : null}
              </View>

              {(noticeDateLabel || startTimeLabel || endTimeLabel || notice.location) && (
                <View style={styles.infoGrid}>
                  {noticeDateLabel ? (
                    <InfoTile
                      icon="calendar"
                      label={scheduleDateLabel}
                      value={noticeDateLabel}
                      accent={theme.accent}
                      bg={theme.bg}
                    />
                  ) : null}
                  {startTimeLabel ? (
                    <InfoTile
                      icon="clock"
                      label="Start Time"
                      value={startTimeLabel}
                      accent={theme.accent}
                      bg={theme.bg}
                    />
                  ) : null}
                  {endTimeLabel ? (
                    <InfoTile
                      icon="clock"
                      label="End Time"
                      value={endTimeLabel}
                      accent={theme.accent}
                      bg={theme.bg}
                    />
                  ) : null}
                  <InfoTile
                    icon="map-pin"
                    label="Location"
                    value={notice.location}
                    accent={theme.accent}
                    bg={theme.bg}
                  />
                </View>
              )}

              <View style={styles.divider} />

              <SectionHeader icon="file-text" title="Notice Details" accent={theme.accent} />
              <Text style={styles.body}>{notice.body}</Text>

              <View style={styles.divider} />

              <SectionHeader icon="user-check" title="Posted By" accent={theme.accent} />
              <View style={styles.authorCard}>
                <View style={[styles.authorAvatarRing, { borderColor: `${theme.accent}40` }]}>
                  <UserAvatar
                    source={notice.authorAvatar}
                    name={notice.authorName}
                    size={sw(52)}
                    useIconPlaceholder
                  />
                </View>
                <View style={styles.authorBody}>
                  <Text style={styles.authorName}>{notice.authorName}</Text>
                  <Text style={styles.authorRole}>Community Administration</Text>
                  <View style={styles.verifiedRow}>
                    <Feather name="shield" size={sf(11)} color={Colors.brandPrimaryDeep} />
                    <Text style={styles.verifiedText}>Official community notice</Text>
                  </View>
                </View>
              </View>

              {notice.isEvent ? (
                <View style={[styles.eventBanner, { backgroundColor: theme.bg, borderColor: `${theme.accent}30` }]}>
                  <View style={[styles.eventBannerIcon, { backgroundColor: `${theme.accent}18` }]}>
                    <Feather name="calendar" size={sf(18)} color={theme.accent} />
                  </View>
                  <View style={styles.eventBannerText}>
                    <Text style={[styles.eventBannerTitle, { color: theme.text }]}>
                      Mark your calendar
                    </Text>
                    <Text style={styles.eventBannerSub}>
                      {notice.eventSchedule || "See schedule above for event timing."}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottomSafe, { paddingBottom: Math.max(insets.bottom, sw(12)) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: hp(2),
  },
  hero: {
    width: "100%",
    backgroundColor: Colors.brandPrimaryDeep,
    overflow: "hidden",
  },
  heroSafe: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPadding,
  },
  heroTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: hp(0.4),
  },
  iconBtn: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  iconBtnPlaceholder: {
    width: sw(40),
    height: sw(40),
  },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: sw(8),
    paddingBottom: hp(3.2),
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: Layout.pillRadius,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(9),
    paddingVertical: sw(4),
    borderRadius: Layout.pillRadius,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroTagText: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "rgba(255,255,255,0.92)",
  },
  sheet: {
    marginTop: -sw(22),
    marginHorizontal: sw(14),
    backgroundColor: Colors.surface,
    borderRadius: sw(20),
    paddingHorizontal: sw(18),
    paddingTop: sw(22),
    paddingBottom: sw(20),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    ...Shadows.card,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: hp(8),
    gap: sw(12),
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textMuted,
  },
  errorWrap: {
    alignItems: "center",
    paddingVertical: hp(6),
    paddingHorizontal: sw(12),
    gap: sw(8),
  },
  errorIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  errorTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.footerMuted,
    textAlign: "center",
    lineHeight: sf(19),
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(8),
    paddingHorizontal: sw(18),
    paddingVertical: sw(12),
    borderRadius: Layout.buttonRadius,
    backgroundColor: Colors.brandPrimaryDeep,
  },
  retryText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    lineHeight: sf(28),
    color: Colors.textPrimary,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(8),
    marginTop: sw(12),
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: Layout.pillRadius,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  metaChipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  metaChipMuted: {
    flex: 1,
    minWidth: sw(120),
    paddingVertical: sw(6),
  },
  metaChipMutedText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(10),
    marginTop: sw(16),
  },
  infoTile: {
    flex: 1,
    minWidth: "46%",
    borderRadius: sw(14),
    padding: sw(14),
    gap: sw(6),
  },
  infoTileIcon: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  infoTileLabel: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  infoTileValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: Colors.textPrimary,
    lineHeight: sf(18),
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: sw(20),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    marginBottom: sw(12),
  },
  sectionIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: sf(15),
    lineHeight: sf(24),
    color: Colors.textBody,
  },
  authorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  authorAvatarRing: {
    borderRadius: sw(28),
    borderWidth: 2,
    padding: sw(2),
  },
  authorBody: {
    flex: 1,
    minWidth: 0,
    gap: sw(3),
  },
  authorName: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  authorRole: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.footerMuted,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    marginTop: sw(4),
  },
  verifiedText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },
  eventBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginTop: sw(20),
    padding: sw(14),
    borderRadius: sw(14),
    borderWidth: 1,
  },
  eventBannerIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  eventBannerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    fontWeight: "700",
  },
  eventBannerSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textSecondary,
    marginTop: sw(2),
    lineHeight: sf(17),
  },
  bottomSafe: {
    backgroundColor: "#F8FAFC",
  },
});
