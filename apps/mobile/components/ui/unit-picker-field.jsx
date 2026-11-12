import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import LocaleTextInput from "./locale-text-input";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";
import { showApiFailure } from "../../utils/auth-errors";

function normalizeUnitNumber(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dedupeUnitNumbers(units) {
  const seen = new Set();
  const out = [];
  for (const raw of units) {
    const trimmed = String(raw ?? "").trim();
    const key = normalizeUnitNumber(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export default function UnitPickerField({
  label,
  value = "",
  onChange,
  multiple = false,
  values,
  onChangeValues,
  maxSelected = 20,
  onBlur,
  error,
  disabled = false,
  locked = false,
  placeholder,
  required = false,
  loadUnits,
  createUnit,
  unitMax = 50,
  validateNewUnit,
  containerStyle,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const searchInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFocused, setCreateFocused] = useState(false);

  const refresh = useCallback(async () => {
    if (!loadUnits) return;
    setLoading(true);
    try {
      const rows = await loadUnits();
      setUnits(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setUnits([]);
      showApiFailure(err, { title: t("unitPicker.title") });
    } finally {
      setLoading(false);
    }
  }, [loadUnits, t]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowCreate(false);
      setNewUnit("");
      setCreateFocused(false);
      return undefined;
    }
    void refresh();
    return undefined;
  }, [open, refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...units].sort((a, b) =>
      String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true, sensitivity: "base" }),
    );
    if (!q) return list;
    return list.filter((unit) => String(unit.unit_number).toLowerCase().includes(q));
  }, [units, search]);

  const close = () => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setOpen(false);
    onBlur?.();
  };

  const selectedValues = multiple
    ? dedupeUnitNumbers(Array.isArray(values) ? values : [])
    : String(value ?? "").trim()
      ? [String(value).trim()]
      : [];

  const commitSelection = (next) => {
    const clean = dedupeUnitNumbers(next).slice(0, maxSelected);
    if (multiple) onChangeValues?.(clean);
    else onChange?.(clean[0] ?? "");
  };

  const selectUnit = (unitNumber) => {
    if (!multiple) {
      onChange?.(unitNumber);
      close();
      return;
    }
    const key = normalizeUnitNumber(unitNumber);
    const already = selectedValues.some((row) => normalizeUnitNumber(row) === key);
    if (already) {
      commitSelection(selectedValues.filter((row) => normalizeUnitNumber(row) !== key));
      return;
    }
    if (selectedValues.length >= maxSelected) {
      showApiFailure(new Error(t("validation.maxUnits", { max: maxSelected })), { title: t("unitPicker.title") });
      return;
    }
    commitSelection([...selectedValues, unitNumber]);
  };

  const handleCreate = async () => {
    if (!createUnit || creating) return;
    const trimmed = newUnit.trim();
    const validationMessage = validateNewUnit?.(trimmed);
    if (validationMessage) {
      showApiFailure(new Error(validationMessage), { title: t("unitPicker.addNew") });
      return;
    }
    if (!trimmed) return;

    setCreating(true);
    try {
      const created = await createUnit(trimmed.slice(0, unitMax));
      const row = created?.unit_number ? created : { unit_number: trimmed, id: created?.id ?? Date.now() };
      setUnits((prev) => {
        const normalized = normalizeUnitNumber(row.unit_number);
        return [...prev.filter((u) => normalizeUnitNumber(u.unit_number) !== normalized), row];
      });
      setShowCreate(false);
      setNewUnit("");
      selectUnit(row.unit_number);
    } catch (err) {
      showApiFailure(err, { title: t("unitPicker.addNew") });
    } finally {
      setCreating(false);
    }
  };

  const closedPlaceholder =
    placeholder || (multiple ? t("unitPicker.selectUnits") : t("unitPicker.selectUnit"));

  const closedSummary =
    selectedValues.length === 0
      ? closedPlaceholder
      : multiple
        ? selectedValues.length === 1
          ? selectedValues[0]
          : `${selectedValues.length} selected`
        : selectedValues[0];

  const openSheet = () => {
    if (disabled || locked) return;
    setOpen(true);
  };

  const sheetMaxHeight = Math.round(windowHeight * 0.88) - insets.top;

  return (
    <>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        disabled={disabled || locked}
        onPress={openSheet}
        style={[
          styles.trigger,
          open && !locked && styles.triggerOpen,
          error && !locked && styles.triggerError,
          disabled && !locked && styles.triggerDisabled,
          locked && styles.triggerLocked,
          containerStyle,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || locked, expanded: open }}
      >
        {selectedValues.length > 0 && multiple ? (
          <View style={styles.chips}>
            {selectedValues.map((unitNumber) => (
              <View key={normalizeUnitNumber(unitNumber)} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {unitNumber}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text
            style={[
              styles.triggerText,
              locked && styles.triggerTextLocked,
              selectedValues.length === 0 && styles.placeholder,
            ]}
            numberOfLines={1}
          >
            {closedSummary}
          </Text>
        )}
        {locked ? null : (
          <Feather name="chevron-down" size={sf(18)} color={T.gray} style={styles.triggerChevron} />
        )}
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={open && !locked} animationType="slide" transparent statusBarTranslucent onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t("common.cancel")} />
          <KeyboardAvoidingView behavior="padding" style={styles.keyboardWrap} keyboardVerticalOffset={0}>
            <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, sw(12)) }]}>
              <View style={styles.sheetHandle} />

              <View style={[styles.fieldRow, styles.fieldRowOpen]}>
                <Feather name="search" size={sf(16)} color={T.gray} />
                <LocaleTextInput
                  ref={searchInputRef}
                  style={styles.fieldInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("unitPicker.searchPlaceholder")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  underlineColorAndroid="transparent"
                />
                <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel={t("common.close")}>
                  <Feather name="chevron-down" size={sf(20)} color={T.gray} />
                </TouchableOpacity>
              </View>

              {multiple ? <Text style={styles.multiHint}>{t("unitPicker.selectUnits")}</Text> : null}

              {createUnit ? (
                <View style={styles.createBlock}>
                  {showCreate ? (
                    <View style={styles.createRow}>
                      <LocaleTextInput
                        style={[styles.createInput, createFocused && styles.createInputFocused]}
                        value={newUnit}
                        onChangeText={setNewUnit}
                        placeholder={t("unitPicker.createPlaceholder")}
                        maxLength={unitMax}
                        autoCapitalize="characters"
                        underlineColorAndroid="transparent"
                        onFocus={() => setCreateFocused(true)}
                        onBlur={() => setCreateFocused(false)}
                      />
                      <TouchableOpacity
                        style={[styles.createBtn, (creating || !newUnit.trim()) && styles.createBtnDisabled]}
                        disabled={creating || !newUnit.trim()}
                        onPress={() => void handleCreate()}
                      >
                        {creating ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.createBtnText}>{t("unitPicker.createButton")}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addRow}
                      onPress={() => {
                        setShowCreate(true);
                      }}
                    >
                      <View style={styles.addIcon}>
                        <Feather name="plus" size={sf(16)} color={T.navy} />
                      </View>
                      <Text style={styles.addLabel}>{t("unitPicker.addNew")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              <View style={styles.listPanel}>
                {units.length > 0 ? (
                  <View style={styles.headerRow}>
                    <Text style={styles.headerCol}>{t("unitPicker.columnUnit")}</Text>
                    <Text style={[styles.headerCol, styles.headerColRight]}>{t("unitPicker.columnResidents")}</Text>
                  </View>
                ) : null}

                {loading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator color={T.teal} />
                  </View>
                ) : (
                  <ScrollView
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {filtered.length === 0 ? (
                      <Text style={styles.empty}>
                        {search.trim() ? t("unitPicker.noSearch") : t("unitPicker.empty")}
                      </Text>
                    ) : (
                      filtered.map((unit) => {
                        const active = selectedValues.some(
                          (row) => normalizeUnitNumber(row) === normalizeUnitNumber(unit.unit_number),
                        );
                        const count = unit.resident_count ?? 0;
                        return (
                          <TouchableOpacity
                            key={String(unit.id ?? unit.unit_number)}
                            style={[styles.row, active && styles.rowActive]}
                            onPress={() => selectUnit(unit.unit_number)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.rowUnit, active && styles.rowUnitActive]} numberOfLines={1}>
                              {unit.unit_number}
                            </Text>
                            <View style={styles.rowRight}>
                              <Text style={styles.rowCount}>{count}</Text>
                              {active ? <Feather name="check" size={sf(16)} color={T.teal} /> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>

              <TouchableOpacity style={multiple ? styles.doneBtn : styles.closeBtn} onPress={close}>
                <Text style={multiple ? styles.doneBtnText : styles.closeBtnText}>
                  {multiple ? t("common.done") : t("common.cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
    marginBottom: sw(6),
  },
  requiredMark: {
    color: "#DC2626",
  },
  chips: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(8),
    marginRight: sw(8),
  },
  chip: {
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: 999,
    backgroundColor: "#F0FDFA",
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: "#0F766E",
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: sw(52),
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    backgroundColor: "#fff",
    paddingHorizontal: sw(16),
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  triggerOpen: {
    borderColor: T.teal,
  },
  triggerChevron: {
    marginLeft: sw(4),
  },
  triggerError: {
    borderColor: "#F87171",
  },
  triggerDisabled: {
    opacity: 0.6,
    backgroundColor: "#F8FAFC",
  },
  triggerLocked: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  triggerTextLocked: {
    color: "#6B7280",
  },
  triggerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
    marginRight: sw(8),
    textAlignVertical: "center",
    includeFontPadding: false,
    ...(Platform.OS === "android" ? { paddingTop: 0, paddingBottom: 0 } : null),
  },
  placeholder: {
    color: "rgba(10, 10, 10, 0.45)",
  },
  errorText: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  keyboardWrap: {
    width: "100%",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingTop: sw(8),
    paddingHorizontal: sw(16),
  },
  sheetHandle: {
    alignSelf: "center",
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: sw(12),
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(48),
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    backgroundColor: "#fff",
  },
  fieldRowOpen: {
    borderColor: T.teal,
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
    paddingVertical: Platform.OS === "ios" ? sw(10) : sw(8),
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  multiHint: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: sw(8),
    paddingHorizontal: sw(4),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
    borderRadius: sw(8),
    marginTop: sw(10),
  },
  headerCol: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#64748B",
  },
  headerColRight: {
    textAlign: "right",
    flex: 0,
    minWidth: sw(72),
  },
  createBlock: {
    marginTop: sw(10),
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(6),
    paddingHorizontal: sw(4),
  },
  addIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(8),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  addLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
  },
  createRow: {
    flexDirection: "row",
    gap: sw(8),
    alignItems: "center",
  },
  createInput: {
    flex: 1,
    minHeight: sw(44),
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(10),
    paddingHorizontal: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  createInputFocused: {
    borderColor: T.teal,
  },
  createBtn: {
    minHeight: sw(44),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#fff",
  },
  listPanel: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: sw(160),
    maxHeight: sw(320),
    marginTop: sw(8),
  },
  list: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: sw(4),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sw(12),
    paddingHorizontal: sw(4),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowActive: {
    backgroundColor: "#F0FDFA",
  },
  rowUnit: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: T.navy,
    marginRight: sw(8),
  },
  rowUnitActive: {
    color: "#0F766E",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minWidth: sw(56),
    justifyContent: "flex-end",
  },
  rowCount: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    paddingVertical: sw(24),
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
  },
  centered: {
    flex: 1,
    paddingVertical: sw(32),
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    marginTop: sw(12),
    paddingVertical: sw(14),
    alignItems: "center",
    borderRadius: sw(12),
    backgroundColor: "#F1F5F9",
  },
  closeBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
  },
  doneBtn: {
    marginTop: sw(12),
    paddingVertical: sw(14),
    alignItems: "center",
    borderRadius: sw(12),
    backgroundColor: T.teal,
  },
  doneBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#fff",
  },
});
