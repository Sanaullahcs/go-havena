import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { KeyboardScroll } from "../../../components/ui/keyboard-form";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Fonts } from "../../../constants/font";
import { selectionChipStyles as chipTheme } from "../../../constants/selection-chip-styles";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import ScreenHeader from "../../../components/layout/screen-header";
import { createAlert, publishNoticeWithImage } from "../../../services/notices-api";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useApiAction } from "../../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { toApiDate, toApiTime, toApiScheduleDateTime } from "../../../utils/form-datetime";
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
import { useTranslation } from 'react-i18next';

export default function CreateAlertScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { submitting, run } = useSubmitLock();
  const { runAction, showFailure } = useApiAction();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [alertDate, setAlertDate] = useState(null);
  const [endAlertDate, setEndAlertDate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [schedulePublishDate, setSchedulePublishDate] = useState(null);
  const [schedulePublishTime, setSchedulePublishTime] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dateShortcut, setDateShortcut] = useState(null);
  const [timeShortcut, setTimeShortcut] = useState(null);
  const { errors, setErrors, touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const touchPublishScheduleFields = () => {
    if (!scheduleLater) return;
    touch("scheduled_date");
    touch("scheduled_time");
  };

  const syncEndAlertDate = (startDate, currentEnd) => {
    const startKey = toApiDate(startDate);
    const endKey = toApiDate(currentEnd);
    if (!startKey || !endKey) return;
    if (endKey < startKey) {
      setEndAlertDate(startDate);
      touch("event_end_date");
      clearError("event_end_date");
    }
  };

  const applyStartTime = (start) => {
    setStartTime(start);
    touch("event_time");
    clearError("event_time");
    touchPublishScheduleFields();
    if (endTime && endTime.getTime() <= start.getTime()) {
      const nextEnd = defaultEndTimeFromStart(start);
      if (nextEnd) {
        setEndTime(nextEnd);
        clearError("event_time_end");
      }
    }
  };

  const applyQuickDate = (daysFromToday, shortcut) => {
    setDateShortcut(shortcut);
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + daysFromToday);
    setAlertDate(next);
    syncEndAlertDate(next, endAlertDate);
    touch("event_date");
    clearError("event_date");
    touchPublishScheduleFields();
  };

  const applyQuickStartInHours = (hoursFromNow, shortcut) => {
    if (shortcut) setTimeShortcut(shortcut);
    const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    start.setSeconds(0, 0);
    applyStartTime(start);
    if (!alertDate) {
      setDateShortcut((current) => current ?? "today");
      const d = new Date(start);
      d.setHours(12, 0, 0, 0);
      setAlertDate(d);
      touch("event_date");
      clearError("event_date");
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const user = await fetchMe();
        if (!cancelled && !isCommunityAdmin(user)) {
          await showFailure(t("alerts.accessDenied"), { message: t("alerts.onlyAdminsCanCreateAlerts") });
          router.back();
        }
      } catch {
        const user = await getUser();
        if (!cancelled && !isCommunityAdmin(user)) {
          await showFailure(t("alerts.accessDenied"), { message: t("alerts.onlyAdminsCanCreateAlerts") });
          router.back();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, showFailure, t]);

  const formValues = useMemo(
    () => ({
      title,
      body: description,
      location: "",
      event_date: toApiDate(alertDate) ?? "",
      event_end_date: toApiDate(endAlertDate) ?? "",
      event_time: toApiTime(startTime) ?? "",
      event_time_end: toApiTime(endTime) ?? "",
      scheduled_date: scheduleLater ? toApiDate(schedulePublishDate) ?? "" : "",
      scheduled_time: scheduleLater ? toApiTime(schedulePublishTime) ?? "" : "",
    }),
    [title, description, alertDate, endAlertDate, startTime, endTime, scheduleLater, schedulePublishDate, schedulePublishTime],
  );

  const validationOpts = useMemo(
    () => ({
      kind: "alert",
      publishNow: true,
      requirePublishSchedule: scheduleLater,
    }),
    [scheduleLater],
  );

  const fieldErrorsLive = useMemo(
    () => validateNoticeForm(formValues, validationOpts),
    [formValues, validationOpts],
  );

  const canPublish = useMemo(() => !hasFieldErrors(fieldErrorsLive), [fieldErrorsLive]);

  // Show publish schedule inline errors as soon as values conflict with start.
  useEffect(() => {
    if (!scheduleLater) return;
    if (fieldErrorsLive.scheduled_date || fieldErrorsLive.scheduled_time) {
      touch("scheduled_date");
      touch("scheduled_time");
    }
  }, [
    scheduleLater,
    fieldErrorsLive.scheduled_date,
    fieldErrorsLive.scheduled_time,
    touch,
  ]);

  useEffect(() => {
    if (!startTime || !endTime) return;
    setErrors((prev) => {
      if (endTime.getTime() > startTime.getTime()) {
        if (!prev.event_time_end) return prev;
        const next = { ...prev };
        delete next.event_time_end;
        return next;
      }
      return { ...prev, event_time_end: t('alerts.endTimeAfterStart') };
    });
  }, [startTime, endTime, setErrors, t]);

  const handlePublish = () => {
    if (submitting || uploadingImage) return;

    const fieldErrors = validateNoticeForm(formValues, validationOpts);
    if (!validateOnSubmit(fieldErrors)) return;

    run(async () => {
      setUploadingImage(Boolean(coverImage?.uri));
      try {
        await runAction({
          action: async () =>
            publishNoticeWithImage(coverImage, createAlert, {
              title: title.trim(),
              body: description.trim(),
              event_date: toApiDate(alertDate),
              event_end_date: toApiDate(endAlertDate) || undefined,
              event_time: toApiTime(startTime),
              event_time_end: toApiTime(endTime) || undefined,
              status: scheduleLater ? "draft" : "published",
              scheduled_at: scheduleLater
                ? toApiScheduleDateTime(schedulePublishDate, schedulePublishTime)
                : undefined,
            }),
          successTitle: scheduleLater ? t('alerts.scheduled') : t('alerts.published'),
          successMessage: scheduleLater
            ? t('alerts.alertScheduledMessage')
            : t('alerts.alertPublishedMessage'),
          errorTitle: t('alerts.couldNotPublish'),
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

  const renderFieldLabel = (iconName, label, required = false) => {
    const icons = {
      "calendar-outline": require("../../../assets/images/black-date.png"),
      "time-outline": require("../../../assets/images/black-time.png"),
    };
    const iconSource = icons[iconName];

    return (
      <View style={styles.fieldLabelRow}>
        {iconSource ? <Image source={iconSource} style={{ width: 16, height: 16 }} /> : null}
        <Text style={styles.labelText}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title={t('alerts.createAlert')} iconOnly />

      <KeyboardScroll showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.formWrap}>
          <Text style={styles.formLabel}>
            {t('alerts.title')} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              touch("title");
              clearError("title");
            }}
            placeholder={t('alerts.alertTitlePlaceholder')}
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={[styles.input, showError("title", fieldErrorsLive) && styles.inputError]}
            maxLength={LIMITS.noticeTitle}
          />
          {showError("title", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("title", fieldErrorsLive)}</Text> : null}

          <Text style={[styles.formLabel, styles.sectionGap]}>
            {t('alerts.description')} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              touch("body");
              clearError("body");
            }}
            placeholder={t('alerts.alertDescriptionPlaceholder')}
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

          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('alerts.alertSchedule')}</Text>
          <Text style={styles.sectionHint}>{t('alerts.alertScheduleHint')}</Text>

          <View style={styles.sectionGap}>{renderFieldLabel("calendar-outline", t('alerts.alertDate'), true)}</View>
          <View style={chipTheme.chipRow}>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "today" && chipTheme.chipActive]}
              onPress={() => applyQuickDate(0, "today")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "today" && chipTheme.chipTextActive]}>
                {t("alerts.today")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "tomorrow" && chipTheme.chipActive]}
              onPress={() => applyQuickDate(1, "tomorrow")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "tomorrow" && chipTheme.chipTextActive]}>
                {t("alerts.tomorrow")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "fill" && chipTheme.chipActive]}
              onPress={() => {
                setDateShortcut("fill");
                setTimeShortcut("in1h");
                applyQuickDate(0, "fill");
                applyQuickStartInHours(1, "in1h");
              }}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "fill" && chipTheme.chipTextActive]}>
                {t("alerts.fillSchedule")}
              </Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="date"
            value={alertDate}
            onChange={(v) => {
              setDateShortcut(null);
              setAlertDate(v);
              syncEndAlertDate(v, endAlertDate);
              touch("event_date");
              clearError("event_date");
              touchPublishScheduleFields();
            }}
            placeholder={t("notices.selectDate")}
            inputStyle={[styles.input, showError("event_date", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_date", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("event_date", fieldErrorsLive)}</Text> : null}

          <View style={styles.sectionGap}>{renderFieldLabel("time-outline", t("alerts.startTime"), true)}</View>
          <View style={chipTheme.chipRow}>
            <TouchableOpacity
              style={[chipTheme.chip, timeShortcut === "now" && chipTheme.chipActive]}
              onPress={() => applyQuickStartInHours(0, "now")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, timeShortcut === "now" && chipTheme.chipTextActive]}>
                {t("alerts.now")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, timeShortcut === "in1h" && chipTheme.chipActive]}
              onPress={() => applyQuickStartInHours(1, "in1h")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, timeShortcut === "in1h" && chipTheme.chipTextActive]}>
                {t("alerts.inOneHour")}
              </Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="time"
            value={startTime}
            onChange={(v) => {
              setTimeShortcut(null);
              applyStartTime(v);
            }}
            placeholder={t('alerts.startTimePlaceholder')}
            inputStyle={[styles.input, showError("event_time", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time", fieldErrorsLive) ? <Text style={styles.errorText}>{showError("event_time", fieldErrorsLive)}</Text> : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("calendar-outline", t("notices.endDate", { defaultValue: "End date" }), false)}
          </View>
          <SchedulePickerField
            mode="date"
            value={endAlertDate}
            onChange={(v) => {
              setEndAlertDate(v);
              touch("event_end_date");
              clearError("event_end_date");
            }}
            placeholder={t("notices.selectDate", { defaultValue: "Select date" })}
            inputStyle={[styles.input, showError("event_end_date", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_end_date", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_end_date", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>
            {renderFieldLabel("time-outline", t("notices.endTime", { defaultValue: "End time" }), false)}
          </View>
          <SchedulePickerField
            mode="time"
            value={endTime}
            onChange={(v) => {
              setEndTime(v);
              touch("event_time_end");
              clearError("event_time_end");
            }}
            placeholder={t("notices.endTimePlaceholder", { defaultValue: "Select end time" })}
            inputStyle={[styles.input, showError("event_time_end", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time_end", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_time_end", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.adminHeaderRow}>
            <Text style={styles.adminOptionsTitle}>{t('alerts.adminOptions')}</Text>
          </View>

          <View style={styles.scheduleCard}>
            <View style={styles.scheduleHeaderRow}>
              <View>
                <Text style={styles.optionTitle}>{t('alerts.scheduleForLater')}</Text>
                <Text style={styles.optionSubtitle}>{t('alerts.publishAtSpecificDateTime')}</Text>
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
              <>
                <View style={styles.scheduleDivider} />
                <SchedulePickerField
                  mode="date"
                  value={schedulePublishDate}
                  onChange={(v) => {
                    setSchedulePublishDate(v);
                    touch("scheduled_date");
                    clearError("scheduled_date");
                  }}
                    placeholder={t('alerts.publishDate')}
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
                    placeholder={t('alerts.publishTime')}
                  inputStyle={[styles.input, styles.scheduleTimeInput, showError("scheduled_time", fieldErrorsLive) && styles.inputError]}
                />
                {showError("scheduled_time", fieldErrorsLive) ? (
                  <Text style={styles.errorText}>{showError("scheduled_time", fieldErrorsLive)}</Text>
                ) : null}
              </>
            ) : null}
          </View>

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
              <Text style={styles.publishButtonText}>{scheduleLater ? t('alerts.schedule') : t('alerts.publish')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { paddingBottom: 24 },
  formWrap: { padding: 24 },
  formLabel: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "#111827",
  },
  labelText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
  },
  required: { color: "#FF3B30" },
  sectionGap: { marginTop: 20 },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: "#111827",
  },
  sectionHint: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
  },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  adminHeaderRow: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(238, 241, 245, 1)",
    marginBottom: 10,
  },
  adminOptionsTitle: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
    letterSpacing: 0.3,
  },
  optionCard: {
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scheduleCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  scheduleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scheduleDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(229, 231, 235, 1)",
    marginTop: 16,
    marginBottom: 8,
  },
  scheduleTimeInput: { marginTop: 10 },
  optionTextWrap: { flex: 1, paddingEnd: 12 },
  optionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "#111827",
  },
  optionSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(74, 85, 101, 1)",
  },
  toggleTrack: {
    width: 46,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackOn: { backgroundColor: "#67D26F" },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbOn: { alignSelf: "flex-end" },
  publishButton: {
    marginTop: 10,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(20, 184, 166, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  publishButtonDisabled: { opacity: 0.45 },
  publishButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: "#FFFFFF",
  },
  inputError: { borderColor: "#DC2626" },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    marginTop: 4,
  },
});
