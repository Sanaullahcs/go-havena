import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import LocaleTextInput from "./locale-text-input";
import SearchInput from "./search-input";
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
  const searchRef = useRef(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [keyboardCover, setKeyboardCover] = useState(0);
  const [topChrome, setTopChrome] = useState(0);
  const [footerChrome, setFooterChrome] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
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
      setSearchEnabled(false);
      setKeyboardCover(0);
      setTopChrome(0);
      setFooterChrome(0);
      setListContentHeight(0);
      setSearch("");
      setShowCreate(false);
      setNewUnit("");
      setCreateFocused(false);
      return undefined;
    }
    void refresh();
    return undefined;
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;

    const show = KeyboardEvents.addListener("keyboardWillShow", (event) => {
      setKeyboardCover(Math.max(0, event?.height ?? 0));
    });
    const hide = KeyboardEvents.addListener("keyboardWillHide", () => setKeyboardCover(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!searchEnabled) return undefined;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchEnabled]);

  const dismissKeyboard = () => {
    setSearchEnabled(false);
    searchRef.current?.blur();
    Keyboard.dismiss();
  };

  const openSheet = () => {
    if (disabled || locked) return;
    setSearchEnabled(false);
    Keyboard.dismiss();
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...units].sort((a, b) =>
      String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true, sensitivity: "base" }),
    );
    if (!q) return list;
    return list.filter((unit) => String(unit.unit_number).toLowerCase().includes(q));
  }, [units, search]);

  const close = () => {
    dismissKeyboard();
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
      selectUnit(row.unit_number);
    } catch (err) {
      showApiFailure(err, { title: t("unitPicker.addNew") });
    } finally {
      setCreating(false);
    }
  };

  const hasUnits = units.length > 0;
  const sheetMax = Math.max(0, windowHeight - keyboardCover - insets.top - sw(8));
  const listMax = topChrome > 0 && footerChrome > 0
    ? Math.max(0, sheetMax - topChrome - footerChrome)
    : undefined;
  const listHeight = listContentHeight > 0 && listMax != null
    ? Math.min(listContentHeight, listMax)
    : undefined;

  return (
    <>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.trigger,
          open && !locked && styles.triggerOpen,
          error && !locked && styles.triggerError,
          disabled && !locked && styles.triggerDisabled,
          locked && styles.triggerLocked,
          containerStyle,
        ]}
      >
        <Pressable
          disabled={disabled || locked}
          onPress={openSheet}
          focusable={false}
          android_ripple={disabled || locked ? null : { color: "rgba(15, 23, 42, 0.06)" }}
          style={styles.triggerHit}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || locked, expanded: open }}
        >
          {selectedValues.length > 0 ? (
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
                styles.placeholder,
              ]}
              numberOfLines={1}
            >
              {locked ? "" : placeholder || (multiple ? t("unitPicker.selectUnits") : t("unitPicker.selectUnit"))}
            </Text>
          )}
          {locked ? null : <Feather name="chevron-down" size={sf(18)} color={T.gray} />}
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal
        visible={open && !locked}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={close}
        onShow={() => {
          setSearchEnabled(false);
          searchRef.current?.blur();
          Keyboard.dismiss();
        }}
      >
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable
            style={[
              styles.sheet,
              {
                maxHeight: sheetMax,
                marginBottom: keyboardCover,
                paddingBottom: keyboardCover > 0 ? sw(12) : Math.max(insets.bottom, 16),
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              onLayout={(event) => {
                const next = event.nativeEvent.layout.height;
                setTopChrome((current) => (Math.abs(current - next) < 1 ? current : next));
              }}
            >
              <Pressable onPress={dismissKeyboard}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{t("unitPicker.title")}</Text>
              </Pressable>

              {hasUnits ? (
                <Pressable style={styles.searchWrap} onPress={() => setSearchEnabled(true)}>
                  <View pointerEvents={searchEnabled ? "auto" : "none"}>
                    <SearchInput
                      inputRef={searchRef}
                      editable={searchEnabled}
                      autoFocus={false}
                      placeholder={t("unitPicker.searchPlaceholder")}
                      value={search}
                      onChangeText={setSearch}
                      onFocus={() => {
                        if (!searchEnabled) {
                          searchRef.current?.blur();
                          Keyboard.dismiss();
                        }
                      }}
                    />
                  </View>
                </Pressable>
              ) : null}

              {hasUnits ? (
                <Pressable style={styles.headerRow} onPress={dismissKeyboard}>
                  <Text style={styles.headerCol}>{t("unitPicker.columnUnit")}</Text>
                  <Text style={[styles.headerCol, styles.headerColRight]}>{t("unitPicker.columnResidents")}</Text>
                </Pressable>
              ) : null}

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
                        autoFocus={false}
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
                        dismissKeyboard();
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
            </View>

            {loading && !hasUnits ? (
              <View style={styles.centered}>
                <ActivityIndicator color={T.teal} />
              </View>
            ) : hasUnits ? (
              <ScrollView
                style={[styles.list, listHeight != null ? { height: listHeight } : null]}
                contentContainerStyle={styles.listContent}
                onContentSizeChange={(_, height) => {
                  setListContentHeight((current) => (Math.abs(current - height) < 1 ? current : height));
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                nestedScrollEnabled
              >
                {filtered.length === 0 ? (
                  <Text style={styles.empty}>{search.trim() ? t("unitPicker.noSearch") : t("unitPicker.empty")}</Text>
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
            ) : null}

            <View
              onLayout={(event) => {
                const next = event.nativeEvent.layout.height;
                setFooterChrome((current) => (Math.abs(current - next) < 1 ? current : next));
              }}
            >
              <TouchableOpacity style={multiple ? styles.doneBtn : styles.closeBtn} onPress={close}>
                <Text style={multiple ? styles.doneBtnText : styles.closeBtnText}>
                  {multiple ? t("common.done") : t("common.cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = {
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
    alignContent: "center",
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
    minHeight: sw(48),
    justifyContent: "center",
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(12),
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  triggerOpen: {
    borderColor: T.teal,
  },
  triggerHit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sw(48),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
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
    color: T.navy,
    marginRight: sw(8),
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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
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
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: T.navy,
    marginBottom: sw(12),
  },
  searchWrap: {
    marginBottom: sw(10),
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
    marginBottom: sw(8),
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
    marginBottom: sw(8),
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(10),
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
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    flexGrow: 0,
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
    paddingVertical: sw(32),
    alignItems: "center",
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
};
