import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
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
  capacity: "10",
  floor: "",
  hours: "",
  weekends_available: true,
  slot_duration_minutes: 60,
  icon_key: "building",
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, pageStyles.scrollBottom]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.nameLabel")}</RequiredLabel>
          <TextInput
            style={[styles.input, nameError && styles.inputError]}
            value={form.name}
            onChangeText={(v) => setF("name", v)}
            onBlur={() => touch("name")}
            placeholder={t("propertyMgmt.namePlaceholder")}
            placeholderTextColor="#94A3B8"
            maxLength={100}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.descriptionLabel")}</Text>
          <TextInput
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
            thumbColor={form.weekends_available ? "#0A2A43" : "#F8FAFC"}
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

        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.capacityLabel")}</RequiredLabel>
          <TextInput
            style={[styles.input, capacityError && styles.inputError]}
            value={String(form.capacity)}
            onChangeText={(v) => setF("capacity", v.replace(/[^0-9]/g, ""))}
            onBlur={() => touch("capacity")}
            keyboardType="number-pad"
            placeholder="10"
            placeholderTextColor="#94A3B8"
          />
          {capacityError ? <Text style={styles.errorText}>{capacityError}</Text> : null}
        </View>

        <View style={styles.field}>
          <RequiredLabel>{t("propertyMgmt.locationLabel")}</RequiredLabel>
          <TextInput
            style={[styles.input, floorError && styles.inputError]}
            value={form.floor}
            onChangeText={(v) => setF("floor", v)}
            onBlur={() => touch("floor")}
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
      </ScrollView>
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
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: PropertyType.bodyMd,
    color: "#101828",
  },
  textArea: { minHeight: sw(88), textAlignVertical: "top" },
  inputError: { borderColor: "#DC2626" },
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
  iconChipActive: { borderColor: "#0A2A43", backgroundColor: "#D1FAF5" },
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
  modeCardActive: { borderColor: "#0A2A43", backgroundColor: "#F8FBFF" },
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
  radioActive: { borderColor: "#0A2A43" },
  radioDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    backgroundColor: "#0A2A43",
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
  durationChipActive: { borderColor: "#0A2A43", backgroundColor: "#D1FAF5" },
  durationText: {
    fontFamily: Fonts.semiBold,
    fontSize: PropertyType.caption,
    color: "#64748B",
  },
  durationTextActive: { color: "#0A2A43" },
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
    backgroundColor: "#0A2A43",
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
