import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Keyboard } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { KeyboardScroll } from "../../../../components/ui/keyboard-form";
import FormDatePickerSheet from "../../../../components/forms/form-date-picker-sheet";
import DocumentCategoryPicker from "../../../../components/forms/document-category-picker";
import {
  DOCUMENT_OTHER_CATEGORY,
  buildDocumentCategoryOptions,
  resolveDocumentCategory,
} from "../../../../constants/document-categories";
import { LIMITS } from "../../../../utils/form-validation";
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
import { viewerHtml } from "./sign-agreement";

export default function AgreementForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showFailure } = useApiAction();
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
    setOpenDate(key);
  };
  const closeDate = () => {
    if (openDate) touch(dateFieldKey);
    setOpenDate(null);
  };
  const categoryOptions = useMemo(() => buildDocumentCategoryOptions(categories), [categories]);
  const category = resolveDocumentCategory(categorySelect, customCategory);

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

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("propertyMgmt.createAgreement")} />
      <KeyboardScroll ref={scrollRef} footerHeight={sw(76)} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.steps}>
          {[t("propertyMgmt.agreementDetails"), t("propertyMgmt.residents"), t("propertyMgmt.reviewStep")].map((label, index) => {
            const current = index + 1;
            const on = step === current;
            const done = step > current;
            return (
              <View key={label} style={[styles.stepChip, (on || done) && styles.stepChipOn]}>
                <Text style={[styles.stepText, (on || done) && styles.stepTextOn]}>{current}. {label}</Text>
              </View>
            );
          })}
        </View>
        {step === 1 ? (
          <>
            <Text style={styles.label}>{t("propertyMgmt.docTitleLabel")}</Text>
            <LocaleTextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
            <DocumentCategoryPicker
              selection={categorySelect}
              customValue={customCategory}
              options={categoryOptions}
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
            {scope !== "all" ? <LocaleTextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={t("propertyMgmt.searchDocuments")} /> : null}
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
          <View style={styles.reviewCard}>
            <Text style={styles.choiceTitle}>{title}</Text>
            {category ? <Text style={styles.hint}>{category}</Text> : null}
            <Text style={styles.hint}>{file?.name}</Text>
            <Text style={styles.hint}>{dueAt ? formatDisplayDate(dueAt) : t("propertyMgmt.noDueDate")}</Text>
            <Text style={styles.hint}>{effectiveAt ? formatDisplayDate(effectiveAt) : t("propertyMgmt.noEffectiveDate")}</Text>
            <Text style={styles.hint}>{expiresAt ? formatDisplayDate(expiresAt) : t("propertyMgmt.noExpirationDate")}</Text>
            <Text style={styles.hint}>{recipientCount} · {notify ? t("propertyMgmt.notifyResidents") : t("propertyMgmt.dontNotifyResidents")}</Text>
            {previewHtml ? (
              <View style={styles.previewFrame}>
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
              </View>
            ) : (
              <View style={styles.previewFrame}>
                <ActivityIndicator color="#1B4F8A" />
              </View>
            )}
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
  steps: { flexDirection: "row", flexWrap: "wrap", gap: sw(6), marginBottom: sw(8) },
  stepChip: { borderRadius: sw(999), backgroundColor: "#F1F5F9", paddingHorizontal: sw(10), paddingVertical: sw(6) },
  stepChipOn: { backgroundColor: "#E8F0F7" },
  stepText: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  stepTextOn: { color: "#1B4F8A" },
  reviewCard: { gap: sw(2) },
  previewFrame: {
    height: sw(360),
    marginTop: sw(12),
    borderRadius: sw(16),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  previewWeb: { width: "100%", height: "100%", backgroundColor: "#F4F7FB" },
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
