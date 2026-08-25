import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf } from "../../../../utils/responsive";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import {
  AGREEMENT_CATEGORIES,
  AGREEMENT_TEMPLATES,
  createAgreement,
} from "../../../../services/agreements-api";

const EMPTY = {
  title: "",
  category: "general",
  body: "",
  cover_message: "",
  audience: "all",
  signature_fee: "0",
  due_at: "",
  is_required: false,
};

export default function AgreementForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { submitting, run } = useSubmitLock();
  const { showFailure, showSuccess } = useApiAction();
  const [form, setForm] = useState(EMPTY);

  const feeCents = useMemo(() => Math.max(0, Math.round(Number(form.signature_fee || 0) * 100)), [form.signature_fee]);

  const applyTemplate = (tpl) => {
    setForm((prev) => ({ ...prev, title: tpl.title, category: tpl.category, body: tpl.body }));
  };

  const submit = (sendNow) => {
    if (form.title.trim().length < 3 || form.body.trim().length < 20) {
      showFailure(t("propertyMgmt.agreementFormInvalid"), new Error(t("propertyMgmt.agreementFormInvalid")));
      return;
    }
    run(async () => {
      const res = await createAgreement({
        title: form.title.trim(),
        category: form.category,
        body: form.body.trim(),
        cover_message: form.cover_message.trim() || null,
        audience: "all",
        user_ids: [],
        signature_fee_cents: feeCents,
        due_at: form.due_at,
        is_required: form.is_required,
        send: sendNow,
      });
      await showSuccess(
        sendNow ? t("propertyMgmt.agreementSent") : t("propertyMgmt.draftSaved"),
        res.message,
      );
      router.back();
    });
  };

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("propertyMgmt.newAgreement")} subtitle={t("propertyMgmt.composeAgreement")} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pageStyles.scrollBottom}>
        <View style={propertyStyles.sectionBlock}>
          <Text style={styles.section}>{t("propertyMgmt.templatesLabel")}</Text>
          <View style={styles.chips}>
            {AGREEMENT_TEMPLATES.map((tpl) => (
              <Pressable key={tpl.key} onPress={() => applyTemplate(tpl)} style={styles.chip}>
                <Text style={styles.chipText}>{tpl.title}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t("propertyMgmt.agreementTitle")}</Text>
          <LocaleTextInput
            value={form.title}
            onChangeText={(title) => setForm((p) => ({ ...p, title }))}
            placeholder={t("propertyMgmt.agreementTitlePlaceholder")}
            style={styles.input}
          />

          <Text style={styles.label}>{t("propertyMgmt.docCategoryRequired")}</Text>
          <View style={styles.chips}>
            {AGREEMENT_CATEGORIES.map((c) => {
              const on = form.category === c.value;
              return (
                <Pressable key={c.value} onPress={() => setForm((p) => ({ ...p, category: c.value }))} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t("propertyMgmt.agreementBody")}</Text>
          <LocaleTextInput
            value={form.body}
            onChangeText={(body) => setForm((p) => ({ ...p, body }))}
            placeholder={t("propertyMgmt.agreementBodyPlaceholder")}
            style={[styles.input, styles.textarea]}
            multiline
          />

          <Text style={styles.label}>{t("propertyMgmt.signatureFee")}</Text>
          <LocaleTextInput
            value={form.signature_fee}
            onChangeText={(signature_fee) => setForm((p) => ({ ...p, signature_fee }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>{t("propertyMgmt.coverNote")}</Text>
          <LocaleTextInput
            value={form.cover_message}
            onChangeText={(cover_message) => setForm((p) => ({ ...p, cover_message }))}
            placeholder={t("propertyMgmt.coverNotePlaceholder")}
            style={[styles.input, styles.textarea]}
            multiline
          />

          <Pressable
            onPress={() => setForm((p) => ({ ...p, is_required: !p.is_required }))}
            style={[styles.chip, form.is_required && styles.chipOn, { alignSelf: "flex-start", marginBottom: sw(16) }]}
          >
            <Text style={[styles.chipText, form.is_required && styles.chipTextOn]}>{t("propertyMgmt.requiredToggle")}</Text>
          </Pressable>

          <Text style={styles.label}>{t("propertyMgmt.dueDate")}</Text>
          <LocaleTextInput
            value={form.due_at}
            onChangeText={(due_at) => setForm((p) => ({ ...p, due_at }))}
            placeholder="YYYY-MM-DD"
            style={styles.input}
          />

          <Pressable disabled={submitting} onPress={() => submit(true)} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{t("propertyMgmt.sendNow")}</Text>
          </Pressable>
          <Pressable disabled={submitting} onPress={() => submit(false)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>{t("propertyMgmt.saveDraft")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#64748B", marginBottom: sw(8), fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginBottom: sw(16) },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(999),
    paddingHorizontal: sw(12),
    paddingVertical: sw(7),
    backgroundColor: "#FFFFFF",
  },
  chipOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  chipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#334155" },
  chipTextOn: { color: "#FFFFFF" },
  label: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155", marginBottom: sw(6) },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#101828",
    marginBottom: sw(14),
  },
  textarea: { minHeight: sw(140), textAlignVertical: "top" },
  primaryBtn: {
    backgroundColor: "#1B4F8A",
    borderRadius: sw(12),
    paddingVertical: sw(13),
    alignItems: "center",
    marginTop: sw(8),
  },
  primaryBtnText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF", fontWeight: "700" },
  secondaryBtn: { alignItems: "center", paddingVertical: sw(12) },
  secondaryBtnText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#1B4F8A", fontWeight: "700" },
});
