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
import { startConversation } from "../../../services/messages-api";
import { getUser, getToken } from "../../../services/auth-session";
import { getApiErrorMessage, getApiErrorCode } from "../../../utils/auth-errors";

function formatEventDateLabel(dateStr) {
  if (!dateStr) return null;

  try {
    const eventDate = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(eventDate);
    compareDate.setHours(0, 0, 0, 0);

    const formatted = eventDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    if (compareDate.getTime() === today.getTime()) {
      return `Today, ${formatLongDate(dateStr)}`;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (compareDate.getTime() === tomorrow.getTime()) {
      return `Tomorrow, ${formatLongDate(dateStr)}`;
    }

    return formatted;
  } catch {
    return dateStr;
  }
}

function attendeeLabel(count, capacity) {
  if (capacity != null && capacity > 0) {
    if (count <= 0) return `0 / ${capacity} spots filled`;
    return `${count} / ${capacity} spots filled`;
  }
  if (count <= 0) return "Be the first to join";
  if (count === 1) return "1 person is going";
  return `${count} people are going`;
}

function formatWaitlistJoined(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function joinErrorMessage(err) {
  const code = getApiErrorCode(err);
  const message = getApiErrorMessage(err);

  if (code === "event_full") {
    return "This event is full. You can join the waiting list.";
  }
  if (code === "RSVP_INVALID_RESPONSE") {
    return "We couldn't confirm your RSVP. Please try again.";
  }
  if (err?.status === 401) {
    return "Please sign in to join this event.";
  }
  if (err?.status === 403) {
    return "Approved community membership is required to join events.";
  }
  if (err?.status === 404) {
    return "This event is no longer available.";
  }
  if (message?.toLowerCase().includes("organizer")) {
    return "Event organizers cannot join their own event.";
  }

  return message || "Could not update your RSVP. Please try again.";
}

const HERO_ASPECT = 16 / 10;
const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_HEIGHT = SCREEN_WIDTH / HERO_ASPECT;

const SCHEDULE_META = {
  date: { icon: "calendar", color: "#0A2A43", bg: "#D1FAF5" },
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

function EventDetailHeader({ title, onBack, onShare, shareDisabled }) {
  return (
    <ScreenHeader
      layout="inline"
      titleAlign="center"
      title={title}
      onBack={onBack}
      iconOnly
      compact
      right={
        <Pressable
          onPress={onShare}
          disabled={shareDisabled}
          accessibilityRole="button"
          accessibilityLabel="Share event"
          style={({ pressed }) => [pressed && shareDisabled !== true && { opacity: 0.85 }]}
        >
          <HeaderIconSlot style={shareDisabled && { opacity: 0.35 }}>
            <Feather name="share-2" size={sf(20)} color="#101828" />
          </HeaderIconSlot>
        </Pressable>
      }
    />
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const load = useCallback(async () => {
    if (!noticeId) {
      setError("Event not found.");
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
      setError("Unable to load this event. Please try again.");
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
    const dateLabel = event.eventDate ? formatEventDateLabel(event.eventDate) : null;
    const timeRange = formatEventTimeRange(event);
    const location = event.location?.trim();

    if (dateLabel) {
      items.push({
        id: "date",
        title: "Date",
        detail: dateLabel,
      });
    }
    if (timeRange) {
      items.push({
        id: "time",
        title: "Time",
        detail: timeRange,
      });
    }
    if (location) {
      items.push({
        id: "location",
        title: "Location",
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

  const performJoin = async () => {
    if (!event?.id || joining || isOrganizer) return;

    const token = await getToken();
    if (!token) {
      setJoinError("Please sign in to join this event.");
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
      setJoinError(joinErrorMessage(err));
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
      setJoinError(joinErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const handleRsvpPress = async () => {
    if (!event?.id || joining || isOrganizer) return;

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
          recipientName: event.authorName ?? "Organizer",
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

    const dateLabel = formatEventDateLabel(event.eventDate);
    const timeRange = formatEventTimeRange(event);
    const schedule = [dateLabel, timeRange].filter(Boolean).join(" · ");
    const lines = [
      event.title,
      schedule || null,
      event.location?.trim() ? `Location: ${event.location.trim()}` : null,
      event.body?.trim() || null,
    ].filter(Boolean);

    try {
      await Share.share({
        title: event.title,
        message: lines.join("\n\n"),
      });
    } catch {
      // user dismissed
    }
  }, [event]);

  const joinButtonLabel = useMemo(() => {
    if (isWaitlisted) return "Leave Waitlist";
    if (isJoined) return "Leave Event";
    if (isAtCapacity) return "Join Waitlist";
    return "Join Event";
  }, [isAtCapacity, isJoined, isWaitlisted]);

  const footerHint = useMemo(() => {
    if (isOrganizer || isJoined || leavePending) return null;
    if (isWaitlisted) {
      return event?.waitlistPosition
        ? `You're #${event.waitlistPosition} on the waiting list`
        : "You're on the waiting list";
    }
    if (isAtCapacity) {
      return "Event is full — join the waiting list for the next open seat";
    }
    if (hasCapacityLimit && event?.spotsRemaining != null) {
      return event.spotsRemaining === 1
        ? "1 spot remaining"
        : `${event.spotsRemaining} spots remaining`;
    }
    if ((event?.rsvpCount ?? 0) > 0) {
      return `${event.rsvpCount} ${event.rsvpCount === 1 ? "neighbor is" : "neighbors are"} going`;
    }
    return null;
  }, [event, hasCapacityLimit, isAtCapacity, isJoined, isOrganizer, isWaitlisted, leavePending]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <EventDetailHeader
          title="Event Detail"
          onBack={() => router.back()}
          onShare={() => {}}
          shareDisabled
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.screen}>
        <EventDetailHeader
          title="Event Detail"
          onBack={() => router.back()}
          onShare={() => {}}
          shareDisabled
        />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "Event not found."}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <EventDetailHeader
        title="Event Detail"
        onBack={() => router.back()}
        onShare={handleShare}
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
            hasHeroImage && !heroImageFailed ? "View event photo" : undefined
          }
        >
          <NoticeCoverMedia
            fill
            imageUrl={event.imageUrl}
            onImageError={() => setHeroImageFailed(true)}
          />
          {hasHeroImage && !heroImageFailed ? (
            <View style={styles.heroHint} pointerEvents="none">
              <Feather name="maximize-2" size={sf(14)} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.upcomingEvent}>
          <Text style={styles.eventTitle}>{event.title}</Text>
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
              <Text style={styles.attendeeTitle}>Who's Going</Text>
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
                    {attendeeLabel(event.rsvpCount, event.eventCapacity)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.capacityLabel}>
                  {attendeeLabel(event.rsvpCount, event.eventCapacity)}
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
                            {person.name || "Neighbor"}
                          </Text>
                          <Text style={styles.attendeeMeta}>Going</Text>
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
                          {extraCount === 1
                            ? "1 more neighbor is going"
                            : `${extraCount} more neighbors are going`}
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
                    {attendeeLabel(0, event.eventCapacity)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {requiresRsvp && isOrganizer && hasCapacityLimit ? (
          <View style={styles.section}>
            <Text style={styles.attendeeTitle}>
              Waiting List{waitlist.length > 0 ? ` (${waitlist.length})` : ""}
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
                      Joined {formatWaitlistJoined(person.joinedAt)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyAttendees}>No one is on the waiting list yet.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.attendeeTitle}>Organized By</Text>

          <View style={styles.organizerCard}>
            <UserAvatar
              source={event.authorAvatar}
              name={event.authorName ?? "Community Admin"}
              size={sw(44)}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.organizerName}>{event.authorName ?? "Community Admin"}</Text>
              <Text style={styles.organizerRole}>
                {isOrganizer ? "You created this event" : "Community Organizer"}
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
                  <Text style={styles.messageBtnText}>Message</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {event.body ? (
          <View style={styles.section}>
            <Text style={styles.attendeeTitle}>About This Event</Text>
            <Text style={styles.eventDescription}>{event.body}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          {isOrganizer ? (
            <TouchableOpacity
              style={styles.shareEventBtn}
              activeOpacity={0.9}
              onPress={handleShare}
            >
              <Feather name="share-2" size={sf(20)} color="#FFFFFF" />
              <Text style={styles.shareEventBtnText}>Share Event</Text>
            </TouchableOpacity>
          ) : requiresRsvp && leavePending ? (
            <View style={styles.leaveConfirmBox}>
              <Text style={styles.leaveConfirmText}>
                {isWaitlisted ? "Leave the waiting list?" : "Leave this event?"}
              </Text>
              <Text style={styles.leaveConfirmHint}>
                {isWaitlisted
                  ? "You will lose your place in the queue."
                  : "You will be removed from the guest list."}
              </Text>
              <View style={styles.leaveConfirmActions}>
                <TouchableOpacity
                  style={styles.leaveCancelBtn}
                  activeOpacity={0.85}
                  onPress={handleCancelLeave}
                  disabled={joining}
                >
                  <Text style={styles.leaveCancelText}>Cancel</Text>
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
                    <Text style={styles.leaveConfirmBtnText}>Leave event</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : requiresRsvp ? (
            <>
              {isJoined ? (
                <View style={styles.goingBadge}>
                  <Feather name="check-circle" size={sf(18)} color="#059669" />
                  <Text style={styles.goingBadgeText}>You're going to this event</Text>
                </View>
              ) : null}
              {isWaitlisted ? (
                <View style={styles.waitlistBadge}>
                  <Feather name="clock" size={sf(18)} color="#7C3AED" />
                  <Text style={styles.waitlistBadgeText}>
                    {event.waitlistPosition
                      ? `You're #${event.waitlistPosition} on the waiting list`
                      : "You're on the waiting list"}
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
            </>
          ) : null}
        </View>
      </ScrollView>

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
            accessibilityLabel="Close photo"
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
            accessibilityLabel="Close"
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
    right: sw(12),
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
    right: sw(16),
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
    color: "#0A2A43",
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
    color: "#0A2A43",
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
    backgroundColor: "#0A2A43",
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
    backgroundColor: "#0A2A43",
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
    backgroundColor: "#0A2A43",
  },
  shareEventBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
