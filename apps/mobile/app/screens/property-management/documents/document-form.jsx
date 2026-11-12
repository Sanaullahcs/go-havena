import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Switch, Keyboard } from "react-native";
import { KeyboardScroll } from "../../../../components/ui/keyboard-form";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import {
  createCommunityDocument,
  fetchAdminCommunityDocuments,
  fetchCommunityDocument,
  updateCommunityDocument,
} from "../../../../services/documents-api";
import {
  DOCUMENT_OTHER_CATEGORY,
  buildDocumentCategoryOptions,
  resolveDocumentCategory,
  splitDocumentCategory,
} from "../../../../constants/document-categories";
import { validateDocumentForm, hasFieldErrors, LIMITS } from "../../../../utils/form-validation";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../../hooks/use-touched-field-errors";
import FormDatePickerSheet from "../../../../components/forms/form-date-picker-sheet";
import DocumentCategoryPicker from "../../../../components/forms/document-category-picker";
import { formatDisplayDate, toApiDate } from "../../../../utils/form-datetime";
import { agreementDateErrors, agreementDateFromApi } from "../../../../utils/agreement-dates";

const DEFAULT_FORM = {
  title: "",
  category: "",
  description: "",
  status: "active",
};

export default function DocumentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { documentId } = useLocalSearchParams();
  const isEdit = Boolean(documentId);
  const { submitting, run } = useSubmitLock();
  const { showFailure } = useApiAction();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [fileAsset, setFileAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [managedCategories, setManagedCategories] = useState([]);
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isAgreement, setIsAgreement] = useState(false);
  const [dueAt, setDueAt] = useState(null);
  const [effectiveAt, setEffectiveAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [openDate, setOpenDate] = useState(null);
  const scrollRef = useRef(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const categoryOptions = useMemo(
    () => buildDocumentCategoryOptions(managedCategories),
    [managedCategories],
  );

  const resolvedCategory = resolveDocumentCategory(categorySelect, customCategoryInput);
  const liveErrors = useMemo(
    () => validateDocumentForm({ ...form, category: resolvedCategory }, { hasFile: Boolean(fileAsset) || isEdit }),
    [form, resolvedCategory, fileAsset, isEdit],
  );
  const liveDateErrors = useMemo(
    () => (isAgreement ? agreementDateErrors(dueAt, effectiveAt, expiresAt, t) : {}),
    [isAgreement, dueAt, effectiveAt, expiresAt, t],
  );
  const minimumDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  useEffect(() => {
    if (!isAgreement) return;
    clearError("dueAt");
    clearError("effectiveAt");
    clearError("expiresAt");
  }, [isAgreement, liveDateErrors, clearError]);

  const setF = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    touch(key);
    clearError(key);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAdminCommunityDocuments();
        const names = (list.categories ?? []).map((c) => c.name).filter(Boolean);
        if (cancelled) return;
        setManagedCategories(names);

        if (isEdit) {
          const found = await fetchCommunityDocument(documentId);
          if (!cancelled && found) {
            const agreement = found.kind === "agreement";
            setIsAgreement(agreement);
            setDueAt(agreementDateFromApi(found.due_at));
            setEffectiveAt(agreementDateFromApi(found.effective_at));
            setExpiresAt(agreementDateFromApi(found.expires_at));
            const split = splitDocumentCategory(found.category, names);
            setCategorySelect(split.selection);
            setCustomCategoryInput(split.customName);
            setForm({
              title: found.title,
              category: found.category,
              description: found.description ?? "",
              status: found.status,
            });
          }
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, documentId]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "image/*",
        ],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setFileAsset(result.assets[0]);
        touch("file");
        clearError("file");
      }
    } catch (err) {
      await showFailure(t("propertyMgmt.couldNotPickFile"), err);
    }
  };

  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const dateValue = openDate === "effective" ? effectiveAt : openDate === "expires" ? expiresAt : dueAt;
  const dateFieldKey = openDate === "effective" ? "effectiveAt" : openDate === "expires" ? "expiresAt" : "dueAt";
  const confirmDate = (next) => {
    touch(dateFieldKey);
    if (openDate === "effective") setEffectiveAt(next);
    else if (openDate === "expires") setExpiresAt(next);
    else setDueAt(next);
    setOpenDate(null);
  };
  const closeDate = () => {
    if (openDate) touch(dateFieldKey);
    setOpenDate(null);
  };
  const handleSubmit = useCallback(() => {
    const fieldErrors = isAgreement ? { ...liveErrors, ...liveDateErrors } : liveErrors;
    if (!validateOnSubmit(fieldErrors)) return;

    run(async () => {
      const payload = {
        ...form,
        category: resolvedCategory,
        ...(isAgreement ? {
          due_at: toApiDate(dueAt) ?? "",
          effective_at: toApiDate(effectiveAt) ?? "",
          expires_at: toApiDate(expiresAt) ?? "",
        } : {}),
      };
      if (isEdit) {
        await updateCommunityDocument(Number(documentId), payload, fileAsset);
      } else {
        await createCommunityDocument(payload, fileAsset);
      }
      router.back();
    }).catch(async (err) => {
      await showFailure(isEdit ? t("propertyMgmt.couldNotUpdateDoc") : t("propertyMgmt.couldNotUploadDoc"), err);
    });
  }, [isAgreement, liveErrors, liveDateErrors, validateOnSubmit, form, resolvedCategory, dueAt, effectiveAt, expiresAt, fileAsset, isEdit, documentId, run, router, showFailure, t]);

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? t("propertyMgmt.editDocument") : t("propertyMgmt.addDocument")} />
        <View style={styles.centered}><ActivityIndicator size="large" color="#1B4F8A" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={isAgreement ? t("propertyMgmt.editAgreement") : isEdit ? t("propertyMgmt.editDocument") : t("propertyMgmt.addDocument")} />

      <KeyboardScroll ref={scrollRef} footerHeight={sw(76)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.docTitleLabel")}</Text>
          <LocaleTextInput style={[styles.input, showError("title", liveErrors) && styles.inputError]} placeholder={t("propertyMgmt.docTitlePlaceholder")} placeholderTextColor="#9CA3AF" value={form.title} onChangeText={(v) => setF("title", v)} maxLength={LIMITS.documentTitle} />
          {showError("title", liveErrors) ? <Text style={styles.errorText}>{showError("title", liveErrors)}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
          <DocumentCategoryPicker
            selection={categorySelect}
            customValue={customCategoryInput}
            options={categoryOptions}
            error={showError("category", liveErrors)}
            placeholder={t("propertyMgmt.selectCategory")}
            customPlaceholder={t("propertyMgmt.enterCustomCategory")}
            maxLength={LIMITS.documentCategory}
            onSelect={(cat) => {
              setCategorySelect(cat);
              touch("category");
              clearError("category");
              if (cat !== DOCUMENT_OTHER_CATEGORY) {
                setCustomCategoryInput("");
                setF("category", cat);
              } else {
                setF("category", "");
              }
            }}
            onCustomChange={(value) => {
              setCustomCategoryInput(value);
              touch("category");
              clearError("category");
            }}
          />
          {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.docDescriptionLabel")}</Text>
          <LocaleTextInput style={[styles.input, styles.textArea]} placeholder={t("propertyMgmt.docDescPlaceholder")} placeholderTextColor="#9CA3AF" multiline value={form.description} onChangeText={(v) => setF("description", v)} textAlignVertical="top" />
        </View>

        {isAgreement ? (
          [
            ["due", "dueAt", t("propertyMgmt.dueDate"), dueAt],
            ["effective", "effectiveAt", t("propertyMgmt.agreementEffectiveDate"), effectiveAt],
            ["expires", "expiresAt", t("propertyMgmt.expirationDate"), expiresAt],
          ].map(([key, field, label, value]) => {
            const error = showError(field, liveDateErrors);
            return (
              <View
                key={key}
                style={styles.field}
                onLayout={(event) => {
                  if (openDate !== key) return;
                  scrollRef.current?.scrollTo?.({ y: Math.max(0, event.nativeEvent.layout.y - sw(8)), animated: true });
                }}
              >
                <Text style={styles.label}>{label}</Text>
                <Pressable style={[styles.input, error && styles.inputError]} onPress={() => { Keyboard.dismiss(); setOpenDate(key); }}>
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
          })
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>{isEdit ? t("propertyMgmt.replaceFile") : t("propertyMgmt.fileRequired")}</Text>
          <Pressable style={[styles.filePicker, showError("file", liveErrors) && styles.inputError]} onPress={pickFile}>
            <Feather name="upload" size={sf(18)} color="#1B4F8A" />
            <Text style={styles.filePickerText} numberOfLines={2}>
              {fileAsset?.name ?? (isEdit ? t("propertyMgmt.tapNewFile") : t("propertyMgmt.tapChooseFile"))}
            </Text>
          </Pressable>
          {showError("file", liveErrors) ? <Text style={styles.errorText}>{showError("file", liveErrors)}</Text> : null}
        </View>

        <View style={[styles.field, styles.toggleRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t("propertyMgmt.activeDocLabel")}</Text>
            <Text style={styles.hint}>{t("propertyMgmt.activeDocsHint")}</Text>
          </View>
          <Switch
            value={form.status === "active"}
            onValueChange={(v) => setF("status", v ? "active" : "inactive")}
            trackColor={{ false: "#E5E7EB", true: "rgba(20, 184, 166, 0.28)" }}
            thumbColor={form.status === "active" ? "#1B4F8A" : "#FFFFFF"}
          />
        </View>
      </KeyboardScroll>

      <View style={styles.footer}>
        <Pressable style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]} disabled={!canSubmit || submitting} onPress={handleSubmit}>
          {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <Text style={styles.submitBtnText}>{isEdit ? t("propertyMgmt.saveChanges") : t("propertyMgmt.uploadDocument")}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: sw(18), paddingTop: sw(16), paddingBottom: hp(2) },
  field: { marginBottom: sw(20) },
  label: { fontFamily: Fonts.bold, fontSize: sf(13), fontWeight: "700", color: "#374151", marginBottom: sw(8) },
  hint: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#9CA3AF", marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: sw(10),
    paddingHorizontal: sw(14), paddingVertical: sw(11),
    fontFamily: Fonts.regular, fontSize: sf(13), color: "#101828", backgroundColor: "#FFFFFF",
  },
  textArea: { minHeight: hp(10), textAlignVertical: "top" },
  chipRow: { gap: sw(8), paddingBottom: sw(2) },
  chip: {
    paddingHorizontal: sw(12), paddingVertical: sw(7), borderRadius: sw(999),
    borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FFFFFF",
  },
  chipActive: { borderColor: "#1B4F8A", backgroundColor: "#D1FAF5" },
  chipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#374151" },
  chipTextActive: { color: "#1B4F8A", fontFamily: Fonts.bold, fontWeight: "700" },
  filePicker: {
    flexDirection: "row", alignItems: "center", gap: sw(12),
    borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", borderRadius: sw(12),
    padding: sw(16), backgroundColor: "#F8FAFC",
  },
  filePickerText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: "#4A5565" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: sw(12) },
  footer: {
    paddingHorizontal: sw(18), paddingBottom: hp(3), paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6", backgroundColor: "#FFFFFF",
  },
  submitBtn: {
    backgroundColor: "#1B4F8A", borderRadius: sw(14), paddingVertical: sw(15),
    alignItems: "center", justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF", fontWeight: "700" },
  combo: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
  },
  comboInput: { flex: 1, paddingHorizontal: sw(14), paddingVertical: sw(11), fontFamily: Fonts.regular, fontSize: sf(13), color: "#101828" },
  comboButton: { paddingHorizontal: sw(12), alignSelf: "stretch", justifyContent: "center" },
  menu: {
    marginTop: sw(6),
    maxHeight: sw(180),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
  },
  menuItem: { paddingHorizontal: sw(14), paddingVertical: sw(10), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF2F6" },
  menuText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#101828" },
  dateValue: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#101828" },
  datePlaceholder: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#9CA3AF" },
  inputError: { borderColor: "#DC2626" },
  errorText: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), color: "#DC2626" },
});
