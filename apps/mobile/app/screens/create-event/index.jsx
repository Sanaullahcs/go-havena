import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import ScreenHeader from "../../../components/layout/screen-header";
import {
  createEvent,
  submitResidentEvent,
  publishNoticeWithImage,
  uploadNoticeImage,
  uploadResidentEventImage,
} from "../../../services/notices-api";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useApiAction } from "../../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { toApiDate, toApiTime, toApiDateTime, toApiScheduleDateTime } from "../../../utils/form-datetime";
import {
  defaultEndTimeFromStart,
  hasFieldErrors,
  LIMITS,
  validateNoticeForm,
} from "../../../utils/form-validation";
import SchedulePickerField from "../../../components/forms/schedule-picker-field";
import NoticeCoverImageField from "../../../components/forms/notice-cover-image-field";
import { fetchMe } from "../../../services/profile-api";
import { getUser } from "../../../services/auth-session";
import { isCommunityAdmin } from "../../../services/community-access";

export default function CreateEventScreen() {
  const router = useRouter();
  const { submitting, run } = useSubmitLock();
  const { runAction } = useApiAction();
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [timeEnd, setTimeEnd] = useState(null);
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [requireRsvp, setRequireRsvp] = useState(false);
  const [pinToTop, setPinToTop] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [schedulePublishDate, setSchedulePublishDate] = useState(null);
  const [schedulePublishTime, setSchedulePublishTime] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { errors, setErrors, touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const applyStartTime = (start) => {
    setTime(start);
    touch("event_time");
    clearError("event_time");
    if (!timeEnd || timeEnd.getTime() <= start.getTime()) {
      const nextEnd = defaultEndTimeFromStart(start);
      if (nextEnd) {
        setTimeEnd(nextEnd);
        clearError("event_time_end");
      }
    }
  };

  const applyQuickDate = (daysFromToday) => {
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + daysFromToday);
    setDate(next);
    touch("event_date");
    clearError("event_date");
  };

  const applyQuickStartInHours = (hoursFromNow) => {
    const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    start.setSeconds(0, 0);
    applyStartTime(start);
    if (!date) {
      const d = new Date(start);
      d.setHours(12, 0, 0, 0);
      setDate(d);
      touch("event_date");
      clearError("event_date");
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const user = await fetchMe();
        if (!cancelled) setIsAdmin(isCommunityAdmin(user));
      } catch {
        const user = await getUser();
        if (!cancelled) setIsAdmin(isCommunityAdmin(user));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const formValues = useMemo(
    () => ({
      title,
      body: description,
      location,
      event_date: toApiDate(date) ?? "",
      event_time: toApiTime(time) ?? "",
      event_time_end: toApiTime(timeEnd) ?? "",
      scheduled_date: scheduleLater ? toApiDate(schedulePublishDate) ?? "" : "",
      scheduled_time: scheduleLater ? toApiTime(schedulePublishTime) ?? "" : "",
    }),
    [title, description, location, date, time, timeEnd, scheduleLater, schedulePublishDate, schedulePublishTime],
  );

  const validationOpts = useMemo(
    () => ({
      kind: "event",
      publishNow: true,
      requireLocation: true,
      requirePublishSchedule: scheduleLater && isAdmin,
    }),
    [scheduleLater, isAdmin],
  );

  const fieldErrorsLive = useMemo(
    () => validateNoticeForm(formValues, validationOpts),
    [formValues, validationOpts],
  );

  const canPublish = useMemo(() => !hasFieldErrors(fieldErrorsLive), [fieldErrorsLive]);

  useEffect(() => {
    if (!time || !timeEnd) return;
    setErrors((prev) => {
      if (timeEnd.getTime() > time.getTime()) {
        if (!prev.event_time_end) return prev;
        const next = { ...prev };
        delete next.event_time_end;
        return next;
      }
      return { ...prev, event_time_end: "End time must be after start time." };
    });
  }, [time, timeEnd, setErrors]);

  const handlePublish = () => {
    if (submitting || uploadingImage) return;

    const fieldErrors = validateNoticeForm(formValues, validationOpts);
    if (!validateOnSubmit(fieldErrors)) return;

    run(async () => {
      try {
        setUploadingImage(Boolean(coverImage?.uri));
        await runAction({
          action: async () => {
            const createFn = isAdmin ? createEvent : submitResidentEvent;
            const uploadImage = isAdmin ? uploadNoticeImage : uploadResidentEventImage;
            return publishNoticeWithImage(
              coverImage,
              createFn,
              {
                title: title.trim(),
                body: description.trim(),
                location: location.trim(),
                event_date: toApiDate(date),
                event_time: toApiTime(time),
                event_time_end: toApiTime(timeEnd),
                event_capacity: capacity.trim() ? Number(capacity.trim()) : undefined,
                requires_rsvp: requireRsvp,
                ...(isAdmin
                  ? {
                      is_pinned: pinToTop,
                      status: scheduleLater ? "draft" : "published",
                      scheduled_at: scheduleLater
                        ? toApiScheduleDateTime(schedulePublishDate, schedulePublishTime)
                        : undefined,
                    }
                  : {}),
              },
              { uploadImage },
            );
          },
          successTitle: isAdmin ? (scheduleLater ? "Scheduled" : "Published") : "Submitted",
          successMessage: isAdmin
            ? scheduleLater
              ? "Your event was saved and will publish at the scheduled time."
              : "Your event was published."
            : "Your event was submitted for admin approval.",
          errorTitle: "Could not publish",
          onSuccess: () => router.back(),
        });
      } finally {
        setUploadingImage(false);
      }
    });
  };

  const CustomToggle = ({ value, onValueChange }) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onValueChange(!value)}>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </TouchableOpacity>
  );

  const getFieldIcon = (type) => {
    switch (type) {
      case "calendar-outline":
        return require("../../../assets/images/black-date.png");
      case "time-outline":
        return require("../../../assets/images/black-time.png");
      case "location-outline":
        return require("../../../assets/images/black-location.png");
      default:
        return null;
    }
  };

  const renderFieldLabel = (iconName, label, required = true) => {
    const iconSource = getFieldIcon(iconName);
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {iconSource && (
          <Image source={iconSource} style={{ width: 16, height: 16 }} />
        )}
        <Text style={styles.labelText}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title="Create Event" iconOnly />

      <ScrollView showsVerticalScrollIndicator={false} style={styles.contentWrap}>
        <View style={styles.formWrap}>
          <Text style={styles.formLabel}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              touch("title");
              clearError("title");
            }}
            placeholder="e.g., Community Yoga Session"
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={[styles.input, showError("title", fieldErrorsLive) && styles.inputError]}
            maxLength={LIMITS.noticeTitle}
          />
          {showError("title", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("title", fieldErrorsLive)}</Text> : null}

          <Text style={[styles.formLabel, styles.sectionGap]}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              touch("body");
              clearError("body");
            }}
            placeholder="Add details about this notice..."
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={[styles.textArea, showError("body", fieldErrorsLive) && styles.inputError]}
            multiline
            textAlignVertical="top"
            maxLength={LIMITS.noticeBody}
          />
          {showError("body", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("body", fieldErrorsLive)}</Text> : null}

          <NoticeCoverImageField
            value={coverImage}
            onChange={setCoverImage}
            uploading={uploadingImage}
          />

          <View style={styles.sectionGap}>
            {renderFieldLabel("calendar-outline", "Date", true)}
          </View>
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.chip} onPress={() => applyQuickDate(0)} activeOpacity={0.85}>
              <Text style={styles.chipText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => applyQuickDate(1)} activeOpacity={0.85}>
              <Text style={styles.chipText}>Tomorrow</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => {
                applyQuickDate(0);
                applyQuickStartInHours(1);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.chipText}>Fill schedule</Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="date"
            value={date}
            onChange={(v) => {
              setDate(v);
              touch("event_date");
              clearError("event_date");
            }}
            placeholder="mm/dd/yyyy"
            inputStyle={[styles.input, showError("event_date", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_date", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("event_date", fieldErrorsLive)}</Text> : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("time-outline", "Time from", true)}
          </View>
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.chip} onPress={() => applyQuickStartInHours(0)} activeOpacity={0.85}>
              <Text style={styles.chipText}>Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => applyQuickStartInHours(1)} activeOpacity={0.85}>
              <Text style={styles.chipText}>In 1 hour</Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="time"
            value={time}
            onChange={(v) => applyStartTime(v)}
            placeholder="Start time"
            inputStyle={[styles.input, showError("event_time", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("event_time", fieldErrorsLive)}</Text> : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("time-outline", "Time to", true)}
          </View>
          <SchedulePickerField
            mode="time"
            value={timeEnd}
            onChange={(v) => {
              setTimeEnd(v);
              touch("event_time_end");
              clearError("event_time_end");
            }}
            placeholder="End time (after start)"
            inputStyle={[styles.input, showError("event_time_end", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time_end", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_time_end", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("location-outline", "Location", true)}
          </View>
          <TextInput
            value={location}
            onChangeText={(t) => {
              setLocation(t);
              touch("location");
              clearError("location");
            }}
            placeholder="e.g., Community Center"
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={[styles.input, showError("location", fieldErrorsLive) && styles.inputError]}
            maxLength={LIMITS.location}
          />
          {showError("location", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("location", fieldErrorsLive)}</Text> : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("people-outline", "Capacity", false)}
          </View>
          <TextInput
            value={capacity}
            onChangeText={(t) => setCapacity(t.replace(/[^\d]/g, ""))}
            placeholder="Unlimited if empty"
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Text style={styles.optionSubtitle}>Maximum attendees who can join this event.</Text>

          <View style={[styles.optionRow, styles.sectionGap]}>
            <View style={styles.optionLeft}>
              <View style={styles.fieldLabelRow}>
                <Image
                  source={require("../../../assets/images/black-rsvp.png")}
                  style={{ width: 20, height: 20 }}
                />
                <View>
                  <Text style={styles.optionTitle}>Require RSVP</Text>
                  <Text style={styles.optionSubtitle}>Track attendance</Text>
                </View>
              </View>
            </View>
            <CustomToggle value={requireRsvp} onValueChange={setRequireRsvp} />
          </View>

          {isAdmin ? (
            <>
              <Text style={styles.adminOptionsTitle}>ADMIN OPTIONS</Text>

              <View style={[styles.optionRow, styles.adminOptionSpacing]}>
                <View style={styles.optionLeft}>
                  <Text style={styles.optionTitle}>Pin to Top</Text>
                  <Text style={styles.optionSubtitle}>
                    Keep this notice at the top
                  </Text>
                </View>
                <CustomToggle value={pinToTop} onValueChange={setPinToTop} />
              </View>

              <View style={styles.optionRow}>
                <View style={styles.optionLeft}>
                  <Text style={styles.optionTitle}>Schedule for Later</Text>
                  <Text style={styles.optionSubtitle}>
                    Publish at a specific time
                  </Text>
                </View>
                <CustomToggle
                  value={scheduleLater}
                  onValueChange={(value) => {
                    setScheduleLater(value);
                    if (!value) {
                      setSchedulePublishDate(null);
                      setSchedulePublishTime(null);
                      clearError("scheduled_date");
                      clearError("scheduled_time");
                    }
                  }}
                />
              </View>

              {scheduleLater ? (
                <View style={styles.scheduleCard}>
                  <SchedulePickerField
                    mode="date"
                    value={schedulePublishDate}
                    onChange={(v) => {
                      setSchedulePublishDate(v);
                      touch("scheduled_date");
                      clearError("scheduled_date");
                    }}
                    placeholder="Publish date"
                    inputStyle={[styles.input, showError("scheduled_date", fieldErrorsLive) && styles.inputError]}
                  />
                  {showError("scheduled_date", fieldErrorsLive) ? (
                    <Text style={styles.errorText}>{showError("scheduled_date", fieldErrorsLive)}</Text>
                  ) : null}
                  <SchedulePickerField
                    mode="time"
                    value={schedulePublishTime}
                    onChange={(v) => {
                      setSchedulePublishTime(v);
                      touch("scheduled_time");
                      clearError("scheduled_time");
                    }}
                    placeholder="Publish time"
                    inputStyle={[styles.input, styles.scheduleTimeInput, showError("scheduled_time", fieldErrorsLive) && styles.inputError]}
                  />
                  {showError("scheduled_time", fieldErrorsLive) ? (
                    <Text style={styles.errorText}>{showError("scheduled_time", fieldErrorsLive)}</Text>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.publishWrap}>
        <TouchableOpacity
          activeOpacity={canPublish && !submitting && !uploadingImage ? 0.85 : 1}
          style={[
            styles.publishButton,
            (submitting || uploadingImage || !canPublish) && styles.publishButtonDisabled,
          ]}
          onPress={handlePublish}
          disabled={submitting || uploadingImage || !canPublish}
        >
          {submitting || uploadingImage ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.publishButtonText}>
              {isAdmin ? (scheduleLater ? "Schedule" : "Publish") : "Submit for Approval"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerWrap: {
    marginTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243, 244, 246, 1)",
  },
  titleText: {
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: "#111827",
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  contentWrap: {
    flex: 1,
  },
  formWrap: {
    padding: 24,
  },
  formLabel: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  required: {
    color: "#FF3B30",
  },
  sectionGap: {
    marginTop: 24,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  labelText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  input: {
    marginTop: 8,
    height: 56,
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#111827",
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  textArea: {
    marginTop: 8,
    minHeight: 100,
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "rgba(10, 10, 10, 1)",
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  optionRow: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionLeft: {
    flex: 1,
    paddingRight: 12,
  },
  adminOptionsTitle: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(243, 244, 246, 1)",
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
    letterSpacing: 0.3,
    fontWeight: "700",
  },
  adminOptionSpacing: {
    marginTop: 16,
  },
  scheduleCard: {
    marginTop: 12,
    gap: 8,
  },
  scheduleTimeInput: {
    marginTop: 8,
  },
  optionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "#111827",
    fontWeight: "700",
  },
  optionSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(74, 85, 101, 1)",
    fontWeight: "400",
  },
  toggleTrack: {
    width: 46,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackOn: {
    backgroundColor: "#67D26F",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginRight: 10,
    marginBottom: 8,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#0A2A43",
  },
  publishWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  publishButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(20, 184, 166, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  publishButtonDisabled: {
    opacity: 0.45,
  },
  publishButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255, 255, 255, 1)",
    fontWeight: "700",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    marginTop: 4,
  },
});
