import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";

export const NEW_CATEGORY = "__new__";

function capitalize(value) {
  return String(value || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function listingCategoryLabel(key, t, fallback = "") {
  if (key === NEW_CATEGORY) return t("topBar.newCategory");
  const essentialKey = `topBar.essential${capitalize(key)}`;
  const categoryKey = `topBar.category${capitalize(key)}`;
  const essential = t(essentialKey, { defaultValue: "" });
  if (essential && essential !== essentialKey) return essential;
  const category = t(categoryKey, { defaultValue: "" });
  if (category && category !== categoryKey) return category;
  if (fallback) return fallback;
  return String(key || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CategoryPicker({ categories, value, onChange, customName, onCustomName }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const custom = String(customName || "");
  const nameError = !custom.trim()
    ? t("topBar.categoryNameRequired")
    : custom.trim().length < 2
      ? t("topBar.titleTooShort")
      : "";
  const showNameError = (nameTouched || custom.length > 0) && Boolean(nameError);

  useEffect(() => {
    if (value !== NEW_CATEGORY) setNameTouched(false);
  }, [value]);
  const options = categories || [];
  const selected = options.find((item) => item.value === value);
  const label = !value
    ? ""
    : value === NEW_CATEGORY
      ? t("topBar.newCategory")
      : listingCategoryLabel(value, t, selected?.label);

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>{t("topBar.listingCategory")} <Text style={styles.required}>*</Text></Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !label && styles.placeholder]} numberOfLines={1}>{label || t("topBar.chooseCategory")}</Text>
        <Feather name="chevron-down" size={sf(16)} color={T.navy} />
      </Pressable>
      {value === NEW_CATEGORY ? (
        <View style={styles.nameBlock}>
          <Text style={styles.caption}>{t("topBar.newCategoryName")} <Text style={styles.required}>*</Text></Text>
          <TextInput
            value={customName}
            onChangeText={onCustomName}
            onBlur={() => setNameTouched(true)}
            placeholder={t("topBar.newCategoryPlaceholder")}
            placeholderTextColor="#94A3B8"
            style={[styles.input, showNameError && styles.inputError]}
          />
          {showNameError ? <Text style={styles.error}>{nameError}</Text> : null}
        </View>
      ) : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              <Text style={styles.title}>{t("topBar.listingCategory")}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} style={styles.close} accessibilityRole="button">
                <Feather name="x" size={sf(18)} color="#64748B" />
              </Pressable>
            </View>
            <Pressable
              style={[styles.newCategory, value === NEW_CATEGORY && styles.newCategoryOn]}
              onPress={() => {
                onChange?.(NEW_CATEGORY);
                setOpen(false);
              }}
              accessibilityRole="button"
            >
              <View style={styles.newIcon}>
                <Feather name="plus" size={sf(16)} color={T.deepTeal} />
              </View>
              <View style={styles.newCopy}>
                <Text style={styles.newTitle}>{t("topBar.newCategory")}</Text>
                <Text style={styles.newSub}>{t("topBar.newCategoryHint")}</Text>
              </View>
              {value === NEW_CATEGORY ? <Feather name="check" size={sf(16)} color={T.deepTeal} /> : null}
            </Pressable>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} contentContainerStyle={styles.listContent}>
              {options.map((item) => {
                const active = item.value === value;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.option, active && styles.optionOn]}
                    onPress={() => {
                      onChange?.(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextOn]}>
                      {listingCategoryLabel(item.value, t, item.label)}
                    </Text>
                    {active ? <Feather name="check" size={sf(16)} color={T.deepTeal} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  caption: { marginBottom: 6, fontFamily: Fonts.medium, fontSize: sf(13), color: "#475569" },
  required: { color: "#B91C1C" },
  placeholder: { color: "#94A3B8", fontFamily: Fonts.regular },
  field: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(14), color: T.navy },
  nameBlock: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#FCA5A5" },
  error: { marginTop: 4, fontFamily: Fonts.medium, fontSize: sf(12), color: "#B91C1C" },
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: sw(24),
    paddingHorizontal: sw(16),
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", marginBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontFamily: Fonts.bold, fontSize: sf(17), color: "#0F172A" },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  newCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.deepTeal,
    backgroundColor: "#F0FDFA",
  },
  newCategoryOn: { backgroundColor: "#CCFBF1" },
  newIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  newCopy: { flex: 1 },
  newTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F766E" },
  newSub: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  list: { flexGrow: 0 },
  listContent: { gap: 8, paddingBottom: 8 },
  option: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  optionOn: { backgroundColor: "#E6F7F4", borderColor: "#99F6E4" },
  optionText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(15), color: "#0F172A" },
  optionTextOn: { color: T.deepTeal, fontFamily: Fonts.semiBold },
});
