import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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
  fetchAgreementOptions,
  publishAgreement,
} from "../../../../services/documents-api";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";

export default function AgreementForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showFailure } = useApiAction();
  const { submitting, run } = useSubmitLock();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Rules & Policies");
  const [dueAt, setDueAt] = useState(null);
  const [effectiveAt, setEffectiveAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [openDate, setOpenDate] = useState(null);
  const [file, setFile] = useState(null);
  const [scope, setScope] = useState("all");
  const [options, setOptions] = useState({ residents: [], units: [], resident_count: 0 });
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [notify, setNotify] = useState(true);
  const [draftId, setDraftId] = useState(null);

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
  const confirmDate = (next) => {
    if (openDate === "effective") setEffectiveAt(next);
    else if (openDate === "expires") setExpiresAt(next);
    else setDueAt(next);
    setOpenDate(null);
  };

  const recipientCount = scope === "all"
    ? options.resident_count
    : scope === "residents"
      ? selectedUsers.length
      : options.units.filter((unit) => selectedUnits.includes(unit.id)).reduce((sum, unit) => sum + unit.resident_count, 0);

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("propertyMgmt.createAgreement")} />
      <KeyboardScroll contentContainerStyle={styles.scroll}>
        {step === 1 ? (
          <>
            <Text style={styles.label}>{t("propertyMgmt.docTitleLabel")}</Text>
            <LocaleTextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
            <LocaleTextInput style={styles.input} value={category} onChangeText={setCategory} />
            <Text style={styles.label}>{t("propertyMgmt.docDescriptionLabel")}</Text>
            <LocaleTextInput style={[styles.input, styles.area]} value={description} onChangeText={setDescription} multiline />
            <Text style={styles.label}>{t("propertyMgmt.dueDate")}</Text>
            <Pressable style={styles.input} onPress={() => setOpenDate("due")}>
              <Text style={dueAt ? styles.dateValue : styles.datePlaceholder}>{dueAt ? formatDisplayDate(dueAt) : t("propertyMgmt.selectDate")}</Text>
            </Pressable>
            <Text style={styles.label}>{t("propertyMgmt.agreementEffectiveDate")}</Text>
            <Pressable style={styles.input} onPress={() => setOpenDate("effective")}>
              <Text style={effectiveAt ? styles.dateValue : styles.datePlaceholder}>{effectiveAt ? formatDisplayDate(effectiveAt) : t("propertyMgmt.selectDate")}</Text>
            </Pressable>
            <Text style={styles.label}>{t("propertyMgmt.expirationDate")}</Text>
            <Pressable style={styles.input} onPress={() => setOpenDate("expires")}>
              <Text style={expiresAt ? styles.dateValue : styles.datePlaceholder}>{expiresAt ? formatDisplayDate(expiresAt) : t("propertyMgmt.selectDate")}</Text>
            </Pressable>
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
        ) : (
          <View>
            <Text style={styles.choiceTitle}>{title}</Text>
            <Text style={styles.hint}>{file?.name}</Text>
            <Text style={styles.hint}>{scope} · {recipientCount}</Text>
            <Text style={styles.hint}>{dueAt ? formatDisplayDate(dueAt) : t("propertyMgmt.noDueDate")}</Text>
            {step === 3 ? (
              <>
                <Text style={styles.hint}>{effectiveAt ? formatDisplayDate(effectiveAt) : t("propertyMgmt.noEffectiveDate")}</Text>
                <Text style={styles.hint}>{expiresAt ? formatDisplayDate(expiresAt) : t("propertyMgmt.noExpirationDate")}</Text>
              </>
            ) : null}
          </View>
        )}
      </KeyboardScroll>
      <FormDatePickerSheet
        visible={openDate != null}
        value={dateValue}
        title={openDate === "effective" ? t("propertyMgmt.agreementEffectiveDate") : openDate === "expires" ? t("propertyMgmt.expirationDate") : t("propertyMgmt.dueDate")}
        onCancel={() => setOpenDate(null)}
        onConfirm={confirmDate}
      />
      <View style={styles.footer}>
        {step > 1 ? <Pressable style={styles.secondary} onPress={() => setStep((value) => value - 1)}><Text style={styles.secondaryText}>Back</Text></Pressable> : null}
        {step < 3 ? (
          <Pressable
            style={styles.primary}
            onPress={() => {
              if (step === 1 && (!title.trim() || !category.trim() || !file)) return;
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
