import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { KeyboardScroll } from "../../../../components/ui/keyboard-form";
import FormDatePickerSheet from "../../../../components/forms/form-date-picker-sheet";
import { formatDisplayDate, toApiDate } from "../../../../utils/form-datetime";
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

export default function AgreementForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showFailure } = useApiAction();
  const { submitting, run } = useSubmitLock();
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
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
    if (step !== 2) return;
    const handle = setTimeout(() => {
      fetchAgreementOptions(search).then(setOptions).catch(() => undefined);
    }, 250);
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

  const publish = () => run(async () => {
    const id = await saveDraft();
    const result = await publishAgreement(id, {
      scope,
      user_ids: selectedUsers,
      unit_ids: selectedUnits,
      notify,
    });
    if (result.already_published) return;
    router.back();
  }).catch((err) => showFailure(t("propertyMgmt.publishAgreement"), err));

  const dateValue = openDate === "effective" ? effectiveAt : openDate === "expires" ? expiresAt : dueAt;
  const minimumDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  const liveDateErrors = useMemo(
    () => agreementDateErrors(dueAt, effectiveAt, expiresAt, t),
    [dueAt, effectiveAt, expiresAt, t],
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
    setCategoryOpen(false);
    setOpenDate(key);
  };
  const closeDate = () => {
    if (openDate) touch(dateFieldKey);
    setOpenDate(null);
  };
  const categoryQuery = category.trim().toLowerCase();
  const categorySuggestions = categories.filter((name) => !categoryQuery || name.toLowerCase().includes(categoryQuery));

  const recipientCount = scope === "all"
    ? options.resident_count
    : scope === "residents"
      ? selectedUsers.length
      : options.units.filter((unit) => selectedUnits.includes(unit.id)).reduce((sum, unit) => sum + unit.resident_count, 0);

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("propertyMgmt.createAgreement")} />
      <KeyboardScroll ref={scrollRef} footerHeight={sw(76)} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Text style={styles.label}>{t("propertyMgmt.docTitleLabel")}</Text>
            <LocaleTextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
            <View style={styles.combo}>
              <LocaleTextInput
                style={styles.comboInput}
                value={category}
                onChangeText={(value) => {
                  setCategory(value);
                  setCategoryOpen(true);
                }}
                onFocus={() => setCategoryOpen(true)}
                placeholder={t("propertyMgmt.categoryPlaceholder")}
                placeholderTextColor="#9CA3AF"
                maxLength={100}
              />
              <Pressable style={styles.comboButton} onPress={() => setCategoryOpen((open) => !open)} hitSlop={8}>
                <Feather name={categoryOpen ? "chevron-up" : "chevron-down"} size={sf(16)} color="#64748B" />
              </Pressable>
            </View>
            {categoryOpen && categorySuggestions.length > 0 ? (
              <ScrollView style={styles.menu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {categorySuggestions.map((name) => (
                  <Pressable
                    key={name}
                    style={styles.menuItem}
                    onPress={() => {
                      setCategory(name);
                      setCategoryOpen(false);
                    }}
                  >
                    <Text style={styles.menuText}>{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Text style={styles.label}>{t("propertyMgmt.docDescriptionLabel")}</Text>
            <LocaleTextInput style={[styles.input, styles.area]} value={description} onChangeText={setDescription} multiline />
            {[
              ["due", "dueAt", t("propertyMgmt.dueDate"), dueAt],
              ["effective", "effectiveAt", t("propertyMgmt.agreementEffectiveDate"), effectiveAt],
              ["expires", "expiresAt", t("propertyMgmt.expirationDate"), expiresAt],
            ].map(([key, field, label, value]) => {
              const error = showError(field, liveDateErrors);
              return (
                <View
                  key={key}
                  onLayout={(event) => {
                    if (openDate !== key) return;
                    const y = event.nativeEvent.layout.y;
                    scrollRef.current?.scrollTo?.({ y: Math.max(0, y - sw(8)), animated: true });
                  }}
                >
                  <Text style={styles.label}>{label}</Text>
                  <Pressable style={[styles.input, error && styles.inputError]} onPress={() => showDate(key)}>
                    <Text style={value ? styles.dateValue : styles.datePlaceholder}>{value ? formatDisplayDate(value) : t("propertyMgmt.selectDate")}</Text>
                  </Pressable>
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <FormDatePickerSheet
                    embedded
                    visible={openDate === key}
                    value={dateValue}
                    minimumDate={minimumDate}
                    title={label}
                    onCancel={closeDate}
                    onConfirm={confirmDate}
                  />
                </View>
              );
            })}
            <Pressable style={styles.file} onPress={pickFile}>
              <Text style={styles.fileText}>{file?.name ?? t("propertyMgmt.tapChooseFile")}</Text>
            </Pressable>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <View style={styles.methods}>
              {["all", "residents", "units"].map((item) => (
                <Pressable key={item} onPress={() => setScope(item)} style={[styles.method, scope === item && styles.methodOn]}>
                  <Text style={[styles.methodText, scope === item && styles.methodTextOn]}>
                    {item === "all" ? t("propertyMgmt.allResidents") : item === "residents" ? t("propertyMgmt.selectedResidents") : t("propertyMgmt.selectedUnits")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <LocaleTextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={t("propertyMgmt.searchDocuments")} />
            <Text style={styles.hint}>{recipientCount}</Text>
            <ScrollView style={{ maxHeight: hp(40) }}>
              {scope === "residents" ? options.residents.map((person) => (
                <Pressable key={person.id} style={styles.choice} onPress={() => setSelectedUsers((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])}>
                  <Text style={styles.choiceTitle}>{selectedUsers.includes(person.id) ? "✓ " : ""}{person.name}</Text>
                  <Text style={styles.hint}>{(person.units ?? []).map((unit) => unit.unit_number).join(", ")}</Text>
                </Pressable>
              )) : null}
              {scope === "units" ? options.units.map((unit) => (
                <Pressable key={unit.id} style={styles.choice} onPress={() => setSelectedUnits((current) => current.includes(unit.id) ? current.filter((id) => id !== unit.id) : [...current, unit.id])}>
                  <Text style={styles.choiceTitle}>{selectedUnits.includes(unit.id) ? "✓ " : ""}{unit.unit_number}</Text>
                  <Text style={styles.hint}>{(unit.residents ?? []).map((person) => person.name).join(", ")}</Text>
                </Pressable>
              )) : null}
            </ScrollView>
            <Pressable onPress={() => setNotify((value) => !value)}>
              <Text style={styles.hint}>{notify ? "✓ " : ""}Notify residents</Text>
            </Pressable>
          </>
        ) : step === 3 ? (
          <View>
            <Text style={styles.choiceTitle}>{title}</Text>
            <Text style={styles.hint}>{file?.name}</Text>
            <Text style={styles.hint}>{effectiveAt ? formatDisplayDate(effectiveAt) : t("propertyMgmt.noEffectiveDate")}</Text>
            <Text style={styles.hint}>{expiresAt ? formatDisplayDate(expiresAt) : t("propertyMgmt.noExpirationDate")}</Text>
          </View>
        ) : null}
      </KeyboardScroll>
      <View style={styles.footer}>
        {step > 1 ? <Pressable style={styles.secondary} onPress={() => setStep((value) => value - 1)}><Text style={styles.secondaryText}>Back</Text></Pressable> : null}
        {step < 3 ? (
          <Pressable
            style={styles.primary}
            onPress={() => {
              if (step === 1 && (!title.trim() || !category.trim() || !file || !validateOnSubmit(liveDateErrors))) return;
              setStep((value) => value + 1);
            }}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} disabled={submitting} onPress={publish}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t("propertyMgmt.publishAgreement")}</Text>}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: sw(18), paddingBottom: hp(4) },
  label: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#374151", marginBottom: sw(6), marginTop: sw(12) },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: sw(12), padding: sw(12), fontFamily: Fonts.regular, color: "#111827" },
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
  area: { minHeight: sw(80), textAlignVertical: "top" },
  file: { marginTop: sw(12), borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", borderRadius: sw(12), padding: sw(16) },
  fileText: { fontFamily: Fonts.medium, color: "#1B4F8A" },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  method: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: sw(999), paddingHorizontal: sw(12), paddingVertical: sw(8) },
  methodOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  methodText: { fontFamily: Fonts.medium, color: "#475569", fontSize: sf(12) },
  methodTextOn: { color: "#FFFFFF" },
  choice: { paddingVertical: sw(10), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E7EB" },
  choiceTitle: { fontFamily: Fonts.bold, color: "#111827", fontSize: sf(15) },
  hint: { fontFamily: Fonts.regular, color: "#64748B", marginTop: sw(4) },
  footer: { flexDirection: "row", gap: sw(8), padding: sw(18) },
  primary: { flex: 1, backgroundColor: "#1B4F8A", borderRadius: sw(14), alignItems: "center", paddingVertical: sw(14) },
  primaryText: { color: "#FFFFFF", fontFamily: Fonts.bold },
  secondary: { paddingHorizontal: sw(16), justifyContent: "center" },
  secondaryText: { color: "#1B4F8A", fontFamily: Fonts.bold },
});
