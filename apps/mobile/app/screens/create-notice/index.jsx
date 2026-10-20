import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { KeyboardScroll } from "../../../components/ui/keyboard-form";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Fonts } from "../../../constants/font";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import ScreenHeader from "../../../components/layout/screen-header";
import {
  createNotice,
  fetchNotice,
  publishNoticeWithImage,
  resolveNoticeId,
  updateNotice,
  uploadNoticeImage,
  NOTICE_FORM_CATEGORIES,
} from "../../../services/notices-api";
import { extractStoragePath } from "../../../utils/profile-display";
import { noticeEditFormState } from "../../../utils/notice-edit-draft";
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
import { canEditCommunityNotice, isCommunityAdmin } from "../../../services/community-access";
import { fetchAdminMembers } from "../../../services/admin-api";
import { useTranslation } from 'react-i18next';
import { selectionChipStyles as chipTheme } from "../../../constants/selection-chip-styles";
import { buildQuickDate, buildQuickStartInHours } from "../../../utils/schedule-shortcut-helpers";
import { isScheduleEndBeforeStart } from "../../../utils/notice-schedule-window";

/**
 * Plain object — not StyleSheet. The text-metrics patch adds lineHeight inside
 * StyleSheet.create, and iOS then draws single-line Title/Location text high
 * in the field. A fixed 22px line is centered by the shell; the 3px iOS inset
 * offsets Poppins so the glyphs and the placeholder share the same center.
 * Android keeps styles.input unchanged.
 */
const noticeSingleLineText = {
  fontFamily: Fonts.regular,
  fontSize: 13,
  color: "rgba(10, 10, 10, 1)",
  height: 22,
  margin: 0,
  paddingTop: 3,
  paddingBottom: 0,
  paddingHorizontal: 0,
  paddingVertical: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
};

export default function CreateNoticeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const noticeId = resolveNoticeId(params.noticeId);
  const isEditing = Boolean(noticeId);
  const { t } = useTranslation();
  const { submitting, run } = useSubmitLock();
  const { runAction } = useApiAction();
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [location, setLocation] = useState("");
  const [noticeDate, setNoticeDate] = useState(null);
  const [endNoticeDate, setEndNoticeDate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [pinToTop, setPinToTop] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [schedulePublishDate, setSchedulePublishDate] = useState(null);
  const [schedulePublishTime, setSchedulePublishTime] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [audienceType, setAudienceType] = useState("all");
  const [selectedResidentIds, setSelectedResidentIds] = useState([]);
  const [residentSearch, setResidentSearch] = useState("");
  const [residents, setResidents] = useState([]);
  const [residentsLoading, setResidentsLoading] = useState(false);
  const [dateShortcut, setDateShortcut] = useState(null);
  const [timeShortcut, setTimeShortcut] = useState(null);
  const [loadingNotice, setLoadingNotice] = useState(isEditing);
  const [editBlocked, setEditBlocked] = useState(false);
  const [editLoadError, setEditLoadError] = useState(null);
  const [keptImageUrl, setKeptImageUrl] = useState(null);
  const [originalStatus, setOriginalStatus] = useState("published");
  const { errors, setErrors, touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const syncEndNoticeDate = (startDate, currentEnd) => {
    const startKey = toApiDate(startDate);
    const endKey = toApiDate(currentEnd);
    if (!startKey) return;
    if (!endKey || endKey < startKey) {
      setEndNoticeDate(startDate);
      touch("event_end_date");
      clearError("event_end_date");
    }
  };

  const applyQuickDate = (daysFromToday, shortcut) => {
    setDateShortcut(shortcut);
    const next = buildQuickDate(daysFromToday);
    setNoticeDate(next);
    setEndNoticeDate(next);
    touch("event_date");
    touch("event_end_date");
    clearError("event_date");
    clearError("event_end_date");
  };

  const applyQuickStartInHours = (hoursFromNow, shortcut) => {
    if (shortcut) setTimeShortcut(shortcut);
    const start = buildQuickStartInHours(hoursFromNow);
    setStartTime(start);
    touch("event_time");
    clearError("event_time");
    if (!endTime || endTime.getTime() <= start.getTime()) {
      const nextEnd = defaultEndTimeFromStart(start);
      if (nextEnd) {
        setEndTime(nextEnd);
        clearError("event_time_end");
      }
    }
    if (!noticeDate) {
      setDateShortcut((current) => current ?? "today");
      const d = new Date(start);
      d.setHours(12, 0, 0, 0);
      setNoticeDate(d);
      touch("event_date");
      clearError("event_date");
    }
  };

  const applyFillSchedule = () => {
    setDateShortcut("fill");
    setTimeShortcut("in1h");
    applyQuickDate(0, "fill");
    applyQuickStartInHours(1, "in1h");
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

  useEffect(() => {
    if (!noticeId) return undefined;
    let cancelled = false;

    (async () => {
      setLoadingNotice(true);
      setEditBlocked(false);
      setEditLoadError(null);
      try {
        const user = await fetchMe().catch(() => getUser());
        if (cancelled) return;
        if (!isCommunityAdmin(user)) {
          setEditBlocked(true);
          return;
        }
        const notice = await fetchNotice(noticeId);
        if (cancelled) return;
        if (!canEditCommunityNotice(user, notice)) {
          setEditBlocked(true);
          return;
        }
        const draft = noticeEditFormState(notice);
        setTitle(draft.title);
        setDescription(draft.description);
        setCategory(draft.category);
        setLocation(draft.location);
        setNoticeDate(draft.noticeDate);
        setEndNoticeDate(draft.endNoticeDate);
        setStartTime(draft.startTime);
        setEndTime(draft.endTime);
        setPinToTop(draft.pinToTop);
        setScheduleLater(draft.scheduleLater);
        setSchedulePublishDate(draft.schedulePublishDate);
        setSchedulePublishTime(draft.schedulePublishTime);
        setAudienceType(draft.audienceType);
        setSelectedResidentIds(draft.selectedResidentIds);
        setCoverImage(draft.coverImage);
        setKeptImageUrl(draft.keptImageUrl);
        setOriginalStatus(draft.originalStatus);
        setIsAdmin(true);
      } catch {
        if (!cancelled) setEditLoadError(t("notices.unableToLoadNotice"));
      } finally {
        if (!cancelled) setLoadingNotice(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [noticeId, t]);

  useEffect(() => {
    if (!isAdmin || audienceType !== "selected") {
      return;
    }

    let cancelled = false;
    setResidentsLoading(true);

    (async () => {
      try {
        const res = await fetchAdminMembers({
          status: "approved",
          role: "member",
          search: residentSearch,
          per_page: 50,
        });
        if (!cancelled) setResidents(res.data ?? []);
      } catch {
        if (!cancelled) setResidents([]);
      } finally {
        if (!cancelled) setResidentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, audienceType, residentSearch]);

  const formValues = useMemo(
    () => ({
      title,
      body: description,
      category,
      location,
      event_date: toApiDate(noticeDate) ?? "",
      event_end_date: toApiDate(endNoticeDate) ?? toApiDate(noticeDate) ?? "",
      event_time: toApiTime(startTime) ?? "",
      event_time_end: toApiTime(endTime) ?? "",
      scheduled_date: scheduleLater ? toApiDate(schedulePublishDate) ?? "" : "",
      scheduled_time: scheduleLater ? toApiTime(schedulePublishTime) ?? "" : "",
      audience_type: audienceType,
      recipient_user_ids: selectedResidentIds,
    }),
    [title, description, category, location, noticeDate, endNoticeDate, startTime, endTime, scheduleLater, schedulePublishDate, schedulePublishTime, audienceType, selectedResidentIds],
  );

  const validationOpts = useMemo(
    () => ({
      kind: "notice",
      publishNow: true,
      requirePublishSchedule: scheduleLater && isAdmin,
    }),
    [scheduleLater, isAdmin],
  );

  const fieldErrorsLive = useMemo(
    () => validateNoticeForm(formValues, validationOpts),
    [formValues, validationOpts],
  );

  const canPublish = useMemo(() => !hasFieldErrors(fieldErrorsLive), [fieldErrorsLive]);

  // Surface end-before-start once both times are chosen and the end field was touched.
  useEffect(() => {
    if (!startTime || !endTime) return;
    const invalid = isScheduleEndBeforeStart(
      formValues.event_date,
      formValues.event_time,
      formValues.event_end_date,
      formValues.event_time_end,
    );
    setErrors((prev) => {
      if (!invalid) {
        if (!prev.event_time_end) return prev;
        const next = { ...prev };
        delete next.event_time_end;
        return next;
      }
      return { ...prev, event_time_end: t("notices.endTimeAfterStart") };
    });
  }, [startTime, endTime, formValues.event_date, formValues.event_time, formValues.event_end_date, formValues.event_time_end, setErrors, t]);

  const handlePublish = () => {
    if (submitting) return;
    if (isEditing && (loadingNotice || editBlocked || editLoadError)) return;

    const fieldErrors = validateNoticeForm(formValues, validationOpts);
    if (!validateOnSubmit(fieldErrors)) return;

    const savedStatus = ["draft", "published", "archived"].includes(originalStatus)
      ? originalStatus
      : "published";

    run(async () => {
      const replacingImage = Boolean(coverImage?.uri && !coverImage.remote);
      setUploadingImage(isEditing ? replacingImage : Boolean(coverImage?.uri));
      try {
        const payload = {
          title: title.trim(),
          body: description.trim(),
          category,
          location: location.trim() || undefined,
          event_date: toApiDate(noticeDate),
          event_end_date: toApiDate(endNoticeDate) ?? toApiDate(noticeDate),
          event_time: toApiTime(startTime),
          event_time_end: toApiTime(endTime),
          ...(isAdmin
            ? {
                is_pinned: pinToTop,
                status: scheduleLater ? "draft" : isEditing ? savedStatus : "published",
                scheduled_at: scheduleLater
                  ? toApiScheduleDateTime(schedulePublishDate, schedulePublishTime)
                  : isEditing
                    ? null
                    : undefined,
                audience_type: audienceType,
                recipient_user_ids:
                  audienceType === "selected" ? selectedResidentIds : undefined,
              }
            : {}),
        };

        await runAction({
          action: async () => {
            if (!isEditing) {
              return publishNoticeWithImage(coverImage, createNotice, payload);
            }
            let image_url = keptImageUrl;
            if (replacingImage) {
              const uploaded = await uploadNoticeImage(coverImage.uri, coverImage);
              image_url = extractStoragePath(uploaded.image_url) ?? uploaded.image_url;
            } else if (!coverImage?.uri) {
              image_url = null;
            }
            return updateNotice(noticeId, { ...payload, image_url });
          },
          successTitle: isEditing
            ? scheduleLater
              ? t("notices.scheduled")
              : t("notices.noticeUpdated")
            : scheduleLater && isAdmin
              ? t("notices.scheduled")
              : t("notices.published"),
          successMessage: isEditing
            ? scheduleLater
              ? t("notices.noticeScheduledMessage")
              : t("notices.noticeUpdatedMessage")
            : scheduleLater && isAdmin
              ? t("notices.noticeScheduledMessage")
              : t("notices.noticePublishedMessage"),
          errorTitle: isEditing ? t("notices.couldNotUpdate") : t("notices.couldNotPublish"),
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
      "location-outline": require("../../../assets/images/black-location.png"),
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

  const renderSingleLineInput = (inputProps, hasError) => {
    if (Platform.OS !== "ios") {
      return (
        <LocaleTextInput
          {...inputProps}
          style={[styles.input, hasError && styles.inputError]}
        />
      );
    }
    return (
      <View style={[styles.inputShell, hasError && styles.inputError]}>
        <LocaleTextInput {...inputProps} style={noticeSingleLineText} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title={isEditing ? t("notices.editNotice") : t("notices.createNotice")}
        iconOnly
      />

      {isEditing && (loadingNotice || editBlocked || editLoadError) ? (
        <View style={styles.editState}>
          {loadingNotice ? (
            <>
              <ActivityIndicator color="#1B4F8A" size="large" />
              <Text style={styles.editStateText}>{t("notices.loadingNotice")}</Text>
            </>
          ) : (
            <Text style={styles.editStateText}>
              {editBlocked ? t("notices.editNoticeDenied") : editLoadError}
            </Text>
          )}
        </View>
      ) : (
      <KeyboardScroll showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.formWrap}>
          <Text style={styles.label}>
            {t('notices.title')} <Text style={styles.required}>*</Text>
          </Text>
          {renderSingleLineInput(
            {
              value: title,
              onChangeText: (value) => {
                setTitle(value);
                touch("title");
                clearError("title");
              },
              placeholder: t("notices.enterTitle"),
              placeholderTextColor: "rgba(10, 10, 10, 0.5)",
              maxLength: LIMITS.noticeTitle,
            },
            Boolean(showError("title", fieldErrorsLive)),
          )}
          {showError("title", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("title", fieldErrorsLive)}</Text>
          ) : null}

          <Text style={[styles.label, styles.sectionGap]}>
            {t('notices.description')} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              touch("body");
              clearError("body");
            }}
            placeholder={t('notices.noticeDescriptionPlaceholder')}
            placeholderTextColor="rgba(10, 10, 10, 0.5)"
            style={[styles.textArea, showError("body", fieldErrorsLive) && styles.inputError]}
            multiline
            textAlignVertical="top"
            maxLength={LIMITS.noticeDescription}
          />
          {description.length > 0 ? (
            <Text style={styles.charCounter}>
              {t("onboarding.characters", {
                count: description.length,
                max: LIMITS.noticeDescription,
              })}
            </Text>
          ) : null}
          {showError("body", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("body", fieldErrorsLive)}</Text>
          ) : null}

          <Text style={[styles.label, styles.sectionGap]}>
            {t('notices.category')} <Text style={styles.required}>*</Text>
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={chipTheme.chipRow}
          >
            {NOTICE_FORM_CATEGORIES.map((option) => {
              const selected = category === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.85}
                  style={[chipTheme.chip, selected && chipTheme.chipActive]}
                  onPress={() => {
                    setCategory(option.value);
                    touch("category");
                    clearError("category");
                  }}
                >
                  <Text style={[chipTheme.chipText, selected && chipTheme.chipTextActive]}>
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {showError("category", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("category", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>{renderFieldLabel("location-outline", t('notices.location'), false)}</View>
          {renderSingleLineInput(
            {
              value: location,
              onChangeText: (value) => {
                setLocation(value);
                touch("location");
                clearError("location");
              },
              placeholder: t("notices.locationPlaceholder"),
              placeholderTextColor: "rgba(10, 10, 10, 0.5)",
              maxLength: LIMITS.location,
            },
            Boolean(showError("location", fieldErrorsLive)),
          )}
          {showError("location", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("location", fieldErrorsLive)}</Text>
          ) : null}

          <NoticeCoverImageField
            value={coverImage}
            onChange={setCoverImage}
            uploading={uploadingImage}
          />

          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('notices.noticeSchedule')}</Text>
          <Text style={styles.sectionHint}>{t('notices.noticeScheduleHint')}</Text>

          <View style={styles.sectionGap}>{renderFieldLabel("calendar-outline", t("notices.startDate"), true)}</View>
          <View style={chipTheme.chipRow}>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "today" && chipTheme.chipActive]}
              onPress={() => applyQuickDate(0, "today")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "today" && chipTheme.chipTextActive]}>
                {t("events.today")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "tomorrow" && chipTheme.chipActive]}
              onPress={() => applyQuickDate(1, "tomorrow")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "tomorrow" && chipTheme.chipTextActive]}>
                {t("events.tomorrow")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, dateShortcut === "fill" && chipTheme.chipActive]}
              onPress={applyFillSchedule}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, dateShortcut === "fill" && chipTheme.chipTextActive]}>
                {t("events.fillSchedule")}
              </Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="date"
            value={noticeDate}
            onChange={(v) => {
              setDateShortcut(null);
              setNoticeDate(v);
              syncEndNoticeDate(v, endNoticeDate);
              touch("event_date");
              clearError("event_date");
            }}
            placeholder={t('notices.selectDate')}
            inputStyle={[styles.input, showError("event_date", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_date", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_date", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>{renderFieldLabel("time-outline", t('notices.startTime'), true)}</View>
          <View style={chipTheme.chipRow}>
            <TouchableOpacity
              style={[chipTheme.chip, timeShortcut === "now" && chipTheme.chipActive]}
              onPress={() => applyQuickStartInHours(0, "now")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, timeShortcut === "now" && chipTheme.chipTextActive]}>
                {t("events.now")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chipTheme.chip, timeShortcut === "in1h" && chipTheme.chipActive]}
              onPress={() => applyQuickStartInHours(1, "in1h")}
              activeOpacity={0.85}
            >
              <Text style={[chipTheme.chipText, timeShortcut === "in1h" && chipTheme.chipTextActive]}>
                {t("events.inOneHour")}
              </Text>
            </TouchableOpacity>
          </View>
          <SchedulePickerField
            mode="time"
            value={startTime}
            onChange={(v) => {
              setTimeShortcut(null);
              setStartTime(v);
              touch("event_time");
              clearError("event_time");
              // If end is empty or not after start, default to +1 hour so Publish can enable.
              if (!endTime || (v && endTime && endTime.getTime() <= v.getTime())) {
                const nextEnd = defaultEndTimeFromStart(v);
                if (nextEnd) {
                  setEndTime(nextEnd);
                  clearError("event_time_end");
                }
              }
            }}
            placeholder={t('notices.startTimePlaceholder')}
            inputStyle={[styles.input, showError("event_time", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_time", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>{renderFieldLabel("calendar-outline", t("notices.endDate"), true)}</View>
          <SchedulePickerField
            mode="date"
            value={endNoticeDate}
            onChange={(v) => {
              setEndNoticeDate(v);
              touch("event_end_date");
              clearError("event_end_date");
            }}
            placeholder={t("notices.selectDate")}
            inputStyle={[styles.input, showError("event_end_date", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_end_date", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_end_date", fieldErrorsLive)}</Text>
          ) : null}

          <View style={styles.sectionGap}>{renderFieldLabel("time-outline", t('notices.endTime'), true)}</View>
          <SchedulePickerField
            mode="time"
            value={endTime}
            onChange={(v) => {
              setEndTime(v);
              touch("event_time_end");
              clearError("event_time_end");
            }}
            placeholder={t('notices.endTimePlaceholder')}
            inputStyle={[styles.input, showError("event_time_end", fieldErrorsLive) && styles.inputError]}
          />
          {showError("event_time_end", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("event_time_end", fieldErrorsLive)}</Text>
          ) : null}

          {isAdmin ? (
            <>
              <View style={styles.adminHeaderRow}>
                <Text style={styles.adminOptionsTitle}>{t('notices.adminOptions')}</Text>
              </View>

              <View style={styles.scheduleCard}>
                <Text style={styles.optionTitle}>{t('notices.sendTo')}</Text>
                <View style={chipTheme.chipRow}>
                  <TouchableOpacity
                    style={[chipTheme.chip, audienceType === "all" && chipTheme.chipActive]}
                    onPress={() => {
                      setAudienceType("all");
                      setSelectedResidentIds([]);
                      clearError("recipient_user_ids");
                    }}
                  >
                    <Text style={[chipTheme.chipText, audienceType === "all" && chipTheme.chipTextActive]}>
                      {t('notices.allResidents')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[chipTheme.chip, audienceType === "selected" && chipTheme.chipActive]}
                    onPress={() => setAudienceType("selected")}
                  >
                    <Text style={[chipTheme.chipText, audienceType === "selected" && chipTheme.chipTextActive]}>
                      {t('notices.selectedResidents')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {audienceType === "selected" ? (
                  <View style={styles.residentPickerWrap}>
                    <LocaleTextInput
                      value={residentSearch}
                      onChangeText={setResidentSearch}
                      placeholder={t('notices.searchResidents')}
                      style={[styles.input]}
                    />
                    {selectedResidentIds.length > 0 ? (
                      <Text style={styles.optionSubtitle}>
                        {t('notices.residentsSelected', { count: selectedResidentIds.length })}
                      </Text>
                    ) : null}
                    {residentsLoading ? (
                      <View style={styles.residentList}>
                        <View style={styles.residentListEmpty}>
                          <ActivityIndicator color="rgba(20, 184, 166, 1)" />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.residentList}>
                        {residents.map((member) => {
                          const name = member.display_name || member.name || t('notices.resident');
                          const memberId = Number(member.id);
                          const selected = selectedResidentIds.includes(memberId);

                          return (
                            <TouchableOpacity
                              key={member.id}
                              style={styles.residentRow}
                              onPress={() => {
                                touch("recipient_user_ids");
                                clearError("recipient_user_ids");
                                setSelectedResidentIds((prev) =>
                                  selected ? prev.filter((id) => id !== memberId) : [...prev, memberId],
                                );
                              }}
                            >
                              <View style={[styles.residentCheck, selected && styles.residentCheckActive]}>
                                {selected ? <Text style={styles.residentCheckMark}>✓</Text> : null}
                              </View>
                              <View style={styles.residentMeta}>
                                <Text style={styles.residentName}>{name}</Text>
                                {member.unit_number ? (
                                  <Text style={styles.optionSubtitle}>{t('notices.unitNumber', { unit: member.unit_number })}</Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                        {!residentsLoading && residents.length === 0 ? (
                          <View style={styles.residentListEmpty}>
                            <Text style={styles.residentEmptyText}>{t('notices.noResidentsFound')}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                    {showError("recipient_user_ids", fieldErrorsLive) ? (
                      <Text style={styles.errorText}>
                        {showError("recipient_user_ids", fieldErrorsLive)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.optionCard}>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>{t('notices.pinToTop')}</Text>
                  <Text style={styles.optionSubtitle}>{t('notices.pinToTopDescription')}</Text>
                </View>
                <CustomToggle value={pinToTop} onValueChange={setPinToTop} />
              </View>

              <View style={styles.scheduleCard}>
                <View style={styles.scheduleHeaderRow}>
                  <View>
                    <Text style={styles.optionTitle}>{t('notices.scheduleForLater')}</Text>
                    <Text style={styles.optionSubtitle}>{t('notices.publishAtSpecificDateTime')}</Text>
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
                      placeholder={t('notices.publishDate')}
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
                      placeholder={t('notices.publishTime')}
                      inputStyle={[
                        styles.input,
                        styles.scheduleTimeInput,
                        showError("scheduled_time", fieldErrorsLive) && styles.inputError,
                      ]}
                    />
                    {showError("scheduled_time", fieldErrorsLive) ? (
                      <Text style={styles.errorText}>{showError("scheduled_time", fieldErrorsLive)}</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            </>
          ) : null}

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
                {isAdmin && scheduleLater
                  ? t("notices.schedule")
                  : isEditing
                    ? t("notices.saveChanges")
                    : t("notices.publish")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardScroll>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  editState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  editStateText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: "#0A2A43",
    textAlign: "center",
  },
  scrollContent: { paddingBottom: 24 },
  formWrap: { padding: 24 },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "500",
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
    color: "rgba(0, 0, 0, 1)",
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
    color: "rgba(10, 10, 10, 1)",
    backgroundColor: "rgba(249, 250, 251, 1)",
  },
  inputShell: {
    marginTop: 8,
    height: 56,
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(249, 250, 251, 1)",
    justifyContent: "center",
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
    marginBottom: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(238, 241, 245, 1)",
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
    marginBottom: 16,
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
    color: "rgba(0, 0, 0, 1)",
  },
  optionSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(74, 85, 101, 1)",
  },
  residentPickerWrap: {
    marginTop: 12,
    gap: 8,
  },
  residentLoader: {
    marginTop: 12,
  },
  residentListEmpty: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  residentEmptyText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
  },
  residentList: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  residentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(243, 244, 246, 1)",
  },
  residentMeta: {
    flex: 1,
  },
  residentName: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "rgba(10, 10, 10, 1)",
  },
  residentCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(209, 213, 219, 1)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  residentCheckActive: {
    borderColor: "rgba(20, 184, 166, 1)",
    backgroundColor: "rgba(20, 184, 166, 1)",
  },
  residentCheckMark: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: Fonts.bold,
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
    color: "rgba(255, 255, 255, 1)",
  },
  inputError: { borderColor: "#DC2626", borderWidth: 1 },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    marginTop: 4,
  },
  charCounter: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: "rgba(100, 116, 139, 1)",
    textAlign: "right",
  },
});
