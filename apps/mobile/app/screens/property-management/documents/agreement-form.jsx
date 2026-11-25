import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Keyboard, Switch } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { KeyboardFooter, KeyboardScroll } from "../../../../components/ui/keyboard-form";
import FormDatePickerSheet from "../../../../components/forms/form-date-picker-sheet";
import DocumentCategoryPicker from "../../../../components/forms/document-category-picker";
import {
  DOCUMENT_OTHER_CATEGORY,
  buildDocumentCategoryOptions,
  resolveDocumentCategory,
} from "../../../../constants/document-categories";
import { LIMITS, validateDocumentForm, hasFieldErrors } from "../../../../utils/form-validation";
import { formatDisplayDate, toApiDate } from "../../../../utils/form-datetime";
import { openDocumentsAgreementsList } from "../../../../constants/property-management-routes";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import {
  createAgreementDraft,
  fetchAdminCommunityDocuments,
  fetchAgreementOptions,
  publishAgreement,
} from "../../../../services/documents-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../../hooks/use-touched-field-errors";
import { agreementDateErrors } from "../../../../utils/agreement-dates";
import { viewerHtml } from "./sign-agreement";

export const options = {
  animation: "fade",
};

function ReviewRow({ icon, label, value, muted = false, last = false }) {
  return (
    <View style={[reviewStyles.row, last && reviewStyles.rowLast]}>
      <View style={reviewStyles.rowIcon}>
        <Feather name={icon} size={sf(14)} color="#1B4F8A" />
      </View>
      <View style={reviewStyles.rowBody}>
        <Text style={reviewStyles.rowLabel}>{label}</Text>
        <Text style={[reviewStyles.rowValue, muted && reviewStyles.rowValueMuted]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function AgreementForm() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { showFailure, showSuccess } = useApiAction();
  const { submitting, run } = useSubmitLock();
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [dueAt, setDueAt] = useState(null);
  const [effectiveAt, setEffectiveAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [openDate, setOpenDate] = useState(null);
  const scrollRef = useRef(null);
  const [file, setFile] = useState(null);
  const [scope, setScope] = useState("all");
  const [options, setOptions] = useState({ residents: [], units: [], resident_count: 0 });
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [notify, setNotify] = useState(true);
  const [draftId, setDraftId] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [stepBusy, setStepBusy] = useState(false);
  const step2Loaded = useRef(false);

  useEffect(() => {
    let active = true;
    fetchAdminCommunityDocuments()
      .then((res) => {
        if (!active) return;
        setCategories((res.categories ?? []).map((item) => item.name).filter(Boolean));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchAgreementOptions("").then(setOptions).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (step !== 2) {
      step2Loaded.current = false;
      return undefined;
    }
    const delay = step2Loaded.current ? 250 : 0;
    step2Loaded.current = true;
    const handle = setTimeout(() => {
      fetchAgreementOptions(search).then(setOptions).catch(() => undefined);
    }, delay);
    return () => clearTimeout(handle);
  }, [step, search]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) setFile(result.assets[0]);
  };

  const saveDraft = async () => {
    if (draftId) return draftId;
    const draft = await createAgreementDraft({
      title,
      category,
      description,
      due_at: toApiDate(dueAt) ?? "",
      effective_at: toApiDate(effectiveAt) ?? "",
      expires_at: toApiDate(expiresAt) ?? "",
    }, file);
    setDraftId(draft.id);
    return draft.id;
  };

  const resetForm = () => {
    setStep(1);
    setTitle("");
    setDescription("");
    setCategorySelect("");
    setCustomCategory("");
    setDueAt(null);
    setEffectiveAt(null);
    setExpiresAt(null);
    setOpenDate(null);
    setFile(null);
    setScope("all");
    setSearch("");
    setSelectedUsers([]);
    setSelectedUnits([]);
    setNotify(true);
    setDraftId(null);
    setPreviewHtml(null);
  };

  const publish = () => run(async () => {
    const id = await saveDraft();
    await publishAgreement(id, {
      scope,
      user_ids: selectedUsers,
      unit_ids: selectedUnits,
      notify,
    });
    await showSuccess(t("apiAction.success"), t("propertyMgmt.agreementCreatedSuccess"));
    resetForm();
    openDocumentsAgreementsList(router, pathname);
  }).catch((err) => showFailure(t("propertyMgmt.publishAgreement"), err));

  const dateValue = openDate === "effective" ? effectiveAt : openDate === "expires" ? expiresAt : dueAt;
  const openDateTitle = useMemo(() => {
    if (openDate === "effective") return t("propertyMgmt.agreementEffectiveDate");
    if (openDate === "expires") return t("propertyMgmt.expirationDate");
    if (openDate === "due") return t("propertyMgmt.dueDate");
    return "";
  }, [openDate, t]);
  const minimumDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  const categoryOptions = useMemo(() => buildDocumentCategoryOptions(categories), [categories]);
  const category = resolveDocumentCategory(categorySelect, customCategory);
  const liveDateErrors = useMemo(
    () => agreementDateErrors(dueAt, effectiveAt, expiresAt, t),
    [dueAt, effectiveAt, expiresAt, t],
  );
  const liveBasicsErrors = useMemo(
    () => validateDocumentForm(
      { title, category, description, status: "active" },
      { hasFile: Boolean(file) },
    ),
    [title, category, description, file],
  );
  const step1FieldErrors = useMemo(
    () => ({ ...liveBasicsErrors, ...liveDateErrors }),
    [liveBasicsErrors, liveDateErrors],
  );
  useEffect(() => {
    clearError("dueAt");
    clearError("effectiveAt");
    clearError("expiresAt");
  }, [liveDateErrors, clearError]);
  const dateFieldKey = openDate === "effective" ? "effectiveAt" : openDate === "expires" ? "expiresAt" : "dueAt";
  const confirmDate = (next) => {
    touch(dateFieldKey);
    if (openDate === "effective") setEffectiveAt(next);
    else if (openDate === "expires") setExpiresAt(next);
    else setDueAt(next);
    setOpenDate(null);
  };
  const showDate = (key) => {
    Keyboard.dismiss();
    setOpenDate(key);
  };
  const closeDate = () => {
    if (openDate) touch(dateFieldKey);
    setOpenDate(null);
  };
  useEffect(() => {
    if (step !== 3 || !file?.uri) {
      setPreviewHtml(null);
      return undefined;
    }
    let cancelled = false;
    FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })
      .then((base64) => {
        if (!cancelled) setPreviewHtml(viewerHtml(base64));
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [step, file?.uri]);

  const recipientCount = scope === "all"
    ? options.resident_count
    : scope === "residents"
      ? selectedUsers.length
      : options.units.filter((unit) => selectedUnits.includes(unit.id)).reduce((sum, unit) => sum + unit.resident_count, 0);

  const stepLabels = [t("propertyMgmt.agreementDetails"), t("propertyMgmt.residents"), t("propertyMgmt.reviewStep")];
  const step2Valid = scope === "all"
    || (scope === "residents" && selectedUsers.length > 0)
    || (scope === "units" && selectedUnits.length > 0);
  const recipientSummaryKey = scope === "all"
    ? "propertyMgmt.recipientSummaryAll"
    : scope === "residents"
      ? "propertyMgmt.recipientSummaryResidents"
      : "propertyMgmt.recipientSummaryUnits";
  const recipientCountLabel = scope === "all"
    ? t("propertyMgmt.recipientCountAll", { count: recipientCount })
    : t("propertyMgmt.recipientCountSelected", { count: recipientCount });

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    setStepBusy(false);
  }, [step]);

  const advanceStep = useCallback(() => {
    if (stepBusy || submitting) return;
    if (step === 1) {
      if (hasFieldErrors(step1FieldErrors) || !validateOnSubmit(step1FieldErrors)) return;
      setStepBusy(true);
      Keyboard.dismiss();
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!step2Valid) {
        showFailure(
          t("propertyMgmt.createAgreement"),
          scope === "units" ? t("propertyMgmt.selectOneUnit") : t("propertyMgmt.selectOneResident"),
        );
        return;
      }
      setStepBusy(true);
      Keyboard.dismiss();
      setStep(3);
    }
  }, [
    step,
    stepBusy,
    submitting,
    step1FieldErrors,
    step2Valid,
    validateOnSubmit,
    showFailure,
    scope,
    t,
  ]);

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title={t("propertyMgmt.createAgreement")} />
      <KeyboardScroll
        ref={scrollRef}
        style={styles.flex}
        footerHeight={sw(72)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={[styles.progressSegment, step >= n && styles.progressSegmentOn]} />
            ))}
          </View>
          <Text style={styles.progressMeta}>{t("propertyMgmt.stepOf", { current: step, total: 3 })}</Text>
          <Text style={styles.progressTitle}>{stepLabels[step - 1]}</Text>
        </View>
        {step === 1 ? (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionLead}>{t("propertyMgmt.agreementDetailsLead")}</Text>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.agreementBasicsSection")}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>{t("propertyMgmt.docTitleLabel")}</Text>
                <LocaleTextInput
                  style={[styles.input, showError("title", step1FieldErrors) && styles.inputError]}
                  placeholder={t("propertyMgmt.docTitlePlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    touch("title");
                    clearError("title");
                  }}
                  maxLength={LIMITS.documentTitle}
                />
                {showError("title", step1FieldErrors) ? <Text style={styles.errorText}>{showError("title", step1FieldErrors)}</Text> : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
                <DocumentCategoryPicker
                  selection={categorySelect}
                  customValue={customCategory}
                  options={categoryOptions}
                  error={showError("category", step1FieldErrors)}
                  placeholder={t("propertyMgmt.selectCategory")}
                  customPlaceholder={t("propertyMgmt.enterCustomCategory")}
                  maxLength={LIMITS.documentCategory}
                  onSelect={(name) => {
                    setCategorySelect(name);
                    if (name !== DOCUMENT_OTHER_CATEGORY) setCustomCategory("");
                    touch("category");
                    clearError("category");
                  }}
                  onCustomChange={(value) => {
                    setCustomCategory(value);
                    touch("category");
                    clearError("category");
                  }}
                />
                {showError("category", step1FieldErrors) ? <Text style={styles.errorText}>{showError("category", step1FieldErrors)}</Text> : null}
              </View>
              <View style={[styles.field, styles.fieldLast]}>
                <Text style={styles.label}>{t("propertyMgmt.docDescriptionLabel")}</Text>
                <LocaleTextInput
                  style={[styles.input, styles.area]}
                  placeholder={t("propertyMgmt.docDescPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.agreementDatesSection")}</Text>
              <Text style={styles.cardHint}>{t("propertyMgmt.agreementDatesLead")}</Text>
              {[
                ["due", "dueAt", t("propertyMgmt.dueDate"), t("propertyMgmt.dueDateHint"), dueAt],
                ["effective", "effectiveAt", t("propertyMgmt.agreementEffectiveDate"), t("propertyMgmt.effectiveDateHint"), effectiveAt],
                ["expires", "expiresAt", t("propertyMgmt.expirationDate"), t("propertyMgmt.expirationDateHint"), expiresAt],
              ].map(([key, field, label, hint, value], index, rows) => {
                const error = showError(field, step1FieldErrors);
                const last = index === rows.length - 1;
                return (
                  <View key={key} style={[styles.field, last && styles.fieldLast]}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.fieldHint}>{hint}</Text>
                    <Pressable style={[styles.dateRow, error && styles.inputError]} onPress={() => showDate(key)}>
                      <View style={styles.dateIconWrap}>
                        <Feather name="calendar" size={sf(16)} color="#1B4F8A" />
                      </View>
                      <Text style={[styles.dateRowValue, !value && styles.datePlaceholder]} numberOfLines={1}>
                        {value ? formatDisplayDate(value) : t("propertyMgmt.selectDate")}
                      </Text>
                      <Feather name="chevron-right" size={sf(18)} color="#94A3B8" />
                    </Pressable>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.agreementPdfSection")}</Text>
              <Text style={styles.cardHint}>{t("propertyMgmt.agreementPdfHint")}</Text>
              <Pressable
                style={[styles.filePicker, showError("file", step1FieldErrors) && styles.inputError]}
                onPress={() => {
                  touch("file");
                  void pickFile().then(() => clearError("file"));
                }}
              >
                <View style={styles.fileIconWrap}>
                  <Feather name={file ? "file-text" : "upload"} size={sf(20)} color="#1B4F8A" />
                </View>
                <View style={styles.fileCopy}>
                  <Text style={styles.filePickerTitle} numberOfLines={2}>
                    {file?.name ?? t("propertyMgmt.tapChooseFile")}
                  </Text>
                  {file ? <Text style={styles.filePickerSub}>{t("propertyMgmt.agreementPdfHint")}</Text> : null}
                </View>
                <Feather name="chevron-right" size={sf(18)} color="#94A3B8" />
              </Pressable>
              {showError("file", step1FieldErrors) ? <Text style={styles.errorText}>{showError("file", step1FieldErrors)}</Text> : null}
            </View>
          </View>
        ) : null}
        {step === 2 ? (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionHeading}>{t("propertyMgmt.recipientsHeading")}</Text>
            <Text style={styles.sectionLead}>{t("propertyMgmt.recipientsLead")}</Text>
            <View style={styles.methods}>
              {["all", "residents", "units"].map((item) => (
                <Pressable key={item} onPress={() => setScope(item)} style={[styles.method, scope === item && styles.methodOn]}>
                  <Text style={[styles.methodText, scope === item && styles.methodTextOn]} numberOfLines={2}>
                    {item === "all" ? t("propertyMgmt.allResidents") : item === "residents" ? t("propertyMgmt.selectedResidents") : t("propertyMgmt.selectedUnits")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIconWrap}>
                <Feather name="users" size={sf(22)} color="#1B4F8A" />
              </View>
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryCount}>{recipientCountLabel}</Text>
                <Text style={styles.summarySub}>{t(recipientSummaryKey)}</Text>
              </View>
            </View>
            {scope !== "all" ? (
              <View style={styles.searchWrap}>
                <Feather name="search" size={sf(16)} color="#94A3B8" style={styles.searchIcon} />
                <LocaleTextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("propertyMgmt.searchResidentsOrUnits")}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            ) : null}
            {scope !== "all" ? (
              <View style={styles.listCard}>
                <ScrollView style={styles.listScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {scope === "residents" ? options.residents.map((person) => {
                    const picked = selectedUsers.includes(person.id);
                    const units = (person.units ?? []).map((unit) => unit.unit_number).join(", ");
                    return (
                      <Pressable
                        key={person.id}
                        style={[styles.choiceRow, picked && styles.choiceRowOn]}
                        onPress={() => setSelectedUsers((current) => (picked ? current.filter((id) => id !== person.id) : [...current, person.id]))}
                      >
                        <View style={styles.choiceMain}>
                          <Text style={styles.choiceTitle}>{person.name}</Text>
                          {units ? <Text style={styles.choiceMeta}>{units}</Text> : null}
                        </View>
                        <Feather name={picked ? "check-circle" : "circle"} size={sf(20)} color={picked ? "#1B4F8A" : "#CBD5E1"} />
                      </Pressable>
                    );
                  }) : null}
                  {scope === "units" ? options.units.map((unit) => {
                    const picked = selectedUnits.includes(unit.id);
                    const names = (unit.residents ?? []).map((person) => person.name).join(", ");
                    return (
                      <Pressable
                        key={unit.id}
                        style={[styles.choiceRow, picked && styles.choiceRowOn]}
                        onPress={() => setSelectedUnits((current) => (picked ? current.filter((id) => id !== unit.id) : [...current, unit.id]))}
                      >
                        <View style={styles.choiceMain}>
                          <Text style={styles.choiceTitle}>{unit.unit_number}</Text>
                          {names ? <Text style={styles.choiceMeta} numberOfLines={2}>{names}</Text> : null}
                        </View>
                        <Feather name={picked ? "check-circle" : "circle"} size={sf(20)} color={picked ? "#1B4F8A" : "#CBD5E1"} />
                      </Pressable>
                    );
                  }) : null}
                  {scope === "residents" && options.residents.length === 0 ? (
                    <Text style={styles.emptyList}>{t("propertyMgmt.noResidentsFound")}</Text>
                  ) : null}
                  {scope === "units" && options.units.length === 0 ? (
                    <Text style={styles.emptyList}>{t("propertyMgmt.noUnitsFound")}</Text>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>{t("propertyMgmt.notifyResidentsLabel")}</Text>
                <Text style={styles.toggleHint}>{t("propertyMgmt.notifyResidentsHint")}</Text>
              </View>
              <Switch
                value={notify}
                onValueChange={setNotify}
                trackColor={{ false: "#E5E7EB", true: "rgba(27, 79, 138, 0.25)" }}
                thumbColor={notify ? "#1B4F8A" : "#FFFFFF"}
              />
            </View>
          </View>
        ) : step === 3 ? (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionLead}>{t("propertyMgmt.agreementReviewLead")}</Text>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.reviewAgreementSection")}</Text>
              <Text style={reviewStyles.title}>{title}</Text>
              {category ? (
                <View style={reviewStyles.chip}>
                  <Text style={reviewStyles.chipText}>{category}</Text>
                </View>
              ) : null}
              {description.trim() ? (
                <Text style={reviewStyles.description}>{description.trim()}</Text>
              ) : null}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.reviewDatesSection")}</Text>
              <ReviewRow
                icon="clock"
                label={t("propertyMgmt.dueDate")}
                value={dueAt ? formatDisplayDate(dueAt) : t("propertyMgmt.noDueDate")}
                muted={!dueAt}
              />
              <ReviewRow
                icon="calendar"
                label={t("propertyMgmt.agreementEffectiveDate")}
                value={effectiveAt ? formatDisplayDate(effectiveAt) : t("propertyMgmt.noEffectiveDate")}
                muted={!effectiveAt}
              />
              <ReviewRow
                icon="flag"
                label={t("propertyMgmt.expirationDate")}
                value={expiresAt ? formatDisplayDate(expiresAt) : t("propertyMgmt.noExpirationDate")}
                muted={!expiresAt}
                last
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>{t("propertyMgmt.reviewRecipientsSection")}</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryIconWrap}>
                  <Feather name="users" size={sf(22)} color="#1B4F8A" />
                </View>
                <View style={styles.summaryTextWrap}>
                  <Text style={styles.summaryCount}>{recipientCountLabel}</Text>
                  <Text style={styles.summarySub}>{t(recipientSummaryKey)}</Text>
                  <Text style={reviewStyles.notifyLine}>
                    {notify ? t("propertyMgmt.notifyResidents") : t("propertyMgmt.dontNotifyResidents")}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.formCard}>
              <View style={reviewStyles.previewHead}>
                <Text style={styles.cardTitle}>{t("propertyMgmt.reviewPreviewSection")}</Text>
                {file?.name ? (
                  <View style={reviewStyles.fileBadge}>
                    <Feather name="file-text" size={sf(12)} color="#1B4F8A" />
                    <Text style={reviewStyles.fileBadgeText} numberOfLines={1}>{file.name}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.previewFrame}>
                {previewHtml ? (
                  <WebView
                    source={{ html: previewHtml }}
                    style={styles.previewWeb}
                    originWhitelist={["*"]}
                    scalesPageToFit={false}
                    androidLayerType="hardware"
                    javaScriptEnabled
                    domStorageEnabled
                    setSupportMultipleWindows={false}
                    scrollEnabled
                  />
                ) : (
                  <View style={reviewStyles.previewLoading}>
                    <ActivityIndicator color="#1B4F8A" />
                    <Text style={reviewStyles.previewLoadingText}>{t("propertyMgmt.reviewPreviewLoading")}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardScroll>
      <FormDatePickerSheet
        visible={Boolean(openDate)}
        value={dateValue}
        minimumDate={minimumDate}
        title={openDateTitle}
        onCancel={closeDate}
        onConfirm={confirmDate}
      />
      <KeyboardFooter style={[styles.footer, { paddingBottom: Math.max(insets.bottom, sw(10)) }]}>
        {step < 3 ? (
          <Pressable
            style={[
              styles.primary,
              ((step === 1 && hasFieldErrors(step1FieldErrors)) || (step === 2 && !step2Valid)) && styles.primaryMuted,
            ]}
            disabled={stepBusy}
            onPress={advanceStep}
          >
            <Text style={styles.primaryText}>{t("common.continue")}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} disabled={submitting} onPress={publish}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t("propertyMgmt.publishAgreement")}</Text>}
          </Pressable>
        )}
      </KeyboardFooter>
    </SafeAreaView>
  );
}

const FOOTER_ACTION_HEIGHT = sw(48);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: sw(18), paddingBottom: sw(16) },
  progressWrap: { marginBottom: sw(20) },
  progressTrack: { flexDirection: "row", gap: sw(6), marginBottom: sw(10) },
  progressSegment: { flex: 1, height: sw(4), borderRadius: sw(999), backgroundColor: "#E2E8F0" },
  progressSegmentOn: { backgroundColor: "#1B4F8A" },
  progressMeta: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  progressTitle: { marginTop: sw(4), fontFamily: Fonts.bold, fontSize: sf(18), color: "#0F172A" },
  stepBlock: { gap: sw(4) },
  sectionHeading: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A", marginBottom: sw(4) },
  sectionLead: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#64748B", lineHeight: sf(19), marginBottom: sw(16) },
  formCard: {
    marginBottom: sw(14),
    padding: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0F172A", marginBottom: sw(4) },
  cardHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    lineHeight: sf(17),
    marginBottom: sw(14),
  },
  field: { marginBottom: sw(18) },
  fieldLast: { marginBottom: 0 },
  fieldHint: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8", marginBottom: sw(8), marginTop: -sw(2), lineHeight: sf(16) },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    marginTop: sw(14),
    marginBottom: sw(14),
    padding: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryIconWrap: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(24),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTextWrap: { flex: 1 },
  summaryCount: { fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  summarySub: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B", lineHeight: sf(17) },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    paddingHorizontal: sw(12),
    marginBottom: sw(12),
  },
  searchIcon: { marginRight: sw(8) },
  searchInput: { flex: 1, paddingVertical: sw(11), fontFamily: Fonts.regular, fontSize: sf(14), color: "#111827" },
  listCard: {
    maxHeight: hp(36),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    marginBottom: sw(14),
  },
  listScroll: { paddingHorizontal: sw(4) },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  choiceRowOn: { backgroundColor: "#F8FBFF" },
  choiceMain: { flex: 1, paddingRight: sw(8) },
  choiceMeta: { marginTop: sw(2), fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  emptyList: { padding: sw(20), textAlign: "center", fontFamily: Fonts.regular, fontSize: sf(13), color: "#94A3B8" },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  toggleCopy: { flex: 1 },
  toggleLabel: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0F172A" },
  toggleHint: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B", lineHeight: sf(17) },
  previewFrame: {
    height: sw(320),
    marginTop: sw(4),
    borderRadius: sw(12),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F4F7FB",
  },
  previewWeb: { width: "100%", height: "100%", backgroundColor: "#F4F7FB" },
  label: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#374151", marginBottom: sw(8) },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  dateIconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  dateRowValue: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(14), color: "#111827" },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: sw(12),
    padding: sw(14),
    backgroundColor: "#F8FAFC",
  },
  fileIconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  fileCopy: { flex: 1 },
  filePickerTitle: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#1B4F8A" },
  filePickerSub: { marginTop: sw(2), fontFamily: Fonts.regular, fontSize: sf(11), color: "#64748B" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    padding: sw(12),
    fontFamily: Fonts.regular,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: { borderColor: "#DC2626" },
  errorText: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), color: "#DC2626" },
  combo: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
  },
  comboInput: { flex: 1, paddingHorizontal: sw(12), paddingVertical: sw(12), fontFamily: Fonts.regular, color: "#111827" },
  comboButton: { paddingHorizontal: sw(12), alignSelf: "stretch", justifyContent: "center" },
  menu: {
    marginTop: sw(6),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    maxHeight: sw(180),
  },
  menuItem: { paddingHorizontal: sw(12), paddingVertical: sw(10), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF2F6" },
  menuText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#111827" },
  dateValue: { fontFamily: Fonts.regular, fontSize: sf(15), color: "#111827" },
  datePlaceholder: { fontFamily: Fonts.regular, fontSize: sf(15), color: "#9CA3AF" },
  area: { minHeight: hp(10), textAlignVertical: "top" },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginBottom: sw(4) },
  method: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: sw(100),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingHorizontal: sw(10),
    paddingVertical: sw(10),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  methodOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  methodText: { fontFamily: Fonts.medium, color: "#475569", fontSize: sf(11), textAlign: "center" },
  methodTextOn: { color: "#FFFFFF" },
  choiceTitle: { fontFamily: Fonts.bold, color: "#111827", fontSize: sf(15) },
  hint: { fontFamily: Fonts.regular, color: "#64748B", marginTop: sw(4) },
  footer: {
    paddingHorizontal: sw(18),
    paddingTop: sw(10),
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  primary: {
    width: "100%",
    height: FOOTER_ACTION_HEIGHT,
    minHeight: FOOTER_ACTION_HEIGHT,
    borderRadius: sw(14),
    backgroundColor: "#1B4F8A",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryMuted: { opacity: 0.55 },
  primaryText: { color: "#FFFFFF", fontFamily: Fonts.bold, fontSize: sf(15) },
});

const reviewStyles = StyleSheet.create({
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
    lineHeight: sf(24),
    marginBottom: sw(8),
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#E8F0F7",
    marginBottom: sw(8),
  },
  chipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#1B4F8A" },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    paddingVertical: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EEF5",
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: sw(2),
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 },
  rowValue: { marginTop: sw(2), fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  rowValueMuted: { color: "#94A3B8", fontFamily: Fonts.regular },
  notifyLine: { marginTop: sw(6), fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  previewHead: { marginBottom: sw(4) },
  fileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(6),
    marginBottom: sw(4),
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(8),
    backgroundColor: "#F1F5F9",
  },
  fileBadgeText: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#475569" },
  previewLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(10), padding: sw(24) },
  previewLoadingText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#64748B" },
});
