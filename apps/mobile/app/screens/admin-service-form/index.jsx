import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen, {
  useScrollFieldRefIntoView,
} from "../../../components/layout/keyboard-safe-screen";
import { Fonts } from "../../../constants/font";
import { pageStyles } from "../../../constants/page-styles";
import { PropertyType } from "../../../constants/property-management-type";
import { PropertyHubTheme } from "../../../constants/property-management-theme";
import { sf, sw } from "../../../utils/responsive";
import { hasFieldErrors } from "../../../utils/form-validation";
import FormDatePickerSheet from "../../../components/forms/form-date-picker-sheet";
import { createAdminPropertyService } from "../../../services/property-services-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { dateOnly, formatDisplayDate, toApiDate } from "../../../utils/form-datetime";
import { safeGoBack } from "../../../utils/app-navigation";

const CATEGORIES = [
  "electricity",
  "water",
  "internet",
  "waste",
  "house_cleaning",
  "pest_control",
  "plumbing",
  "electrical_maintenance",
  "ac_maintenance",
  "security",
  "parking",
  "other",
];

const NOTICE_TITLE_TEMPLATE = "{{service}} — Unit {{unit}}";
const NOTICE_PREVIEW_UNIT = "201";
const STEPS = [1, 2, 3, 4];

function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function billingYearValue(value) {
  const year = String(value ?? "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function billingMonthValue(value) {
  const month = String(value ?? "").slice(5, 7);
  return /^\d{2}$/.test(month) ? month : String(new Date().getMonth() + 1).padStart(2, "0");
}

function billingDateFromForm(form) {
  const year = Number(billingYearValue(form.first_billing_month));
  const month = Number(billingMonthValue(form.first_billing_month));
  const maxDay = new Date(year, month, 0).getDate();
  const day = Math.min(maxDay, Math.max(1, Number(form.due_day || 1)));
  return new Date(year, month - 1, day);
}

function monthLabel(value) {
  const year = Number(billingYearValue(value));
  const month = Number(billingMonthValue(value));
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function previewMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function isNoticeTemplate(value) {
  return !String(value ?? "").trim() || /\{\{\s*(service|unit|month|amount)\s*\}\}/i.test(value);
}

function fillNoticePreview(template, serviceName, unitNumber = NOTICE_PREVIEW_UNIT) {
  const name = String(serviceName ?? "").trim() || "Service";
  return String(template ?? "")
    .replace(/\{\{\s*service\s*\}\}/gi, name)
    .replace(/\{\{\s*unit\s*\}\}/gi, unitNumber)
    .replace(/\{\{\s*month\s*\}\}/gi, previewMonthLabel())
    .replace(/\{\{\s*amount\s*\}\}/gi, "$50");
}

function defaultNoticeBodyTemplate(form) {
  return `Your ${String(form.name ?? "").trim() || "service"} bill is now available for unit {{unit}}.`;
}

function noticeTitleDisplay(form) {
  const template = String(form.notice_title ?? "").trim() || NOTICE_TITLE_TEMPLATE;
  return fillNoticePreview(template, form.name);
}

function noticeBodyDisplay(form) {
  const template = String(form.notice_body ?? "").trim() || defaultNoticeBodyTemplate(form);
  return fillNoticePreview(template, form.name);
}

function noticeFieldsForSave(form) {
  const currentTitle = String(form.notice_title ?? "").trim() || NOTICE_TITLE_TEMPLATE;
  const defaultTitlePreview = fillNoticePreview(NOTICE_TITLE_TEMPLATE, form.name);
  const noticeTitle = isNoticeTemplate(currentTitle) || currentTitle === defaultTitlePreview
    ? NOTICE_TITLE_TEMPLATE
    : currentTitle.replaceAll(NOTICE_PREVIEW_UNIT, "{{unit}}");

  const currentBody = String(form.notice_body ?? "").trim();
  const defaultBodyPreview = fillNoticePreview(defaultNoticeBodyTemplate(form), form.name);
  const noticeBody = !currentBody || isNoticeTemplate(currentBody) || currentBody === defaultBodyPreview
    ? ""
    : currentBody.replaceAll(NOTICE_PREVIEW_UNIT, "{{unit}}");

  return { notice_title: noticeTitle, notice_body: noticeBody };
}

const EMPTY_FORM = {
  name: "",
  category: "water",
  custom_category: "",
  description: "",
  status: "active",
  application_type: "automatic",
  billing_frequency: "monthly",
  amount_type: "fixed",
  amount: "",
  due_day: String(new Date().getDate()),
  first_billing_month: currentMonthValue(),
  payment_instructions: "",
  require_payment_proof: true,
  require_acknowledgement: false,
  send_notice: true,
  send_notification: true,
  notice_title: NOTICE_TITLE_TEMPLATE,
  notice_body: "",
  requires_admin_approval: false,
  max_subscribers: "",
};

const SERVICE_FIELD_MAX = {
  name: 120,
  custom_category: 80,
  description: 500,
  payment_instructions: 2000,
  notice_title: 200,
  notice_body: 4000,
};

function FieldMeta({ error, value, max }) {
  const text = value ?? "";
  const showCounter = max != null && text.length > 0;
  if (!error && !showCounter) return null;
  return (
    <View style={styles.fieldFooter}>
      {error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.fieldFooterSpacer} />}
      {showCounter ? (
        <Text style={[styles.charCounter, text.length > max && styles.charCounterError]}>
          {text.length}/{max}
        </Text>
      ) : null}
    </View>
  );
}

function RequiredLabel({ children, required = true }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

const SINGLE_LINE_INPUT_HEIGHT =
  sw(12) * 2 + Math.max(16, Math.ceil(PropertyType.bodyMd * 1.5));

const singleLineInputStyle = {
  height: SINGLE_LINE_INPUT_HEIGHT,
  paddingHorizontal: sw(14),
  paddingTop: 0,
  paddingBottom: 0,
  paddingVertical: 0,
  fontFamily: Fonts.regular,
  fontSize: PropertyType.bodyMd,
  color: "#101828",
  textAlignVertical: "center",
  includeFontPadding: false,
};

function validateServiceForm(form, step, t) {
  const errors = {};
  if (String(form.name ?? "").length > SERVICE_FIELD_MAX.name) {
    errors.name = t("services.createServiceNameMax");
  }
  if (String(form.custom_category ?? "").length > SERVICE_FIELD_MAX.custom_category) {
    errors.custom_category = t("services.createServiceCustomCategoryMax");
  }
  if (String(form.description ?? "").length > SERVICE_FIELD_MAX.description) {
    errors.description = t("services.createServiceDescriptionMax");
  }
  if (String(form.payment_instructions ?? "").length > SERVICE_FIELD_MAX.payment_instructions) {
    errors.payment_instructions = t("services.createServicePaymentInstructionsMax");
  }
  if (!isNoticeTemplate(form.notice_title) && String(form.notice_title ?? "").length > SERVICE_FIELD_MAX.notice_title) {
    errors.notice_title = t("services.createServiceNoticeTitleMax");
  }
  if (!isNoticeTemplate(form.notice_body) && String(form.notice_body ?? "").length > SERVICE_FIELD_MAX.notice_body) {
    errors.notice_body = t("services.createServiceNoticeBodyMax");
  }

  if (step >= 1) {
    const name = String(form.name ?? "").trim();
    if (!errors.name) {
      if (!name) errors.name = t("services.createServiceNameRequired");
      else if (name.length < 2) errors.name = t("services.createServiceNameShort");
    }
    if (!form.category) errors.category = t("services.createServiceCategoryRequired");
    else if (!errors.custom_category && form.category === "other" && !String(form.custom_category ?? "").trim()) {
      errors.custom_category = t("services.createServiceCustomCategoryRequired");
    }
  }
  if (step >= 2) {
    if (!form.application_type) errors.application_type = t("services.createServiceApplicationRequired");
    if (!form.billing_frequency) errors.billing_frequency = t("services.createServiceFrequencyRequired");
    if (form.application_type === "automatic" && form.billing_frequency === "one_time") {
      errors.billing_frequency = t("services.createServiceAutomaticOneTime");
    }
    if (!form.amount || Number(form.amount) <= 0) {
      errors.amount = t("services.createServiceAmountRequired");
    }
    const recurring = form.billing_frequency === "monthly" || form.billing_frequency === "yearly";
    if (recurring) {
      const dueDay = Number(form.due_day || 0);
    if (!form.due_day || dueDay < 1 || dueDay > 31) {
      errors.due_day = t("services.createServiceDueDateRequired");
    }
    }
  if ((form.application_type === "automatic" || form.billing_frequency === "yearly") && !form.first_billing_month) {
    errors.first_billing_month = form.billing_frequency === "yearly"
      ? t("services.createServiceBillingYearRequired")
      : t("services.createServiceFirstMonthRequired");
  }
  }
  return errors;
}

function buildPayload(form) {
  const recurring = form.billing_frequency === "monthly" || form.billing_frequency === "yearly";
  return {
    name: String(form.name ?? "").trim(),
    category: form.category,
    custom_category: form.category === "other" ? String(form.custom_category ?? "").trim() : null,
    description: String(form.description ?? "").trim() || null,
    status: form.status === "inactive" ? "inactive" : "active",
    application_type: form.application_type,
    billing_frequency: form.billing_frequency,
    amount_type: form.application_type === "optional" ? "fixed" : form.amount_type,
    amount: form.amount_type === "variable" ? null : Number(form.amount),
    due_day: recurring ? Number(form.due_day) : null,
    first_billing_month: recurring
      ? `${billingYearValue(form.first_billing_month)}-${billingMonthValue(form.first_billing_month)}`
      : null,
    payment_instructions: String(form.payment_instructions ?? "").trim() || null,
    require_payment_proof: Boolean(form.require_payment_proof),
    require_acknowledgement: Boolean(form.require_acknowledgement),
    auto_generate_bills: form.billing_frequency !== "one_time",
    send_notice: Boolean(form.send_notice),
    send_notification: Boolean(form.send_notification),
    ...noticeFieldsForSave(form),
    requires_admin_approval: form.application_type === "optional" ? Boolean(form.requires_admin_approval) : false,
    max_subscribers: form.application_type === "optional" && form.max_subscribers
      ? Number(form.max_subscribers)
      : null,
    unsubscribe_mode: "end_of_period",
  };
}

function ChipGroup({ options, value, onChange, error }) {
  return (
    <View style={[styles.chipWrap, error && styles.groupError]}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.chip, selected && styles.chipActive]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ModeCards({ options, value, onChange }) {
  return options.map((opt) => {
    const selected = value === opt.id;
    return (
      <Pressable
        key={opt.id}
        onPress={() => onChange(opt.id)}
        style={[styles.modeCard, selected && styles.modeCardActive]}
      >
        <View style={styles.modeCopy}>
          <Text style={styles.modeTitle}>{opt.title}</Text>
          {opt.subtitle ? <Text style={styles.modeSub}>{opt.subtitle}</Text> : null}
        </View>
        <View style={[styles.radio, selected && styles.radioActive]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </Pressable>
    );
  });
}

function SwitchRow({ title, subtitle, value, onChange }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={styles.modeTitle}>{title}</Text>
        {subtitle ? <Text style={styles.modeSub}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#CBD5E1", true: "#99F6E4" }}
        thumbColor={value ? PropertyHubTheme.teal : "#F8FAFC"}
      />
    </View>
  );
}

function ReviewRow({ label, value }) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function DateField({ value, placeholder, error, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.input, styles.dateField, error && styles.inputError]}>
      <Feather name="calendar" size={sf(16)} color="#64748B" />
      <Text style={[styles.dateFieldText, !value && styles.dateFieldPlaceholder]}>
        {value || placeholder}
      </Text>
    </Pressable>
  );
}

export default function AdminServiceFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { runAction, dialog } = useApiAction();
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [picker, setPicker] = useState(null);
  const selectedBillingDate = useMemo(() => billingDateFromForm(form), [form]);

  function applySelectedDate(date) {
    const iso = toApiDate(dateOnly(date) ?? date);
    if (!iso) return;
    setForm((prev) => ({
      ...prev,
      first_billing_month: iso.slice(0, 7),
      due_day: String(Number(iso.slice(8, 10))),
    }));
    touch("first_billing_month");
    touch("due_day");
    clearError("first_billing_month");
    clearError("due_day");
  }

  function applySelectedMonth(date) {
    const next = dateOnly(date) ?? date;
    const month = String(next.getMonth() + 1).padStart(2, "0");
    setForm((prev) => ({
      ...prev,
      first_billing_month: `${billingYearValue(prev.first_billing_month)}-${month}`,
    }));
    touch("due_month");
    clearError("due_month");
  }

  const liveErrors = useMemo(() => validateServiceForm(form, step, t), [form, step, t]);
  const fieldError = (key, value, max) => {
    const message = liveErrors[key];
    if (!message) return null;
    if (max != null && String(value ?? "").length > max) return message;
    return showError(key, liveErrors);
  };

  const setF = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "application_type") {
        if (value === "automatic" && next.billing_frequency === "one_time") {
          next.billing_frequency = "monthly";
        }
        if (value === "optional") next.amount_type = "fixed";
      }
      if (key === "billing_frequency") {
        if (next.application_type === "automatic" && value === "one_time") {
          next.billing_frequency = "monthly";
        }
        if (value === "yearly" || value === "monthly") {
          next.first_billing_month = `${billingYearValue(next.first_billing_month)}-${billingMonthValue(next.first_billing_month)}`;
        }
      }
      return next;
    });
    touch(key);
    clearError(key);
  };

  const scrollRef = useRef(null);
  const nameFieldRef = useRef(null);
  const amountFieldRef = useRef(null);
  const dueDayFieldRef = useRef(null);
  const { scrollIntoView, onScroll } = useScrollFieldRefIntoView(scrollRef, { topPad: 24 });

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    if (step !== 4) setReviewed(false);
  }, [step]);

  const goNext = () => {
    const stepKeys = step === 1
      ? ["name", "category", "custom_category", "description"]
      : step === 3
        ? ["notice_title", "notice_body"]
        : ["application_type", "billing_frequency", "amount", "due_day", "first_billing_month", "due_month", "payment_instructions"];
    stepKeys.forEach((key) => touch(key));
    if (hasFieldErrors(validateServiceForm(form, step, t))) return;
    setReviewed(false);
    setStep(step + 1);
  };

  const goBack = () => {
    if (step === 1) {
      safeGoBack(router, navigation);
      return;
    }
    setStep(step - 1);
  };

  const onPublish = useCallback(async () => {
    if (step !== 4 || !reviewed || submitting) return;
    if (!validateOnSubmit(validateServiceForm(form, 4, t))) return;

    const choice = await dialog.showConfirm(
      t("services.createServicePublishConfirmTitle"),
      t("services.createServicePublishConfirmMsg"),
      { confirmLabel: t("services.createServicePublish") },
    );
    if (choice !== "confirm") return;

    setSubmitting(true);
    await runAction({
      action: () => createAdminPropertyService(buildPayload(form)),
      successTitle: t("services.createServicePublished"),
      successMessage: t("services.createServicePublishedMsg"),
      errorTitle: t("services.createServiceCouldNotSave"),
      onSuccess: () => router.back(),
    });
    setSubmitting(false);
  }, [dialog, form, reviewed, router, runAction, step, submitting, t, validateOnSubmit]);

  const recurring = form.billing_frequency === "monthly" || form.billing_frequency === "yearly";
  const frequencyOptions = [
    { id: "monthly", label: t("services.createServicePerMonth") },
    { id: "yearly", label: t("services.createServicePerYear") },
    ...(form.application_type === "optional"
      ? [{ id: "one_time", label: t("services.createServiceOneTime") }]
      : []),
  ];
  const stepCopy = {
    1: { label: t("services.createServiceStepDetails"), title: t("services.createServiceStepDetailsTitle") },
    2: { label: t("services.createServiceStepBilling"), title: t("services.createServiceStepBillingTitle") },
    3: { label: t("services.createServiceStepNotices"), title: t("services.createServiceStepNoticesTitle") },
    4: { label: t("services.createServiceStepReview"), title: t("services.createServiceStepReviewTitle") },
  };
  const billingReview = form.billing_frequency === "yearly"
    ? t("services.createServicePerYear")
    : form.billing_frequency === "one_time"
      ? t("services.createServiceOneTime")
      : t("services.createServicePerMonth");
  const amountReview = form.amount_type === "variable"
    ? t("services.createServiceAmountVariableReview")
    : `$${form.amount || 0}`;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.createServiceTitle")}
        subtitle={t("services.createServiceStepOf", { step })}
        onBack={goBack}
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={false}
        contentContainerStyle={[styles.content, pageStyles.scrollBottom]}
        scrollProps={{ onScroll, scrollEventThrottle: 16 }}
        footer={
          <View style={styles.footer}>
            <Pressable onPress={goBack} style={styles.footerBack}>
              <Text style={styles.footerBackText}>
                {step === 1 ? t("common.cancel") : t("common.back")}
              </Text>
            </Pressable>
            {step < 4 ? (
              <Pressable onPress={goNext} style={styles.footerPrimary}>
                <Text style={styles.footerPrimaryText}>{t("services.createServiceContinue")}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void onPublish()}
                disabled={submitting || !reviewed}
                style={[styles.footerPrimary, (submitting || !reviewed) && styles.submitDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.footerPrimaryText}>{t("services.createServicePublish")}</Text>
                )}
              </Pressable>
            )}
          </View>
        }
      >
        <View style={styles.stepRow}>
          {STEPS.map((item, index) => {
            const active = item === step;
            const done = item < step;
            return (
              <View key={item} style={styles.stepItem}>
                {index > 0 ? <Text style={styles.stepArrow}>→</Text> : null}
                <View style={[styles.stepPill, active && styles.stepPillActive, done && !active && styles.stepPillDone]}>
                  <Text style={[
                    styles.stepPillText,
                    done && !active && styles.stepPillTextDone,
                    active && styles.stepPillTextActive,
                  ]}>
                    {item} {stepCopy[item].label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.stepTitle}>{stepCopy[step].title}</Text>

        {step === 1 ? (
          <>
            <View ref={nameFieldRef} collapsable={false} style={styles.field}>
              <RequiredLabel>{t("services.createServiceName")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, singleLineInputStyle, fieldError("name", form.name, SERVICE_FIELD_MAX.name) && styles.inputError]}
                value={form.name}
                onChangeText={(value) => setF("name", value)}
                onBlur={() => touch("name")}
                onFocus={() => scrollIntoView(nameFieldRef)}
                placeholder={t("services.createServiceNamePlaceholder")}
                placeholderTextColor="#94A3B8"
              />
              <FieldMeta error={fieldError("name", form.name, SERVICE_FIELD_MAX.name)} value={form.name} max={SERVICE_FIELD_MAX.name} />
            </View>

            <View style={styles.field}>
              <RequiredLabel>{t("services.createServiceCategory")}</RequiredLabel>
              <ChipGroup
                options={CATEGORIES.map((id) => ({ id, label: t(`services.serviceCategories.${id}`) }))}
                value={form.category}
                onChange={(value) => {
                  setF("category", value);
                  if (value !== "other") setF("custom_category", "");
                }}
                error={showError("category", liveErrors)}
              />
              {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}
            </View>

            {form.category === "other" ? (
              <View style={styles.field}>
                <RequiredLabel>{t("propertyMgmt.customCategoryLabel")}</RequiredLabel>
                <LocaleTextInput
                  style={[styles.input, singleLineInputStyle, fieldError("custom_category", form.custom_category, SERVICE_FIELD_MAX.custom_category) && styles.inputError]}
                  value={form.custom_category}
                  onChangeText={(value) => setF("custom_category", value)}
                  onBlur={() => touch("custom_category")}
                  placeholder={t("propertyMgmt.customCategoryPlaceholder")}
                  placeholderTextColor="#94A3B8"
                />
                <FieldMeta
                  error={fieldError("custom_category", form.custom_category, SERVICE_FIELD_MAX.custom_category)}
                  value={form.custom_category}
                  max={SERVICE_FIELD_MAX.custom_category}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <RequiredLabel required={false}>{t("services.createServiceStatus")}</RequiredLabel>
              <ChipGroup
                options={[
                  { id: "active", label: t("services.createServiceStatusActive") },
                  { id: "inactive", label: t("services.createServiceStatusInactive") },
                ]}
                value={form.status}
                onChange={(value) => setF("status", value)}
              />
            </View>

            <View style={styles.field}>
              <RequiredLabel required={false}>{t("services.createServiceDescription")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, styles.textArea, fieldError("description", form.description, SERVICE_FIELD_MAX.description) && styles.inputError]}
                value={form.description}
                onChangeText={(value) => setF("description", value)}
                placeholder={t("services.createServiceDescriptionPlaceholder")}
                placeholderTextColor="#94A3B8"
                multiline
              />
              <FieldMeta
                error={fieldError("description", form.description, SERVICE_FIELD_MAX.description)}
                value={form.description}
                max={SERVICE_FIELD_MAX.description}
              />
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={styles.field}>
              <RequiredLabel>{t("services.createServiceApplication")}</RequiredLabel>
              <ModeCards
                value={form.application_type}
                onChange={(value) => setF("application_type", value)}
                options={[
                  { id: "automatic", title: t("services.createServiceAutomatic"), subtitle: t("services.createServiceAutomaticSub") },
                  { id: "optional", title: t("services.createServiceOptional"), subtitle: t("services.createServiceOptionalSub") },
                ]}
              />
            </View>

            <View style={styles.field}>
              <RequiredLabel>{t("services.createServiceFrequency")}</RequiredLabel>
              <ChipGroup
                options={frequencyOptions}
                value={form.billing_frequency}
                onChange={(value) => setF("billing_frequency", value)}
                error={showError("billing_frequency", liveErrors)}
              />
              {showError("billing_frequency", liveErrors) ? (
                <Text style={styles.errorText}>{showError("billing_frequency", liveErrors)}</Text>
              ) : null}
            </View>

            {form.application_type === "automatic" ? (
              <View style={styles.field}>
                <RequiredLabel>{t("services.createServiceAmountType")}</RequiredLabel>
                <ChipGroup
                  options={[
                    { id: "fixed", label: t("services.createServiceAmountFixed") },
                    { id: "variable", label: t("services.createServiceAmountVariable") },
                  ]}
                  value={form.amount_type}
                  onChange={(value) => setF("amount_type", value)}
                />
              </View>
            ) : null}

            <View ref={amountFieldRef} collapsable={false} style={styles.field}>
              <RequiredLabel>{t("services.createServiceAmount")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, singleLineInputStyle, showError("amount", liveErrors) && styles.inputError]}
                value={String(form.amount ?? "")}
                onChangeText={(value) => setF("amount", value.replace(/[^0-9.]/g, ""))}
                onBlur={() => touch("amount")}
                onFocus={() => scrollIntoView(amountFieldRef)}
                placeholder={t("services.createServiceAmountPlaceholder")}
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
              {showError("amount", liveErrors) ? (
                <Text style={styles.errorText}>{showError("amount", liveErrors)}</Text>
              ) : (
                <Text style={styles.hintText}>{t("services.createServiceAmountHint")}</Text>
              )}
            </View>

            {form.billing_frequency === "yearly" ? (
              <View style={styles.field}>
                <RequiredLabel>{t("services.createServiceDueDate")}</RequiredLabel>
                <DateField
                  value={monthLabel(form.first_billing_month)}
                  placeholder={t("services.createServiceDueDate")}
                  error={showError("first_billing_month", liveErrors)}
                  onPress={() => setPicker("dueMonth")}
                />
                {showError("first_billing_month", liveErrors) ? (
                  <Text style={styles.errorText}>{showError("first_billing_month", liveErrors)}</Text>
                ) : (
                  <Text style={styles.hintText}>{t("services.createServiceFirstMonthHintYearly")}</Text>
                )}
              </View>
            ) : recurring ? (
              <View ref={dueDayFieldRef} collapsable={false} style={styles.field}>
                <RequiredLabel>{t("services.createServiceDueDate")}</RequiredLabel>
                <DateField
                  value={formatDisplayDate(selectedBillingDate)}
                  placeholder={t("services.createServiceDueDate")}
                  error={showError("first_billing_month", liveErrors) || showError("due_day", liveErrors)}
                  onPress={() => setPicker("billing")}
                />
                {showError("first_billing_month", liveErrors) || showError("due_day", liveErrors) ? (
                  <Text style={styles.errorText}>
                    {showError("first_billing_month", liveErrors) || showError("due_day", liveErrors)}
                  </Text>
                ) : (
                  <Text style={styles.hintText}>{t("services.createServiceFirstMonthHintMonthly")}</Text>
                )}
              </View>
            ) : null}

            {form.application_type === "optional" ? (
              <>
                <SwitchRow
                  title={t("services.createServiceRequiresApproval")}
                  value={form.requires_admin_approval}
                  onChange={(value) => setF("requires_admin_approval", value)}
                />
                <View style={styles.field}>
                  <RequiredLabel required={false}>{t("services.createServiceMaxSubscribers")}</RequiredLabel>
                  <LocaleTextInput
                    style={[styles.input, singleLineInputStyle]}
                    value={String(form.max_subscribers ?? "")}
                    onChangeText={(value) => setF("max_subscribers", value.replace(/[^0-9]/g, ""))}
                    placeholder={t("services.createServiceMaxSubscribersPlaceholder")}
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                  />
                </View>
              </>
            ) : null}

            <View style={styles.field}>
              <RequiredLabel required={false}>{t("services.createServicePaymentInstructions")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, styles.textArea, fieldError("payment_instructions", form.payment_instructions, SERVICE_FIELD_MAX.payment_instructions) && styles.inputError]}
                value={form.payment_instructions}
                onChangeText={(value) => setF("payment_instructions", value)}
                placeholder={t("services.createServicePaymentInstructionsPlaceholder")}
                placeholderTextColor="#94A3B8"
                multiline
              />
              <FieldMeta
                error={fieldError("payment_instructions", form.payment_instructions, SERVICE_FIELD_MAX.payment_instructions)}
                value={form.payment_instructions}
                max={SERVICE_FIELD_MAX.payment_instructions}
              />
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View style={styles.field}>
              <RequiredLabel required={false}>{t("services.createServiceNoticeTitle")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, singleLineInputStyle, fieldError("notice_title", form.notice_title, SERVICE_FIELD_MAX.notice_title) && styles.inputError]}
                value={isNoticeTemplate(form.notice_title) ? noticeTitleDisplay(form) : form.notice_title}
                onChangeText={(value) => setF("notice_title", value)}
                placeholder={`${String(form.name).trim() || "Service"} — Unit ${NOTICE_PREVIEW_UNIT}`}
                placeholderTextColor="#94A3B8"
              />
              <FieldMeta
                error={fieldError("notice_title", form.notice_title, SERVICE_FIELD_MAX.notice_title)}
                value={isNoticeTemplate(form.notice_title) ? "" : form.notice_title}
                max={SERVICE_FIELD_MAX.notice_title}
              />
              <Text style={styles.hintText}>
                {t("services.createServiceNoticeTitleHint", { unit: NOTICE_PREVIEW_UNIT })}
              </Text>
            </View>

            <View style={styles.field}>
              <RequiredLabel required={false}>{t("services.createServiceNoticeBody")}</RequiredLabel>
              <LocaleTextInput
                style={[styles.input, styles.textArea, fieldError("notice_body", form.notice_body, SERVICE_FIELD_MAX.notice_body) && styles.inputError]}
                value={isNoticeTemplate(form.notice_body) ? noticeBodyDisplay(form) : form.notice_body}
                onChangeText={(value) => setF("notice_body", value)}
                placeholder={t("services.createServiceNoticeBodyPlaceholder")}
                placeholderTextColor="#94A3B8"
                multiline
              />
              <FieldMeta
                error={fieldError("notice_body", form.notice_body, SERVICE_FIELD_MAX.notice_body)}
                value={isNoticeTemplate(form.notice_body) ? "" : form.notice_body}
                max={SERVICE_FIELD_MAX.notice_body}
              />
            </View>

            <SwitchRow
              title={t("services.createServiceSendNotice")}
              value={form.send_notice}
              onChange={(value) => setF("send_notice", value)}
            />
            <SwitchRow
              title={t("services.createServiceSendNotification")}
              value={form.send_notification}
              onChange={(value) => setF("send_notification", value)}
            />
            <SwitchRow
              title={t("services.createServiceRequireAck")}
              subtitle={t("services.createServiceRequireAckSub")}
              value={form.require_acknowledgement}
              onChange={(value) => setF("require_acknowledgement", value)}
            />
            <SwitchRow
              title={t("services.createServiceRequireProof")}
              subtitle={t("services.createServiceRequireProofSub")}
              value={form.require_payment_proof}
              onChange={(value) => setF("require_payment_proof", value)}
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <ReviewRow
              label={t("services.createServiceReviewService")}
              value={`${form.name || "—"} · ${form.application_type}`}
            />
            <ReviewRow label={t("services.createServiceReviewBilling")} value={billingReview} />
            <ReviewRow label={t("services.createServiceReviewAmount")} value={amountReview} />
            <ReviewRow
              label={t("services.createServiceReviewStatus")}
              value={form.status === "inactive" ? t("services.createServiceStatusInactive") : t("services.createServiceStatusActive")}
            />
            <ReviewRow label={t("services.createServiceReviewNotice")} value={noticeTitleDisplay(form)} />
            <Text style={styles.reviewHint}>{t("services.createServiceReviewHintBilling")}</Text>

            <Pressable onPress={() => setReviewed((current) => !current)} style={styles.reviewRow}>
              <View style={[styles.checkbox, reviewed && styles.checkboxActive]}>
                {reviewed ? <Feather name="check" size={sf(14)} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.switchCopy}>
                <Text style={styles.modeTitle}>{t("services.createServiceReview")}</Text>
                <Text style={styles.modeSub}>{t("services.createServiceReviewHint")}</Text>
              </View>
            </Pressable>
          </>
        ) : null}
      </KeyboardSafeScreen>

      <FormDatePickerSheet
        visible={picker === "billing"}
        mode="date"
        title={t("services.createServiceDueDate")}
        value={selectedBillingDate}
        onCancel={() => setPicker(null)}
        onConfirm={(date) => {
          applySelectedDate(date);
          setPicker(null);
        }}
      />
      <FormDatePickerSheet
        visible={picker === "dueMonth"}
        mode="month"
        title={t("services.createServiceDueDate")}
        value={new Date(Number(billingYearValue(form.first_billing_month)), Number(billingMonthValue(form.first_billing_month)) - 1, 1)}
        onCancel={() => setPicker(null)}
        onConfirm={(date) => {
          applySelectedMonth(date);
          setPicker(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { paddingHorizontal: sw(18), paddingTop: sw(8) },
  stepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(4),
    marginBottom: sw(12),
  },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepArrow: { fontSize: sf(11), color: "#CBD5E1", marginHorizontal: sw(2) },
  stepPill: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(5),
    backgroundColor: "#F1F5F9",
  },
  stepPillActive: { backgroundColor: "#1B4F8A" },
  stepPillDone: { backgroundColor: "#E8F0F7" },
  stepPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#64748B",
  },
  stepPillTextDone: { color: "#1B4F8A" },
  stepPillTextActive: { color: "#FFFFFF" },
  stepTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
    marginBottom: sw(4),
  },
  field: { marginBottom: sw(4) },
  label: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.caption,
    color: "#6A7282",
    marginBottom: sw(8),
    marginTop: sw(14),
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  required: {
    color: "#DC2626",
    fontFamily: Fonts.bold,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
  },
  textArea: {
    minHeight: sw(88),
    paddingHorizontal: sw(14),
    paddingTop: sw(12),
    paddingBottom: sw(12),
    fontFamily: Fonts.regular,
    fontSize: PropertyType.bodyMd,
    color: "#101828",
    textAlignVertical: "top",
  },
  inputError: { borderColor: "#DC2626" },
  dateField: {
    minHeight: SINGLE_LINE_INPUT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(14),
    gap: sw(10),
  },
  dateFieldText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: PropertyType.bodyMd,
    color: "#101828",
  },
  dateFieldPlaceholder: { color: "#94A3B8" },
  groupError: {
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: sw(12),
    padding: sw(6),
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
    marginTop: sw(6),
    marginRight: sw(8),
  },
  fieldFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  fieldFooterSpacer: {
    flex: 1,
  },
  charCounter: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    marginTop: sw(6),
    fontVariant: ["tabular-nums"],
  },
  charCounterError: { color: "#DC2626" },
  hintText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#94A3B8",
    marginTop: sw(6),
    lineHeight: sf(17),
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  chip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  chipActive: { borderColor: "#1B4F8A", backgroundColor: "#D1FAF5" },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: PropertyType.caption,
    color: "#64748B",
  },
  chipTextActive: { color: "#1B4F8A" },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    padding: sw(14),
    marginBottom: sw(8),
  },
  modeCardActive: { borderColor: "#1B4F8A", backgroundColor: "#F8FBFF" },
  modeCopy: { flex: 1, marginEnd: sw(10) },
  modeTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.bodyMd,
    color: "#101828",
  },
  modeSub: {
    fontFamily: Fonts.regular,
    fontSize: PropertyType.micro,
    color: "#6A7282",
    marginTop: sw(2),
  },
  radio: {
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: "#1B4F8A" },
  radioDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    backgroundColor: "#1B4F8A",
  },
  switchRow: {
    marginTop: sw(16),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(14),
  },
  switchCopy: { flex: 1, marginEnd: sw(12) },
  reviewCard: {
    marginTop: sw(10),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  reviewLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reviewValue: {
    marginTop: sw(2),
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#1E293B",
  },
  reviewHint: {
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  reviewRow: {
    marginTop: sw(16),
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(14),
    gap: sw(12),
  },
  checkbox: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(6),
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: sw(2),
  },
  checkboxActive: {
    backgroundColor: "#1B4F8A",
    borderColor: "#1B4F8A",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(12),
    paddingHorizontal: sw(4),
  },
  footerBack: {
    minHeight: sw(44),
    justifyContent: "center",
    paddingHorizontal: sw(8),
  },
  footerBackText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#64748B",
  },
  footerPrimary: {
    minHeight: sw(44),
    minWidth: sw(140),
    paddingHorizontal: sw(18),
    borderRadius: sw(12),
    backgroundColor: "#1B4F8A",
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  submitDisabled: { opacity: 0.5 },
});
