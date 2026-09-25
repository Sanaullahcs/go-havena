import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator } from "react-native";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import KeyboardSafeScreen, {
  useScrollFieldRefIntoView,
} from "../../../../components/layout/keyboard-safe-screen";
import BusinessHoursInput from "../../../../components/ui/business-hours-input";
import AmenityIcon from "../../../../components/property/amenity-icon";
import { Fonts } from "../../../../constants/font";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { getCurrentRole } from "../../../../constants/role-session";
import { sw, sf } from "../../../../utils/responsive";
import {
  AMENITY_ICON_CATALOG,
  SLOT_DURATION_OPTIONS,
  validateAmenityForm,
  buildAmenityPayload,
  generateAmenitySlots,
  parseHoursToApiTimes,
} from "../../../../utils/amenity-display";
import { hasFieldErrors } from "../../../../utils/form-validation";
import { submitAmenity, createAmenity } from "../../../../services/amenity-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../../../hooks/use-touched-field-errors";

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "bookable",
  capacity: "",
  floor: "",
  hours: "",
  weekends_available: true,
  slot_duration_minutes: 60,
  icon_key: "gym",
  custom_category: "",
  booking_charge: "free",
  booking_fee: "",
  shared_billing_enabled: false,
  shared_billing_frequency: "monthly",
  shared_billing_amount: "",
  shared_billing_due_day: "",
};

const STATUS_OPTION_KEYS = [
  { id: "bookable",  titleKey: "propertyMgmt.timedSlots",        subtitleKey: "propertyMgmt.timedSlotsSub" },
  { id: "open",      titleKey: "propertyMgmt.openAvailability",  subtitleKey: "propertyMgmt.openAvailabilitySub" },
  { id: "closed",    titleKey: "propertyMgmt.closed",            subtitleKey: "propertyMgmt.closedModeSub" },
];

function RequiredLabel({ children }) {
  return (
    <Text style={styles.label}>
      {children}
      <Text style={styles.required}> *</Text>
    </Text>
  );
}

/**
 * Keep this a plain object (not StyleSheet.create). The global text-metrics
 * patch adds lineHeight to StyleSheet text styles, and iOS TextInput then
 * top-aligns the placeholder instead of centering it.
 *
 * Height matches the previous paddingVertical + patched line box so the
 * field chrome does not change.
 */
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

export default function AmenityFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const isAdmin = getCurrentRole() === "admin";
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const { runAction } = useApiAction();
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const liveErrors = useMemo(() => validateAmenityForm(form), [form]);
  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const previewSlots = useMemo(() => {
    if (form.status !== "bookable") return [];
    const times = parseHoursToApiTimes(form.hours);
    if (!times) return [];
    return generateAmenitySlots(
      times.start_time,
      times.end_time,
      form.slot_duration_minutes,
    ).slice(0, 6);
  }, [form.hours, form.slot_duration_minutes, form.status]);

  const setF = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    touch(key);
    clearError(key);
  };

  const onSubmit = useCallback(async () => {
    if (!validateOnSubmit(liveErrors) || submitting) return;

    const payload = buildAmenityPayload(form);
    setSubmitting(true);
    await runAction({
      action: () => (isAdmin ? createAmenity(payload) : submitAmenity(payload)),
      successTitle: isAdmin ? t("propertyMgmt.amenityPublished") : t("propertyMgmt.amenitySubmitted"),
      successMessage: isAdmin
        ? t("propertyMgmt.amenityPublishedMsg")
        : t("propertyMgmt.amenitySubmittedMsg"),
      errorTitle: t("propertyMgmt.couldNotSaveAmenity"),
      onSuccess: () => router.back(),
    });
    setSubmitting(false);
  }, [
    liveErrors,
    validateOnSubmit,
    submitting,
    form,
    runAction,
    isAdmin,
    router,
    t,
  ]);

  const nameError = showError("name", liveErrors);
  const descriptionError = showError("description", liveErrors);
  const iconError = showError("icon_key", liveErrors);
  const statusError = showError("status", liveErrors);
  const hoursError = showError("hours", liveErrors);
  const slotError = showError("slot_duration_minutes", liveErrors);
  const capacityError = showError("capacity", liveErrors);
  const floorError = showError("floor", liveErrors);

  const scrollRef = useRef(null);
  const nameFieldRef = useRef(null);
  const capacityFieldRef = useRef(null);
  const locationFieldRef = useRef(null);
  const { scrollIntoView, onScroll } = useScrollFieldRefIntoView(scrollRef, {
    topPad: 24,
  });

  const handleFieldFocus = useCallback(
    (fieldRef) => {
      scrollIntoView(fieldRef);
    },
    [scrollIntoView],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.addAmenityTitle")}
        subtitle={
          isAdmin
            ? t("propertyMgmt.adminPublishHint")
            : t("propertyMgmt.residentApprovalHint")
        }
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={false}
        contentContainerStyle={[styles.content, pageStyles.scrollBottom]}
        scrollProps={{ onScroll, scrollEventThrottle: 16 }}
      >
        <View ref={nameFieldRef} collapsable={false} style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.nameLabel")}</RequiredLabel>
          <LocaleTextInput
            style={[styles.input, singleLineInputStyle, nameError && styles.inputError]}
            value={form.name}
            onChangeText={(v) => setF("name", v)}
            onBlur={() => touch("name")}
            onFocus={() => handleFieldFocus(nameFieldRef)}
            placeholder={t("propertyMgmt.namePlaceholder")}
            placeholderTextColor="#94A3B8"
            maxLength={100}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.descriptionLabel")}</Text>
          <LocaleTextInput
            style={[styles.input, styles.textArea, descriptionError && styles.inputError]}
            value={form.description}
            onChangeText={(v) => setF("description", v)}
            onBlur={() => touch("description")}
            placeholder={t("propertyMgmt.descriptionPlaceholder")}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
          />
          {descriptionError ? (
            <Text style={styles.errorText}>{descriptionError}</Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.categoryLabel")}</RequiredLabel>
          <View style={[styles.iconGrid, iconError && styles.groupError]}>
            {AMENITY_ICON_CATALOG.map((item) => {
              const selected = form.icon_key === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setF("icon_key", item.key)}
                  style={[styles.iconChip, selected && styles.iconChipActive]}
                >
                  <AmenityIcon
                    iconKey={item.key}
                    name={item.label}
                    size={sf(18)}
                    color={item.tint}
                  />
                  <Text style={styles.iconLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {iconError ? <Text style={styles.errorText}>{iconError}</Text> : null}
        </View>

        {form.icon_key === "other" ? (
          <View style={styles.field}>
            <RequiredLabel>{t("propertyMgmt.customCategoryLabel")}</RequiredLabel>
            <LocaleTextInput
              style={[
                styles.input,
                showError("custom_category", liveErrors) && styles.inputError,
              ]}
              value={form.custom_category}
              onChangeText={(v) => setF("custom_category", v)}
              onBlur={() => touch("custom_category")}
              placeholder={t("propertyMgmt.customCategoryPlaceholder")}
              placeholderTextColor="#94A3B8"
              maxLength={80}
            />
            {showError("custom_category", liveErrors) ? (
              <Text style={styles.errorText}>{liveErrors.custom_category}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.bookingMode")}</RequiredLabel>
          {STATUS_OPTION_KEYS.map((opt) => {
            const selected = form.status === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setF("status", opt.id)}
                style={[
                  styles.modeCard,
                  selected && styles.modeCardActive,
                  statusError && styles.inputError,
                ]}
              >
                <View style={styles.modeCopy}>
                  <Text style={styles.modeTitle}>{t(opt.titleKey)}</Text>
                  <Text style={styles.modeSub}>{t(opt.subtitleKey)}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioActive]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
          {statusError ? <Text style={styles.errorText}>{statusError}</Text> : null}
        </View>

        {form.status !== "open" ? (
          <View ref={capacityFieldRef} collapsable={false} style={styles.field}>
            <Text style={styles.label}>{t("admin.capacity")}</Text>
            <LocaleTextInput
              style={[
                styles.input,
                singleLineInputStyle,
                capacityError && styles.inputError,
                form.status === "closed" && styles.inputDisabled,
              ]}
              value={String(form.capacity)}
              onChangeText={(v) => setF("capacity", v.replace(/[^0-9]/g, ""))}
              onBlur={() => touch("capacity")}
              onFocus={() => handleFieldFocus(capacityFieldRef)}
              keyboardType="number-pad"
              placeholder={t("admin.capacityPlaceholder")}
              placeholderTextColor="#94A3B8"
              editable={form.status !== "closed"}
            />
            <Text style={styles.modeSub}>{t("admin.capacitySlotsHint")}</Text>
            {capacityError ? <Text style={styles.errorText}>{capacityError}</Text> : null}
          </View>
        ) : null}

        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.dailyHours")}</RequiredLabel>
          <BusinessHoursInput
            value={form.hours}
            onChange={(v) => setF("hours", v)}
            showError={Boolean(hoursError)}
          />
          {hoursError ? <Text style={styles.errorText}>{hoursError}</Text> : null}
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.modeTitle}>{t("propertyMgmt.weekendsAvailable")}</Text>
            <Text style={styles.modeSub}>{t("propertyMgmt.weekendsOff")}</Text>
          </View>
          <Switch
            value={form.weekends_available}
            onValueChange={(v) => setF("weekends_available", v)}
            trackColor={{ false: "#E2E8F0", true: "#93C5FD" }}
            thumbColor={form.weekends_available ? "#1B4F8A" : "#F8FAFC"}
          />
        </View>

        {form.status === "bookable" ? (
          <View style={styles.field}>
            <RequiredLabel>{t("propertyMgmt.slotDuration")}</RequiredLabel>
            <View style={[styles.durationRow, slotError && styles.groupError]}>
              {SLOT_DURATION_OPTIONS.map((opt) => {
                const selected = Number(form.slot_duration_minutes) === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setF("slot_duration_minutes", opt.value)}
                    style={[styles.durationChip, selected && styles.durationChipActive]}
                  >
                    <Text
                      style={[styles.durationText, selected && styles.durationTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {slotError ? <Text style={styles.errorText}>{slotError}</Text> : null}

            {previewSlots.length > 0 ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>{t("propertyMgmt.slotsPreview")}</Text>
                {previewSlots.map((slot) => (
                  <Text key={slot.value} style={styles.previewSlot}>
                    {slot.value}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {(form.status === "bookable" || form.status === "open") && !form.shared_billing_enabled ? (
          <>
            <View style={styles.field}>
              <RequiredLabel>{t("propertyMgmt.bookingAmountLabel")}</RequiredLabel>
              <View style={styles.durationRow}>
                {[
                  { id: "free", label: t("propertyMgmt.bookingAmountFree") },
                  { id: "paid", label: t("propertyMgmt.bookingAmountPaid") },
                ].map((opt) => {
                  const selected = (form.booking_charge || "free") === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        setF("booking_charge", opt.id);
                        if (opt.id === "free") setF("booking_fee", "");
                      }}
                      style={[styles.durationChip, selected && styles.durationChipActive]}
                    >
                      <Text style={[styles.durationText, selected && styles.durationTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.modeSub}>{t("propertyMgmt.bookingAmountHint")}</Text>
            </View>
            {form.booking_charge === "paid" ? (
              <View style={styles.field}>
                <RequiredLabel>{t("propertyMgmt.bookingFee")}</RequiredLabel>
                <LocaleTextInput
                  style={[
                    styles.input,
                    showError("booking_fee", liveErrors) && styles.inputError,
                  ]}
                  value={String(form.booking_fee ?? "")}
                  onChangeText={(v) => setF("booking_fee", v.replace(/[^0-9.]/g, ""))}
                  onBlur={() => touch("booking_fee")}
                  placeholder={t("propertyMgmt.bookingAmountPlaceholder")}
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
                {showError("booking_fee", liveErrors) ? (
                  <Text style={styles.errorText}>{liveErrors.booking_fee}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {isAdmin ? (
          <>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.modeTitle}>{t("admin.sharedBilling")}</Text>
                <Text style={styles.modeSub}>{t("admin.sharedBillingHint")}</Text>
              </View>
              <Switch
                value={Boolean(form.shared_billing_enabled)}
                    onValueChange={(v) => {
                  setF("shared_billing_enabled", v);
                  if (v) {
                    setF("booking_charge", "free");
                    setF("booking_fee", "");
                  } else {
                    setF("shared_billing_amount", "");
                    setF("shared_billing_due_day", "");
                  }
                }}
                trackColor={{ false: "#E2E8F0", true: "#93C5FD" }}
                thumbColor={form.shared_billing_enabled ? "#1B4F8A" : "#F8FAFC"}
              />
            </View>
            {form.shared_billing_enabled ? (
              <>
                <View style={styles.field}>
                  <RequiredLabel>{t("admin.sharedBillingFrequency")}</RequiredLabel>
                  <View style={styles.durationRow}>
                    {[
                      { id: "monthly", label: t("admin.sharedBillingMonthly") },
                      { id: "yearly", label: t("admin.sharedBillingYearly") },
                    ].map((opt) => {
                      const selected = (form.shared_billing_frequency || "monthly") === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setF("shared_billing_frequency", opt.id)}
                          style={[styles.durationChip, selected && styles.durationChipActive]}
                        >
                          <Text style={[styles.durationText, selected && styles.durationTextActive]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.field}>
                  <RequiredLabel>{t("admin.amountPerResident")}</RequiredLabel>
                  <LocaleTextInput
                    style={[
                      styles.input,
                      showError("shared_billing_amount", liveErrors) && styles.inputError,
                    ]}
                    value={String(form.shared_billing_amount ?? "")}
                    onChangeText={(v) => setF("shared_billing_amount", v.replace(/[^0-9.]/g, ""))}
                    onBlur={() => touch("shared_billing_amount")}
                    placeholder="25"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                  />
                  {showError("shared_billing_amount", liveErrors) ? (
                    <Text style={styles.errorText}>{liveErrors.shared_billing_amount}</Text>
                  ) : null}
                </View>
                <View style={styles.field}>
                  <RequiredLabel>{t("admin.sharedDueDay")}</RequiredLabel>
                  <LocaleTextInput
                    style={[
                      styles.input,
                      showError("shared_billing_due_day", liveErrors) && styles.inputError,
                    ]}
                    value={String(form.shared_billing_due_day ?? "")}
                    onChangeText={(v) => setF("shared_billing_due_day", v.replace(/[^0-9]/g, ""))}
                    onBlur={() => touch("shared_billing_due_day")}
                    placeholder="10"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  {showError("shared_billing_due_day", liveErrors) ? (
                    <Text style={styles.errorText}>{liveErrors.shared_billing_due_day}</Text>
                  ) : null}
                </View>
              </>
            ) : null}
          </>
        ) : null}

        <View ref={locationFieldRef} collapsable={false} style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.locationLabel")}</RequiredLabel>
          <LocaleTextInput
            style={[styles.input, singleLineInputStyle, floorError && styles.inputError]}
            value={form.floor}
            onChangeText={(v) => setF("floor", v)}
            onBlur={() => touch("floor")}
            onFocus={() => handleFieldFocus(locationFieldRef)}
            placeholder={t("propertyMgmt.locationPlaceholder")}
            placeholderTextColor="#94A3B8"
            maxLength={40}
          />
          {floorError ? <Text style={styles.errorText}>{floorError}</Text> : null}
        </View>

        <Pressable
          style={[styles.submit, (!canSubmit || submitting) && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="check" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.submitText}>
                {isAdmin ? t("propertyMgmt.publishAmenity") : t("propertyMgmt.submitForApproval")}
              </Text>
            </>
          )}
        </Pressable>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { paddingHorizontal: sw(18), paddingTop: sw(12) },
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
  inputDisabled: { backgroundColor: "#F1F5F9", color: "#94A3B8" },
  groupError: {
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: sw(12),
    padding: sw(6),
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
    marginTop: sw(6),
  },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  iconChip: {
    width: "23%",
    minWidth: sw(72),
    alignItems: "center",
    paddingVertical: sw(10),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: sw(4),
  },
  iconChipActive: { borderColor: "#1B4F8A", backgroundColor: "#D1FAF5" },
  iconLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    color: "#64748B",
  },
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
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  durationChip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  durationChipActive: { borderColor: "#1B4F8A", backgroundColor: "#D1FAF5" },
  durationText: {
    fontFamily: Fonts.semiBold,
    fontSize: PropertyType.caption,
    color: "#64748B",
  },
  durationTextActive: { color: "#1B4F8A" },
  previewCard: {
    marginTop: sw(12),
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(14),
    gap: sw(4),
  },
  previewTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.caption,
    color: "#334155",
    marginBottom: sw(4),
  },
  previewSlot: {
    fontFamily: Fonts.regular,
    fontSize: PropertyType.micro,
    color: "#64748B",
  },
  submit: {
    marginTop: sw(24),
    backgroundColor: "#1B4F8A",
    borderRadius: sw(12),
    paddingVertical: sw(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  submitDisabled: { opacity: 0.5 },
  submitText: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.bodyMd,
    color: "#FFFFFF",
  },
});
