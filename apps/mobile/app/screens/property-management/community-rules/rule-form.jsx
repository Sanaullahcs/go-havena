import React, { useCallback, useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch } from "react-native";
import { KeyboardScroll } from "../../../../components/ui/keyboard-form";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import {
  createCommunityRule,
  fetchCommunityRules,
  updateCommunityRule,
} from "../../../../services/community-rules-api";
import { validateCommunityRuleForm, hasFieldErrors, LIMITS } from "../../../../utils/form-validation";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../../hooks/use-touched-field-errors";

import {
  RULE_OTHER_CATEGORY,
  RULE_SEVERITIES,
  buildCategoryOptions,
  resolveRuleCategory,
  splitRuleCategory,
} from "../../../../constants/community-rule-categories";

const SEVERITIES = RULE_SEVERITIES.map((item) => ({
  key: item.key,
  label: item.labelKey,
  icon: item.icon,
  color: item.color,
  bg: item.bg,
}));

const DEFAULT_FORM = {
  title: "",
  category: "",
  description: "",
  severity: "standard",
  requires_acknowledgment: false,
  status: "active",
};

export default function RuleForm() {
  const router            = useRouter();
  const { t }             = useTranslation();
  const { ruleId }        = useLocalSearchParams();
  const isEdit            = Boolean(ruleId);
  const { submitting, run } = useSubmitLock();
  const { showFailure }   = useApiAction();

  const [form,        setForm]        = useState(DEFAULT_FORM);
  const [loading,     setLoading]     = useState(true);
  const [managedCategories, setManagedCategories] = useState([]);
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const categoryOptions = useMemo(
    () => buildCategoryOptions(managedCategories),
    [managedCategories],
  );

  const resolvedCategory = resolveRuleCategory(categorySelect, customCategoryInput);
  const liveErrors = useMemo(
    () => validateCommunityRuleForm({ ...form, category: resolvedCategory }),
    [form, resolvedCategory],
  );

  const setF = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    touch(key);
    clearError(key);
  };

  /* Load community categories (+ existing rule when editing) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCommunityRules();
        const names = (data.categories ?? []).map((c) => c.name).filter(Boolean);
        if (cancelled) return;
        setManagedCategories(names);

        if (isEdit) {
          const found = data.rules.find((r) => String(r.id) === String(ruleId));
          if (found) {
            const split = splitRuleCategory(found.category, names);
            setCategorySelect(split.selection);
            setCustomCategoryInput(split.customName);
            setForm({
              title:                   found.title,
              category:                found.category,
              description:             found.description,
              severity:                found.severity,
              requires_acknowledgment: found.requires_acknowledgment,
              status:                  found.status,
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
  }, [isEdit, ruleId]);

  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const handleSubmit = useCallback(() => {
    if (!validateOnSubmit(liveErrors)) return;

    run(async () => {
      const payload = { ...form, category: resolvedCategory };
      if (isEdit) {
        await updateCommunityRule(Number(ruleId), payload);
      } else {
        await createCommunityRule(payload);
      }
      router.back();
    }).catch(async (err) => {
      await showFailure(isEdit ? t("propertyMgmt.couldNotUpdateRule") : t("propertyMgmt.couldNotCreateRule"), err);
    });
  }, [liveErrors, validateOnSubmit, form, resolvedCategory, isEdit, ruleId, run, router, showFailure]);

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? t("propertyMgmt.editRule") : t("propertyMgmt.addRuleTitle")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={isEdit ? t("propertyMgmt.editRule") : t("propertyMgmt.addRuleTitle")} />

      <KeyboardScroll
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.ruleTitleLabel")}</Text>
          <LocaleTextInput
            style={[styles.input, showError("title", liveErrors) && styles.inputError]}
            placeholder={t("propertyMgmt.ruleTitlePlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={form.title}
            onChangeText={(v) => setF("title", v)}
            maxLength={LIMITS.ruleTitle}
          />
          {showError("title", liveErrors) ? <Text style={styles.errorText}>{showError("title", liveErrors)}</Text> : null}
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.categoryRequired")}</Text>
          {categoryOptions.length <= 1 ? (
            <Text style={[styles.hint, { marginBottom: sw(8) }]}>
              {t("propertyMgmt.noCategoriesHint")}
            </Text>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {categoryOptions.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.chip, categorySelect === cat && styles.chipActive]}
                onPress={() => {
                  setCategorySelect(cat);
                  touch("category");
                  clearError("category");
                  if (cat !== RULE_OTHER_CATEGORY) {
                    setCustomCategoryInput("");
                    setF("category", cat);
                  } else {
                    setF("category", "");
                  }
                }}
              >
                <Text style={[styles.chipText, categorySelect === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {categorySelect === RULE_OTHER_CATEGORY ? (
            <LocaleTextInput
              style={[styles.input, { marginTop: sw(8) }, showError("category", liveErrors) && styles.inputError]}
              placeholder={t("propertyMgmt.enterCustomCategory")}
              placeholderTextColor="#9CA3AF"
              value={customCategoryInput}
              onChangeText={(v) => {
                setCustomCategoryInput(v);
                touch("category");
                clearError("category");
              }}
              maxLength={LIMITS.ruleCategory}
            />
          ) : null}
          {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}
        </View>

        {/* Severity */}
        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.severityRequired")}</Text>
          <View style={styles.severityRow}>
            {SEVERITIES.map((sev) => (
              <Pressable
                key={sev.key}
                style={[
                  styles.severityBtn,
                  form.severity === sev.key && { backgroundColor: sev.bg, borderColor: sev.color },
                ]}
                onPress={() => setF("severity", sev.key)}
              >
                <Feather
                  name={sev.icon}
                  size={sf(13)}
                  color={form.severity === sev.key ? sev.color : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.severityBtnText,
                    form.severity === sev.key && { color: sev.color, fontFamily: Fonts.bold, fontWeight: "700" },
                  ]}
                >
                  {t(sev.label)}
                </Text>
              </Pressable>
            ))}
          </View>
          {showError("severity", liveErrors) ? <Text style={styles.errorText}>{showError("severity", liveErrors)}</Text> : null}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>{t("propertyMgmt.descriptionRequired")}</Text>
          <LocaleTextInput
            style={[styles.input, styles.textArea, showError("description", liveErrors) && styles.inputError]}
            placeholder={t("propertyMgmt.ruleDescPlaceholder")}
            placeholderTextColor="#9CA3AF"
            multiline
            value={form.description}
            onChangeText={(v) => setF("description", v)}
            textAlignVertical="top"
          />
          {showError("description", liveErrors) ? <Text style={styles.errorText}>{showError("description", liveErrors)}</Text> : null}
        </View>

        {/* Requires Acknowledgment */}
        <View style={[styles.field, styles.toggleRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t("propertyMgmt.requiresAck")}</Text>
            <Text style={styles.hint}>{t("propertyMgmt.requiresAckHint")}</Text>
          </View>
          <Switch
            value={form.requires_acknowledgment}
            onValueChange={(v) => setF("requires_acknowledgment", v)}
            trackColor={{ false: "#E5E7EB", true: "rgba(20, 184, 166, 0.28)" }}
            thumbColor={form.requires_acknowledgment ? "#1B4F8A" : "#FFFFFF"}
          />
        </View>

        {/* Active / Inactive */}
        <View style={[styles.field, styles.toggleRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t("propertyMgmt.activeLabel")}</Text>
            <Text style={styles.hint}>{t("propertyMgmt.activeRulesHint")}</Text>
          </View>
          <Switch
            value={form.status === "active"}
            onValueChange={(v) => setF("status", v ? "active" : "inactive")}
            trackColor={{ false: "#E5E7EB", true: "rgba(20, 184, 166, 0.28)" }}
            thumbColor={form.status === "active" ? "#1B4F8A" : "#FFFFFF"}
          />
        </View>

        <View style={{ height: hp(4) }} />
      </KeyboardScroll>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{isEdit ? t("propertyMgmt.saveChanges") : t("propertyMgmt.createRule")}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered:     { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:       { paddingHorizontal: sw(18), paddingTop: sw(16), paddingBottom: hp(2) },
  field:        { marginBottom: sw(20) },
  label: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    fontWeight: "700",
    color: "#374151",
    marginBottom: sw(8),
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#9CA3AF",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(11),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#101828",
    backgroundColor: "#FFFFFF",
  },
  textArea:     { minHeight: hp(12), textAlignVertical: "top" },
  chipRow:      { gap: sw(8), paddingBottom: sw(2) },
  chip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(7),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  chipActive:   { borderColor: "#1B4F8A", backgroundColor: "#D1FAF5" },
  chipText:     { fontFamily: Fonts.medium, fontSize: sf(12), color: "#374151" },
  chipTextActive: { color: "#1B4F8A", fontFamily: Fonts.bold, fontWeight: "700" },
  severityRow:  { flexDirection: "row", gap: sw(8) },
  severityBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(5),
    paddingVertical: sw(10),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  severityBtnText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#9CA3AF" },
  toggleRow:    { flexDirection: "row", alignItems: "center", gap: sw(12) },
  footer: {
    paddingHorizontal: sw(18),
    paddingBottom: hp(3),
    paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  submitBtn: {
    backgroundColor: "#1B4F8A",
    borderRadius: sw(14),
    paddingVertical: sw(15),
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
});
