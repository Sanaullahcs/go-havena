import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BackButton from "../../../components/ui/back-button";
import UserAvatar from "../../../components/ui/user-avatar";
import CrispImage from "../../../components/ui/crisp-image";
import { NoticeCoverMedia } from "../../../components/notices/notice-cover-thumbnail";
import { Fonts } from "../../../constants/font";
import { Colors, Layout, Shadows } from "../../../constants/tokens";
import { fetchNotice, getCategoryTheme, formatDisplayTime12h, formatShortDate } from "../../../services/notices-api";
import { parseApiDate } from "../../../services/feed-api";
import { billingFrequencyLabel } from "../../../services/property-services-api";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { navigateAppRoute } from "../../../utils/app-navigation";
import { sw, sf, hp } from "../../../utils/responsive";
import { useTranslation } from 'react-i18next';
import i18n, { localizedField } from "../../../i18n";
import { getLocaleForLang } from "../../../hooks/use-app-locale";
import { chevronBack } from "../../../utils/rtl";

const HERO_HEIGHT = hp(28);

function formatPublishedLabel(notice) {
  // Creation/publish only — never scheduled_at or event schedule.
  const instant = notice?.publishedAt ?? notice?.createdAt;
  if (!instant) return "";
  try {
    const date = parseApiDate(instant);
    if (!date) return notice.timeLabel ?? "";
    return date.toLocaleDateString(getLocaleForLang(i18n.language), {
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
    return new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).toLocaleDateString(getLocaleForLang(i18n.language), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function InfoTile({ icon, label, value, accent, bg, onPress }) {
  if (!value) return null;
  const content = (
    <>
      <View style={[styles.infoTileIcon, { backgroundColor: `${accent}20` }]}>
        <Feather name={icon} size={sf(15)} color={accent} />
      </View>
      <Text style={styles.infoTileLabel}>{label}</Text>
      <Text style={[styles.infoTileValue, onPress && styles.infoTileLink]} numberOfLines={4}>
        {value}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.infoTile, { backgroundColor: bg }]}
        accessibilityRole="link"
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.infoTile, { backgroundColor: bg }]}>
      {content}
    </View>
  );
}

function billStatusMeta(status, label, t) {
  const key = String(status || "").toLowerCase();
  if (key === "paid") {
    return { label: label || t("services.unitBillsStatusPaid"), color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" };
  }
  if (key === "pending_verification") {
    return { label: label || t("services.unitBillsStatusPending"), color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" };
  }
  if (key === "overdue" || key === "rejected") {
    return {
      label: label || (key === "overdue" ? t("services.unitBillsStatusOverdue") : t("services.unitBillsStatusRejected")),
      color: "#B91C1C",
      bg: "#FEF2F2",
      border: "#FECACA",
    };
  }
  if (key === "acknowledged") {
    return { label: label || t("services.unitBillsStatusAcknowledged"), color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" };
  }
  return { label: label || t("services.unitBillsStatusUnpaid"), color: "#334155", bg: "#F8FAFC", border: "#E2E8F0" };
}

function formatBillAmount(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "";
  const value = Number(amount);
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
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
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError(t('notices.noticeNotFound'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotice(id);
      setNotice(data);
    } catch {
      setError(t('notices.unableToLoadNotice'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setHeroImageFailed(false);
  }, [notice?.imageUrl]);

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
    if (notice?.isAlert) return t('notices.alertDate');
    if (notice?.isEvent) return t('notices.eventDate');
    return t('notices.noticeDate');
  }, [notice, t]);

  const startTimeLabel = useMemo(
    () => (notice?.eventTime ? formatDisplayTime12h(notice.eventTime) : ""),
    [notice],
  );

  const endTimeLabel = useMemo(
    () => (notice?.eventTimeEnd ? formatDisplayTime12h(notice.eventTimeEnd) : ""),
    [notice],
  );

  const showScheduleDate = Boolean(
    noticeDateLabel &&
      (notice?.isEvent || notice?.isAlert || startTimeLabel || endTimeLabel),
  );

  const bodyParagraphs = useMemo(() => {
    const raw = localizedField(notice, "body") || notice?.body || "";
    return String(raw)
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  }, [notice, i18n.language]);

  const openLocation = useCallback(() => {
    const query = String(notice?.location ?? "").trim();
    if (!query) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    Linking.openURL(url).catch(() => {});
  }, [notice?.location]);

  const heroBg = useMemo(() => {
    if (notice?.isAlert) return "#B91C1C";
    if (notice?.isEvent) return "#1B4F8A";
    return "#1B4F8A";
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
          <View style={styles.heroMedia}>
            {notice ? (
              <NoticeCoverMedia
                fill
                imageUrl={notice.imageUrl}
                notice={notice}
                backgroundColor={heroBg}
                onImageError={() => setHeroImageFailed(true)}
              />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: heroBg }]} />
            )}
          </View>
          {notice?.imageUrl && !heroImageFailed ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, styles.heroScrim]}
            />
          ) : null}

          <SafeAreaView edges={["top"]} style={styles.heroSafe} pointerEvents="box-none">
            <View style={styles.heroTopBar}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                onPress={() => router.back()}
                accessibilityLabel={t('notices.goBack')}
              >
                <Feather name={chevronBack()} size={sf(20)} color="#FFFFFF" />
              </Pressable>
            </View>

            {!loading && notice ? (
              <View style={styles.heroBottom}>
                <View style={[styles.heroBadge, { backgroundColor: `${theme.accent}33`, borderColor: `${theme.accent}55` }]}>
                  <Feather name={theme.icon} size={sf(11)} color="#FFFFFF" />
                  <Text style={styles.heroBadgeText}>{t(`categories.${notice.category ?? "general"}`, { defaultValue: theme.label })}</Text>
                </View>
                {notice.isEvent ? (
                  <View style={styles.heroTag}>
                    <Feather name="zap" size={sf(10)} color="#FDE68A" />
                    <Text style={styles.heroTagText}>{t('notices.communityEvent')}</Text>
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
              <Text style={styles.loadingText}>{t('notices.loadingNotice')}</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <View style={styles.errorIcon}>
                <Feather name="alert-circle" size={sf(28)} color="#9CA3AF" />
              </View>
              <Text style={styles.errorTitle}>{t('notices.somethingWentWrong')}</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.9 }]} onPress={load}>
                <Feather name="refresh-cw" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.retryText}>{t('notices.tryAgain')}</Text>
              </Pressable>
            </View>
          ) : notice ? (
            <>
              <Text style={styles.title}>{localizedField(notice, "title") || notice.title}</Text>
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

              {notice.serviceBill ? (
                <View style={styles.billCard}>
                  <View style={styles.billCardTop}>
                    <Text style={styles.billCardEyebrow}>{t("notices.billStatus")}</Text>
                    {(() => {
                      const status = billStatusMeta(
                        notice.serviceBill.status,
                        notice.serviceBill.statusLabel,
                        t,
                      );
                      return (
                        <View style={[styles.billStatusBadge, { backgroundColor: status.bg, borderColor: status.border }]}>
                          <Text style={[styles.billStatusText, { color: status.color }]}>{status.label}</Text>
                        </View>
                      );
                    })()}
                  </View>
                  <Text style={styles.billServiceName}>
                    {notice.serviceBill.serviceName || t("notices.billService")}
                  </Text>
                  <View style={styles.billMetaRow}>
                    {notice.serviceBill.unitNumber ? (
                      <Text style={styles.billMetaText}>
                        {t("notices.billUnit")} {notice.serviceBill.unitNumber}
                      </Text>
                    ) : null}
                    {formatBillAmount(notice.serviceBill.amount) ? (
                      <Text style={styles.billMetaText}>{formatBillAmount(notice.serviceBill.amount)}</Text>
                    ) : null}
                    {notice.serviceBill.dueDate ? (
                      <Text style={styles.billMetaText}>
                        {t("notices.billDueDate")}: {formatShortDate(notice.serviceBill.dueDate)}
                      </Text>
                    ) : null}
                  </View>
                  {billingFrequencyLabel(notice.serviceBill.billingFrequency, t) ? (
                    <View style={styles.billTypeChip}>
                      <Feather name="repeat" size={sf(11)} color={Colors.brandPrimary} />
                      <Text style={styles.billTypeText}>
                        {t("notices.billType")}: {billingFrequencyLabel(notice.serviceBill.billingFrequency, t)}
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => navigateAppRoute(router, PropertyManagementRoutes.UNIT_BILLS)}
                    accessibilityRole="button"
                    accessibilityLabel={t("notices.viewUnitBill")}
                    style={({ pressed }) => [styles.billActionPressable, pressed && styles.billActionPressed]}
                  >
                    <View style={styles.billAction}>
                      <Feather name="file-text" size={sf(15)} color="#FFFFFF" />
                      <Text style={styles.billActionText}>{t("notices.viewUnitBill")}</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {!notice.serviceBill && notice.amenityBill ? (
                <View style={styles.billCard}>
                  <View style={styles.billCardTop}>
                    <Text style={styles.billCardEyebrow}>{t("notices.billStatus")}</Text>
                    {(() => {
                      const status = billStatusMeta(
                        notice.amenityBill.status,
                        notice.amenityBill.statusLabel,
                        t,
                      );
                      return (
                        <View style={[styles.billStatusBadge, { backgroundColor: status.bg, borderColor: status.border }]}>
                          <Text style={[styles.billStatusText, { color: status.color }]}>{status.label}</Text>
                        </View>
                      );
                    })()}
                  </View>
                  <Text style={styles.billServiceName}>
                    {notice.amenityBill.amenityName || t("notices.billAmenity")}
                  </Text>
                  <View style={styles.billMetaRow}>
                    {notice.amenityBill.billingMonthLabel ? (
                      <Text style={styles.billMetaText}>{notice.amenityBill.billingMonthLabel}</Text>
                    ) : null}
                    {formatBillAmount(notice.amenityBill.amount) ? (
                      <Text style={styles.billMetaText}>{formatBillAmount(notice.amenityBill.amount)}</Text>
                    ) : null}
                    {notice.amenityBill.dueDate ? (
                      <Text style={styles.billMetaText}>
                        {t("notices.billDueDate")}: {formatShortDate(notice.amenityBill.dueDate)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => navigateAppRoute(router, PropertyManagementRoutes.AMENITY_BILLS)}
                    accessibilityRole="button"
                    accessibilityLabel={t("notices.viewAmenityBill")}
                    style={({ pressed }) => [styles.billActionPressable, pressed && styles.billActionPressed]}
                  >
                    <View style={styles.billAction}>
                      <Feather name="credit-card" size={sf(15)} color="#FFFFFF" />
                      <Text style={styles.billActionText}>{t("notices.viewAmenityBill")}</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {(showScheduleDate || startTimeLabel || endTimeLabel || notice.location) && (
                <View style={styles.infoGrid}>
                  {showScheduleDate ? (
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
                      label={t('notices.startTime')}
                      value={startTimeLabel}
                      accent={theme.accent}
                      bg={theme.bg}
                    />
                  ) : null}
                  {endTimeLabel ? (
                    <InfoTile
                      icon="clock"
                      label={t('notices.endTime')}
                      value={endTimeLabel}
                      accent={theme.accent}
                      bg={theme.bg}
                    />
                  ) : null}
                  <InfoTile
                    icon="map-pin"
                    label={t('notices.location')}
                    value={notice.location}
                    accent={theme.accent}
                    bg={theme.bg}
                    onPress={notice.location ? openLocation : undefined}
                  />
                </View>
              )}

              <View style={styles.divider} />

              <SectionHeader icon="file-text" title={t('notices.noticeDetails')} accent={theme.accent} />
              <View style={styles.bodyWrap}>
                {bodyParagraphs.map((paragraph, index) => (
                  <Text key={`p-${index}`} style={styles.body}>
                    {paragraph}
                  </Text>
                ))}
              </View>

              <View style={styles.divider} />

              <SectionHeader icon="user-check" title={t('notices.postedBy')} accent={theme.accent} />
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
                  <Text style={styles.authorRole}>{t('notices.communityAdministration')}</Text>
                  <View style={styles.verifiedRow}>
                    <Feather name="shield" size={sf(11)} color={Colors.brandPrimaryDeep} />
                    <Text style={styles.verifiedText}>{t('notices.officialNotice')}</Text>
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
                      {t('notices.markYourCalendar')}
                    </Text>
                    <Text style={styles.eventBannerSub}>
                      {notice.eventSchedule || t('notices.seeScheduleAbove')}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottomSafe, { paddingBottom: Math.max(insets.bottom, sw(12)) }]} />

      <View
        pointerEvents="box-none"
        style={[
          styles.backOverlay,
          { paddingTop: Math.max(insets.top, sw(8)) + sw(8) },
        ]}
      >
        <BackButton
          iconOnly
          compact
          onPress={() => {
            if (router.canGoBack?.()) {
              router.back();
              return;
            }
            router.replace("/(tabs)/notices");
          }}
        />
      </View>
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
    position: "relative",
  },
  heroMedia: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  heroScrim: {
    backgroundColor: "rgba(15,23,42,0.55)",
    zIndex: 1,
  },
  heroSafe: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPadding,
    zIndex: 2,
  },
  backOverlay: {
    position: "absolute",
    top: 0,
    start: 0,
    zIndex: 30,
    elevation: 30,
    paddingStart: Layout.screenPadding,
  },
  heroTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
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
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
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
  billCard: {
    marginTop: sw(16),
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "rgba(27, 79, 138, 0.16)",
    backgroundColor: "#E8F0F7",
    padding: sw(14),
    gap: sw(10),
  },
  billCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  billCardEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  billStatusBadge: {
    borderRadius: Layout.pillRadius,
    borderWidth: 1,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
  },
  billStatusText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    fontWeight: "700",
  },
  billServiceName: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  billMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(10),
  },
  billMetaText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  billTypeChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: "#FFFFFF",
    borderRadius: Layout.pillRadius,
    borderWidth: 1,
    borderColor: "rgba(27, 79, 138, 0.16)",
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  billTypeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.brandPrimary,
    includeFontPadding: false,
  },
  billActionPressable: {
    alignSelf: "flex-start",
    marginTop: sw(2),
  },
  billActionPressed: {
    opacity: 0.88,
  },
  billAction: {
    minHeight: sw(42),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingHorizontal: sw(16),
    paddingVertical: sw(10),
    borderRadius: Layout.buttonRadius,
    backgroundColor: Colors.brandPrimaryDeep,
    borderWidth: 1,
    borderColor: Colors.brandPrimaryDeep,
  },
  billActionText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(15),
    color: "#FFFFFF",
    fontWeight: "700",
    includeFontPadding: false,
    textAlignVertical: "center",
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
    fontFamily: Fonts.semiBold,
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
  bodyWrap: {
    gap: sw(14),
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: sf(15),
    lineHeight: sf(24),
    color: Colors.textBody,
  },
  infoTileLink: {
    color: Colors.brandPrimaryDeep,
    textDecorationLine: "underline",
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
