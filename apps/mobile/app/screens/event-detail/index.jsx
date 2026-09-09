import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Pressable,
  Dimensions,
  Modal,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import ScreenHeader from "../../../components/layout/screen-header";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import CrispImage from "../../../components/ui/crisp-image";
import UserAvatar from "../../../components/ui/user-avatar";
import { NoticeCoverMedia } from "../../../components/notices/notice-cover-thumbnail";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import {
  fetchNotice,
  formatEventTimeRange,
  formatLongDate,
  isEventNotice,
  joinEvent,
  leaveEvent,
  resolveNoticeId,
} from "../../../services/notices-api";
import { isNoticeExpiredForHome } from "../../../utils/notice-home-expiry";
import { startConversation } from "../../../services/messages-api";
import { getUser, getToken } from "../../../services/auth-session";
import { getApiErrorMessage, getApiErrorCode } from "../../../utils/auth-errors";
import { useTranslation } from 'react-i18next';
import i18n, { localizedField } from "../../../i18n";
import { getLocaleForLang } from "../../../hooks/use-app-locale";
import FeedPostReportSheet, { completeReportAndNotify } from "../../../components/feed/feed-post-report-sheet";
import { fileReport } from "../../../services/reports-api";
import { useApiAction } from "../../../hooks/use-api-action";

function formatEventDateLabel(dateStr, t) {
  if (!dateStr) return null;

  try {
    const eventDate = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(eventDate);
    compareDate.setHours(0, 0, 0, 0);

    const formatted = eventDate.toLocaleDateString(getLocaleForLang(i18n.language), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    if (compareDate.getTime() === today.getTime()) {
      return `${t('events.today')}, ${formatLongDate(dateStr)}`;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (compareDate.getTime() === tomorrow.getTime()) {
      return `${t('events.tomorrow')}, ${formatLongDate(dateStr)}`;
    }

    return formatted;
  } catch {
    return dateStr;
  }
}

function attendeeLabel(count, capacity, t) {
  if (capacity != null && capacity > 0) {
    return t('events.spotsFilled', { count: count ?? 0, capacity });
  }
  if (count <= 0) return t('events.beFirstToJoin');
  if (count === 1) return t('events.onePersonGoing');
  return t('events.peopleGoing', { count });
}

function formatWaitlistJoined(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString(getLocaleForLang(i18n.language), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function joinErrorMessage(err, t) {
  const code = getApiErrorCode(err);
  const message = getApiErrorMessage(err);

  if (code === "event_full") {
    return t('events.eventFullJoinWaitlist');
  }
  if (code === "RSVP_INVALID_RESPONSE") {
    return t('events.rsvpError');
  }
  if (err?.status === 401) {
    return t('events.signInToJoin');
  }
  if (err?.status === 403) {
    return t('events.membershipRequired');
  }
  if (err?.status === 404) {
    return t('events.eventNoLongerAvailable');
  }
  if (message?.toLowerCase().includes("organizer")) {
    return t('events.organizerCannotJoin');
  }

  return message || t('events.couldNotUpdateRsvp');
}

const HERO_ASPECT = 16 / 10;
const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_HEIGHT = SCREEN_WIDTH / HERO_ASPECT;

const SCHEDULE_META = {
  date: { icon: "calendar", color: "#1B4F8A", bg: "#D1FAF5" },
  time: { icon: "clock", color: "#7C3AED", bg: "#F5F3FF" },
  location: { icon: "map-pin", color: "#059669", bg: "#ECFDF5" },
};

function ScheduleRow({ itemKey, title, detail }) {
  const meta = SCHEDULE_META[itemKey] ?? SCHEDULE_META.date;

  return (
    <View style={styles.eventDetailCard}>
      <View style={[styles.eventDetailCardIconWrap, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={sf(20)} color={meta.color} />
      </View>
      <View style={styles.eventDetailCardCopy}>
        <Text style={styles.eventDetailCardTitle}>{title}</Text>
        <Text style={styles.eventDetailCardDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function EventDetailHeader({ title, onBack, onShare, shareDisabled, onReport, canReport }) {
  const { t } = useTranslation();
  return (
    <ScreenHeader
      layout="inline"
      titleAlign="center"
      title={title}
      onBack={onBack}
      iconOnly
      compact
      right={
        <View style={styles.headerActions}>
          {canReport ? (
            <Pressable
              onPress={onReport}
              accessibilityRole="button"
              accessibilityLabel={t('events.reportEventAccessibility')}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <HeaderIconSlot>
                <Feather name="flag" size={sf(20)} color="#101828" />
              </HeaderIconSlot>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onShare}
            disabled={shareDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('events.shareEventAccessibility')}
            style={({ pressed }) => [pressed && shareDisabled !== true && { opacity: 0.85 }]}
          >
            <HeaderIconSlot style={shareDisabled && { opacity: 0.35 }}>
              <Feather name="share-2" size={sf(20)} color="#101828" />
            </HeaderIconSlot>
          </Pressable>
        </View>
      }
    />
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showSuccess, showFailure } = useApiAction();
  const { id: rawId } = useLocalSearchParams();
  const noticeId = resolveNoticeId(rawId);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [error, setError] = useState(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    if (!noticeId) {
      setError(t('events.eventNotFound'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [data, user] = await Promise.all([fetchNotice(noticeId), getUser()]);
      setCurrentUserId(user?.id ?? null);

      if (!isEventNotice(data)) {
        router.replace({ pathname: "/screens/notice-detail", params: { id: noticeId } });
        return;
      }
      setEvent(data);
    } catch {
      setError(t('events.unableToLoadEvent'));
    } finally {
      setLoading(false);
    }
  }, [noticeId, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setHeroImageFailed(false);
  }, [event?.imageUrl]);

  const scheduleItems = useMemo(() => {
    if (!event) return [];

    const items = [];
    const dateLabel = event.eventDate ? formatEventDateLabel(event.eventDate, t) : null;
    const timeRange = formatEventTimeRange(event);
    const location = event.location?.trim();

    if (dateLabel) {
      items.push({
        id: "date",
        title: t('events.date'),
        detail: dateLabel,
      });
    }
    if (timeRange) {
      items.push({
        id: "time",
        title: t('events.time'),
        detail: timeRange,
      });
    }
    if (location) {
      items.push({
        id: "location",
        title: t('events.location'),
        detail: location,
      });
    }
    return items;
  }, [event]);

  const hasHeroImage = Boolean(event?.imageUrl);
  const attendees = event?.attendees ?? [];
  const extraCount = Math.max(0, (event?.rsvpCount ?? 0) - attendees.length);
  const isOrganizer =
    event?.isOrganizer ||
    (currentUserId != null && event?.authorId != null && Number(currentUserId) === Number(event.authorId));
  const canReport = Boolean(event?.canReport) && !isOrganizer;
  const requiresRsvp = Boolean(event?.requiresRsvp);
  const isJoined = Boolean(event?.isJoined);
  const isWaitlisted = Boolean(event?.isWaitlisted);
  const hasCapacityLimit = event?.eventCapacity != null && event.eventCapacity > 0;
  const isAtCapacity =
    !isJoined &&
    !isWaitlisted &&
    !isOrganizer &&
    (Boolean(event?.isFull) ||
      (hasCapacityLimit && (event?.rsvpCount ?? 0) >= event.eventCapacity));
  const waitlist = event?.waitlist ?? [];
  const hasEventEnded = useMemo(
    () => Boolean(event && isNoticeExpiredForHome(event)),
    [event],
  );

  useEffect(() => {
    if (hasEventEnded) {
      setLeavePending(false);
    }
  }, [hasEventEnded]);

  const performJoin = async () => {
    if (!event?.id || joining || isOrganizer || hasEventEnded) return;

    const token = await getToken();
    if (!token) {
      setJoinError(t('events.signInToJoin'));
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinEvent(event.id);
      setEvent(result.event);
      setLeavePending(false);
    } catch (err) {
      if (getApiErrorCode(err) === "event_full" || err?.status === 422) {
        await load();
      }
      setJoinError(joinErrorMessage(err, t));
    } finally {
      setJoining(false);
    }
  };

  const performLeave = async () => {
    if (!event?.id || joining || isOrganizer) return;

    setJoining(true);
    setJoinError(null);
    try {
      const result = await leaveEvent(event.id);
      setEvent(result.event);
      setLeavePending(false);
    } catch (err) {
      setJoinError(joinErrorMessage(err, t));
    } finally {
      setJoining(false);
    }
  };

  const handleRsvpPress = async () => {
    if (!event?.id || joining || isOrganizer || hasEventEnded) return;

    if (isJoined || isWaitlisted) {
      if (!leavePending) {
        setJoinError(null);
        setLeavePending(true);
        return;
      }
      await performLeave();
      return;
    }

    setLeavePending(false);
    await performJoin();
  };

  const handleCancelLeave = () => {
    setLeavePending(false);
    setJoinError(null);
  };

  const handleMessageOrganizer = async () => {
    if (!event?.authorId || messaging || isOrganizer) return;

    setMessaging(true);
    try {
      const data = await startConversation(event.authorId);
      router.push({
        pathname: "/screens/messages/chat",
        params: {
          conversationId: String(data.conversation_id),
          recipientName: event.authorName ?? t('events.organizer'),
        },
      });
    } catch (err) {
      setJoinError(getApiErrorMessage(err));
    } finally {
      setMessaging(false);
    }
  };

  const handleShare = useCallback(async () => {
    if (!event) return;

    const dateLabel = formatEventDateLabel(event.eventDate, t);
    const timeRange = formatEventTimeRange(event);
    const schedule = [dateLabel, timeRange].filter(Boolean).join(" · ");
    const evTitle = localizedField(event, "title") || event.title;
    const evBody = localizedField(event, "body") || event.body;
    const lines = [
      evTitle,
      schedule || null,
      event.location?.trim() ? `${t('events.location')}: ${event.location.trim()}` : null,
      evBody?.trim() || null,
    ].filter(Boolean);

    try {
      await Share.share({
        title: evTitle,
        message: lines.join("\n\n"),
      });
    } catch {
      // user dismissed
    }
  }, [event]);

  const handleReportSubmit = async (payload) => {
    if (!event?.id) return;
    await completeReportAndNotify({
      request: () =>
        fileReport({
          type: payload.type,
          description: payload.description,
          title: t("events.reportedEventTitle", {
            title: localizedField(event, "title") || event.title,
            name: event.authorName ?? t("events.organizer"),
          }),
          reportedUserId: event.authorId,
          noticeId: event.id,
        }),
      close: () => setReportOpen(false),
      setBusy: setReporting,
      notifySuccess: () =>
        showSuccess(t("feed.options.reportSubmitted"), t("events.adminWillReviewEvent")),
      notifyFailure: (error) => showFailure(t("apiAction.actionFailed"), error),
    });
  };

  const joinButtonLabel = useMemo(() => {
    if (isWaitlisted) return t('events.leaveWaitlist');
    if (isJoined) return t('events.leaveEvent');
    if (isAtCapacity) return t('events.joinWaitlist');
    return t('events.joinEvent');
  }, [isAtCapacity, isJoined, isWaitlisted, t]);

  const footerHint = useMemo(() => {
    if (hasEventEnded || isOrganizer || isJoined || leavePending) return null;
    if (isWaitlisted) {
      return event?.waitlistPosition
        ? t('events.waitlistPositionLabel', { position: event.waitlistPosition })
        : t('events.onWaitingList');
    }
    if (isAtCapacity) {
      return t('events.eventFullHint');
    }
    if (hasCapacityLimit && event?.spotsRemaining != null) {
      return t('events.spotsRemaining', { count: event.spotsRemaining });
    }
    if ((event?.rsvpCount ?? 0) > 0) {
      return t('events.neighborsGoing', { count: event.rsvpCount });
    }
    return null;
  }, [event, hasCapacityLimit, hasEventEnded, isAtCapacity, isJoined, isOrganizer, isWaitlisted, leavePending, t]);

  const canChangeRsvp = !hasEventEnded;
  const showRsvpFooter =
    requiresRsvp && (canChangeRsvp || isJoined || isWaitlisted || leavePending);

  if (loading) {
    return (
      <View style={styles.screen}>
        <EventDetailHeader
          title={t('events.eventDetail')}
          onBack={() => router.back()}
          onShare={() => {}}
          shareDisabled
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.screen}>
        <EventDetailHeader
          title={t('events.eventDetail')}
          onBack={() => router.back()}
          onShare={() => {}}
          shareDisabled
        />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t('events.eventNotFound')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>{t('events.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <EventDetailHeader
        title={t('events.eventDetail')}
        onBack={() => router.back()}
        onShare={handleShare}
        canReport={canReport}
        onReport={() => setReportOpen(true)}
      />
      <ScrollView showsVerticalScrollIndicator={false} bounces>
        <Pressable
          style={styles.heroBlock}
          onPress={
            hasHeroImage && !heroImageFailed ? () => setImagePreviewOpen(true) : undefined
          }
          disabled={!hasHeroImage || heroImageFailed}
          accessibilityRole={hasHeroImage && !heroImageFailed ? "imagebutton" : undefined}
          accessibilityLabel={
            hasHeroImage && !heroImageFailed ? t('events.viewEventPhoto') : undefined
          }
        >
          <NoticeCoverMedia
            fill
            imageUrl={event.imageUrl}
            notice={event}
            kind="event"
            onImageError={() => setHeroImageFailed(true)}
          />
          {hasHeroImage && !heroImageFailed ? (
            <View style={[styles.heroHint, { pointerEvents: "none" }]}>
              <Feather name="maximize-2" size={sf(14)} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.upcomingEvent}>
          <Text style={styles.eventTitle}>{localizedField(event, "title") || event.title}</Text>
</View>

        {scheduleItems.length > 0 ? (
          <View style={styles.eventDetailContainer}>
            {scheduleItems.map((item) => (
              <ScheduleRow
                key={item.id}
                itemKey={item.id}
                title={item.title}
                detail={item.detail}
              />
            ))}
          </View>
        ) : null}

        {requiresRsvp ? (
          <View style={styles.section}>
            <View style={styles.attendeeHeader}>
              <Text style={styles.attendeeTitle}>{t('events.whosGoing')}</Text>
              <View style={styles.attendeeCountBadge}>
                <Text style={styles.attendeeCountBadgeText}>
                  {event.rsvpCount ?? 0}
                  {hasCapacityLimit ? ` / ${event.eventCapacity}` : ""}
                </Text>
              </View>
            </View>

            <View style={styles.attendeeCard}>
              {hasCapacityLimit ? (
                <View style={styles.capacityBlock}>
                  <View style={styles.capacityTrack}>
                    <View
                      style={[
                        styles.capacityFill,
                        {
                          width: `${Math.min(
                            100,
                            Math.round(((event.rsvpCount ?? 0) / event.eventCapacity) * 100),
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.capacityLabel}>
                    {attendeeLabel(event.rsvpCount, event.eventCapacity, t)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.capacityLabel}>
                  {attendeeLabel(event.rsvpCount, event.eventCapacity, t)}
                </Text>
              )}

              {attendees.length > 0 ? (
                <View style={styles.attendeeList}>
                  <ScrollView
                    style={styles.attendeeScroll}
                    contentContainerStyle={styles.attendeeScrollContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    persistentScrollbar
                    bounces={false}
                  >
                    {attendees.map((person, index) => (
                      <View
                        key={person.id ?? index}
                        style={[
                          styles.attendeeItem,
                          index < attendees.length - 1 && styles.attendeeItemBorder,
                        ]}
                      >
                        <UserAvatar
                          source={person.avatarUrl}
                          name={person.name}
                          size={sw(32)}
                        />
                        <View style={styles.attendeeCopy}>
                          <Text style={styles.attendeeName} numberOfLines={1}>
                            {person.name || t('events.neighbor')}
                          </Text>
                          <Text style={styles.attendeeMeta}>{t('events.going')}</Text>
                        </View>
                        <View style={styles.goingDot} />
                      </View>
                    ))}
                    {extraCount > 0 ? (
                      <View style={styles.moreRow}>
                        <View style={styles.moreAttendees}>
                          <Text style={styles.moreAttendeesText}>+{extraCount}</Text>
                        </View>
                        <Text style={styles.moreRowText}>
                          {t('events.moreNeighborsGoing', { count: extraCount })}
                        </Text>
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.emptyAttendeesBox}>
                  <View style={styles.emptyAttendeesIcon}>
                    <Feather name="users" size={sf(16)} color="#64748B" />
                  </View>
                  <Text style={styles.emptyAttendees}>
                    {attendeeLabel(0, event.eventCapacity, t)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {requiresRsvp && isOrganizer && hasCapacityLimit ? (
          <View style={styles.section}>
            <Text style={styles.attendeeTitle}>
              {t('events.waitingList')}{waitlist.length > 0 ? ` (${waitlist.length})` : ""}
            </Text>
            {waitlist.length > 0 ? (
              waitlist.map((person) => (
                <View key={person.id} style={styles.waitlistRow}>
                  <View style={styles.waitlistPosition}>
                    <Text style={styles.waitlistPositionText}>#{person.position}</Text>
                  </View>
                  <UserAvatar
                    source={person.avatarUrl}
                    name={person.name}
                    size={sw(40)}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.waitlistName}>{person.name}</Text>
                    <Text style={styles.waitlistMeta}>
                      {t('events.joinedDate', { date: formatWaitlistJoined(person.joinedAt) })}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyAttendees}>{t('events.noWaitlistYet')}</Text>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.attendeeTitle}>{t('events.organizedBy')}</Text>

          <View style={styles.organizerCard}>
            <UserAvatar
              source={event.authorAvatar}
              name={event.authorName ?? t('events.communityAdmin')}
              size={sw(44)}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.organizerName}>{event.authorName ?? t('events.communityAdmin')}</Text>
              <Text style={styles.organizerRole}>
                {isOrganizer ? t('events.youCreatedEvent') : t('events.communityOrganizer')}
              </Text>
            </View>
            {!isOrganizer && event.authorId ? (
              <TouchableOpacity
                style={styles.messageBtn}
                activeOpacity={0.85}
                onPress={handleMessageOrganizer}
                disabled={messaging}
              >
                {messaging ? (
                  <ActivityIndicator size="small" color="#101828" />
                ) : (
                  <Text style={styles.messageBtnText}>{t('events.message')}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {(localizedField(event, "body") || event.body) ? (
          <View style={styles.section}>
            <Text style={styles.attendeeTitle}>{t('events.aboutThisEvent')}</Text>
            <Text style={styles.eventDescription}>{localizedField(event, "body") || event.body}</Text>
          </View>
        ) : null}

        {(isOrganizer || showRsvpFooter) ? (
        <View style={styles.footer}>
          {isOrganizer ? (
            <TouchableOpacity
              style={styles.shareEventBtn}
              activeOpacity={0.9}
              onPress={handleShare}
            >
              <Feather name="share-2" size={sf(20)} color="#FFFFFF" />
              <Text style={styles.shareEventBtnText}>{t('events.shareEvent')}</Text>
            </TouchableOpacity>
          ) : showRsvpFooter && leavePending && canChangeRsvp ? (
            <View style={styles.leaveConfirmBox}>
              <Text style={styles.leaveConfirmText}>
                {isWaitlisted ? t('events.leaveWaitlistConfirm') : t('events.leaveEventConfirm')}
              </Text>
              <Text style={styles.leaveConfirmHint}>
                {isWaitlisted
                  ? t('events.loseQueuePlace')
                  : t('events.removedFromGuestList')}
              </Text>
              <View style={styles.leaveConfirmActions}>
                <TouchableOpacity
                  style={styles.leaveCancelBtn}
                  activeOpacity={0.85}
                  onPress={handleCancelLeave}
                  disabled={joining}
                >
                  <Text style={styles.leaveCancelText}>{t('events.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leaveConfirmBtn, joining && styles.joinBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleRsvpPress}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.leaveConfirmBtnText}>{t('events.leaveEventBtn')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : showRsvpFooter ? (
            <>
              {isJoined ? (
                <View style={styles.goingBadge}>
                  <Feather name="check-circle" size={sf(18)} color="#059669" />
                  <Text style={styles.goingBadgeText}>{t('events.youreGoing')}</Text>
                </View>
              ) : null}
              {isWaitlisted ? (
                <View style={styles.waitlistBadge}>
                  <Feather name="clock" size={sf(18)} color="#7C3AED" />
                  <Text style={styles.waitlistBadgeText}>
                    {event.waitlistPosition
                      ? t('events.waitlistPositionLabel', { position: event.waitlistPosition })
                      : t('events.onWaitingList')}
                  </Text>
                </View>
              ) : null}
              {footerHint ? (
                <Text style={styles.footerHint}>{footerHint}</Text>
              ) : null}
              {joinError ? (
                <View style={styles.joinErrorBanner}>
                  <Text style={styles.joinErrorText}>{joinError}</Text>
                </View>
              ) : null}
              {canChangeRsvp ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[
                    styles.joinBtn,
                    (isJoined || isWaitlisted) && styles.joinBtnLeave,
                    isAtCapacity && !isWaitlisted && styles.joinBtnWaitlist,
                    joining && styles.joinBtnDisabled,
                  ]}
                  onPress={handleRsvpPress}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator
                      size="small"
                      color={isJoined || isWaitlisted ? "#DC2626" : "#FFFFFF"}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.joinBtnText,
                        (isJoined || isWaitlisted) && styles.joinBtnTextLeave,
                        isAtCapacity && !isWaitlisted && styles.joinBtnTextWaitlist,
                      ]}
                    >
                      {joinButtonLabel}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
        ) : null}
      </ScrollView>

      {canReport ? (
        <FeedPostReportSheet
          visible={reportOpen}
          post={{
            id: event.id,
            user_id: event.authorId,
            user: { display_name: event.authorName, name: event.authorName },
          }}
          submitting={reporting}
          reasonKind="event"
          resetKey={event.id}
          title={t("events.reportEvent")}
          subtitle={t("events.reportEventSubtitle", {
            name: event.authorName ?? t("events.organizer"),
          })}
          onClose={() => setReportOpen(false)}
          onSubmit={handleReportSubmit}
        />
      ) : null}

      <Modal
        visible={imagePreviewOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImagePreviewOpen(false)}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.previewRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setImagePreviewOpen(false)}
            accessibilityLabel={t('events.closePhoto')}
          />
          <CrispImage
            source={{ uri: event.imageUrl }}
            style={styles.previewImage}
            contentFit="contain"
            contentPosition="center"
            transition={220}
            allowDownscaling
            recyclingKey={`preview-${event.imageUrl}`}
          />
          <Pressable
            onPress={() => setImagePreviewOpen(false)}
            style={[styles.previewClose, { top: Math.max(insets.top, 12) + 8 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('events.close')}
          >
            <Feather name="x" size={sf(20)} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  heroBlock: {
    width: "100%",
    height: HERO_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#D1FAF5",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroHint: {
    position: "absolute",
    end: sw(12),
    bottom: sw(12),
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: "78%",
  },
  previewClose: {
    position: "absolute",
    end: sw(16),
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  errorText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: "#667085",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#D1FAF5",
  },
  retryText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#1B4F8A",
  },
  upcomingEvent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  eventTitle: {
    fontSize: sf(19),
    lineHeight: sf(25),
    fontWeight: "700",
    color: "#101828",
    fontFamily: Fonts.bold,
  },
  eventDescription: {
    fontSize: sf(13),
    lineHeight: sf(19),
    fontWeight: "400",
    color: "#364153",
    fontFamily: Fonts.regular,
  },
  eventDetailContainer: {
    paddingHorizontal: 20,
    flexDirection: "column",
    gap: 12,
  },
  eventDetailCard: {
    padding: 16,
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  eventDetailCardIconWrap: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventDetailCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventDetailCardTitle: {
    fontSize: sf(12),
    fontWeight: "600",
    color: "rgba(106, 114, 130, 1)",
    lineHeight: sf(16),
    fontFamily: Fonts.semiBold,
    textTransform: "uppercase",
  },
  eventDetailCardDetail: {
    fontSize: sf(13),
    fontWeight: "700",
    color: "rgba(16, 24, 40, 1)",
    lineHeight: sf(18),
    fontFamily: Fonts.medium,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexDirection: "column",
    gap: 12,
  },
  attendeeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(10),
  },
  attendeeTitle: {
    fontSize: sf(14),
    lineHeight: sf(20),
    fontWeight: "700",
    color: "#101828",
    fontFamily: Fonts.bold,
  },
  attendeeCountBadge: {
    backgroundColor: "#D1FAF5",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
  },
  attendeeCountBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#1B4F8A",
    fontWeight: "600",
  },
  attendeeCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(14),
    padding: sw(10),
    gap: sw(8),
  },
  capacityBlock: {
    gap: sw(6),
  },
  capacityTrack: {
    height: sw(5),
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  capacityFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#1B4F8A",
  },
  capacityLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#475569",
    fontWeight: "500",
  },
  attendeeList: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  attendeeScroll: {
    maxHeight: sw(132),
  },
  attendeeScrollContent: {
    flexGrow: 0,
  },
  attendeeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(10),
    paddingVertical: sw(7),
  },
  attendeeItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  attendeeCopy: {
    flex: 1,
    minWidth: 0,
  },
  attendeeName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#0F172A",
    fontWeight: "600",
  },
  attendeeMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#64748B",
  },
  goingDot: {
    width: sw(7),
    height: sw(7),
    borderRadius: sw(4),
    backgroundColor: "#22C55E",
    flexShrink: 0,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(10),
    paddingVertical: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
  },
  moreAttendees: {
    width: sw(28),
    height: sw(28),
    justifyContent: "center",
    alignItems: "center",
    borderRadius: sw(14),
    backgroundColor: "#E2E8F0",
    flexShrink: 0,
  },
  moreAttendeesText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    color: "#334155",
    lineHeight: sf(13),
  },
  moreRowText: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#475569",
    fontWeight: "500",
  },
  emptyAttendeesBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(2),
  },
  emptyAttendeesIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAttendees: {
    flex: 1,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#64748B",
    fontFamily: Fonts.regular,
  },
  organizerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(249, 250, 251, 1)",
    padding: 14,
    borderRadius: 14,
    justifyContent: "space-between",
  },
  organizerName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    fontWeight: "700",
    color: "rgba(16, 24, 40, 1)",
    lineHeight: sf(18),
  },
  organizerRole: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    fontWeight: "400",
    color: "rgba(74, 85, 101, 1)",
    lineHeight: sf(16),
  },
  messageBtn: {
    minWidth: sw(84),
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    fontWeight: "700",
    color: "rgba(16, 24, 40, 1)",
    lineHeight: sf(16),
  },
  footer: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 10,
  },
  footerHint: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
    textAlign: "center",
    lineHeight: sf(16),
  },
  goingBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  goingBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#047857",
    fontWeight: "600",
  },
  waitlistBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  waitlistBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#7C3AED",
    fontWeight: "600",
    flexShrink: 1,
  },
  waitlistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  waitlistPosition: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(16),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
  },
  waitlistPositionText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#7C3AED",
  },
  waitlistName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#101828",
  },
  waitlistMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#667085",
    marginTop: 2,
  },
  joinErrorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  joinErrorText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#B91C1C",
    lineHeight: sf(16),
    textAlign: "center",
  },
  leaveConfirmBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  leaveConfirmText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#101828",
    fontWeight: "700",
    textAlign: "center",
  },
  leaveConfirmHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    textAlign: "center",
    lineHeight: sf(16),
  },
  leaveConfirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  leaveCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  leaveCancelText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#475569",
    fontWeight: "700",
  },
  leaveConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
  },
  leaveConfirmBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  joinBtn: {
    paddingVertical: 16,
    backgroundColor: "#1B4F8A",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  joinBtnLeave: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#FECACA",
  },
  joinBtnDisabled: {
    opacity: 0.7,
  },
  joinBtnWaitlist: {
    backgroundColor: "#7C3AED",
  },
  joinBtnTextWaitlist: {
    color: "#FFFFFF",
  },
  joinBtnFull: {
    backgroundColor: "#E5E7EB",
    borderWidth: 0,
  },
  joinBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: sf(18),
  },
  joinBtnTextLeave: {
    color: "#DC2626",
  },
  joinBtnTextFull: {
    color: "#6B7280",
  },
  shareEventBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#1B4F8A",
  },
  shareEventBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
