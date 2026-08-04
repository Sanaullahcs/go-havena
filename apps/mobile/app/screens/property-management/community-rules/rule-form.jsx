import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
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
  buildCategoryOptions,
  resolveRuleCategory,
  splitRuleCategory,
} from "../../../../constants/community-rule-categories";

const SEVERITIES = [
  { key: "important", label: "Important", icon: "alert-circle",   color: "#E7000B", bg: "#FEF2F2" },
  { key: "standard",  label: "Standard",  icon: "alert-triangle", color: "#E17100", bg: "#FFFBEB" },
  { key: "info",      label: "Info",      icon: "info",           color: "#4A5565", bg: "#F9FAFB" },
];

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
      await showFailure(isEdit ? "Could not update rule" : "Could not create rule", err);
    });
  }, [liveErrors, validateOnSubmit, form, resolvedCategory, isEdit, ruleId, run, router, showFailure]);

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? "Edit Rule" : "Add Rule"} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={isEdit ? "Edit Rule" : "Add Rule"} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Rule Title *</Text>
          <TextInput
            style={[styles.input, showError("title", liveErrors) && styles.inputError]}
            placeholder="e.g. Quiet Hours Policy"
            placeholderTextColor="#9CA3AF"
            value={form.title}
            onChangeText={(v) => setF("title", v)}
            maxLength={LIMITS.ruleTitle}
          />
          {showError("title", liveErrors) ? <Text style={styles.errorText}>{showError("title", liveErrors)}</Text> : null}
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>Category *</Text>
          {categoryOptions.length <= 1 ? (
            <Text style={[styles.hint, { marginBottom: sw(8) }]}>
              No categories yet — choose Other and type a name, or add categories from the dashboard.
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
            <TextInput
              style={[styles.input, { marginTop: sw(8) }, showError("category", liveErrors) && styles.inputError]}
              placeholder="Enter custom category name"
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
          <Text style={styles.label}>Severity *</Text>
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
                  {sev.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {showError("severity", liveErrors) ? <Text style={styles.errorText}>{showError("severity", liveErrors)}</Text> : null}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea, showError("description", liveErrors) && styles.inputError]}
            placeholder="Describe the rule clearly for residents…"
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
            <Text style={styles.label}>Requires Acknowledgment</Text>
            <Text style={styles.hint}>Residents must confirm they have read this rule.</Text>
          </View>
          <Switch
            value={form.requires_acknowledgment}
            onValueChange={(v) => setF("requires_acknowledgment", v)}
            trackColor={{ false: "#E5E7EB", true: "rgba(20, 184, 166, 0.28)" }}
            thumbColor={form.requires_acknowledgment ? "#0A2A43" : "#FFFFFF"}
          />
        </View>

        {/* Active / Inactive */}
        <View style={[styles.field, styles.toggleRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Active</Text>
            <Text style={styles.hint}>Active rules are visible to residents.</Text>
          </View>
          <Switch
            value={form.status === "active"}
            onValueChange={(v) => setF("status", v ? "active" : "inactive")}
            trackColor={{ false: "#E5E7EB", true: "rgba(20, 184, 166, 0.28)" }}
            thumbColor={form.status === "active" ? "#0A2A43" : "#FFFFFF"}
          />
        </View>

        <View style={{ height: hp(4) }} />
      </ScrollView>

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
            <Text style={styles.submitBtnText}>{isEdit ? "Save Changes" : "Create Rule"}</Text>
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
  chipActive:   { borderColor: "#0A2A43", backgroundColor: "#D1FAF5" },
  chipText:     { fontFamily: Fonts.medium, fontSize: sf(12), color: "#374151" },
  chipTextActive: { color: "#0A2A43", fontFamily: Fonts.bold, fontWeight: "700" },
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
    backgroundColor: "#0A2A43",
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
