import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

export default function UnitPickerField({
  label,
  value = "",
  onChange,
  onBlur,
  error,
  disabled = false,
  placeholder,
  loadUnits,
  createUnit,
  unitMax = 50,
  validateNewUnit,
  containerStyle,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [creating, setCreating] = useState(false);

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
      return;
    }
    void refresh();
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
    setOpen(false);
    onBlur?.();
  };

  const selectUnit = (unitNumber) => {
    onChange?.(unitNumber);
    close();
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

  const displayValue = String(value ?? "").trim();

  return (
    <>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={() => !disabled && setOpen(true)}
        style={[
          styles.trigger,
          error && styles.triggerError,
          disabled && styles.triggerDisabled,
          containerStyle,
        ]}
      >
        <Text style={[styles.triggerText, !displayValue && styles.placeholder]} numberOfLines={1}>
          {displayValue || placeholder || t("unitPicker.selectUnit")}
        </Text>
        <Feather name="chevron-down" size={sf(18)} color={T.gray} />
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t("unitPicker.title")}</Text>

            <View style={styles.searchWrap}>
              <SearchInput
                placeholder={t("unitPicker.searchPlaceholder")}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <View style={styles.headerRow}>
              <Text style={styles.headerCol}>{t("unitPicker.columnUnit")}</Text>
              <Text style={[styles.headerCol, styles.headerColRight]}>{t("unitPicker.columnResidents")}</Text>
            </View>

            {createUnit ? (
              <View style={styles.createBlock}>
                {showCreate ? (
                  <View style={styles.createRow}>
                    <LocaleTextInput
                      style={styles.createInput}
                      value={newUnit}
                      onChangeText={setNewUnit}
                      placeholder={t("unitPicker.createPlaceholder")}
                      maxLength={unitMax}
                      autoCapitalize="characters"
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
                  <TouchableOpacity style={styles.addRow} onPress={() => setShowCreate(true)}>
                    <View style={styles.addIcon}>
                      <Feather name="plus" size={sf(16)} color={T.navy} />
                    </View>
                    <Text style={styles.addLabel}>{t("unitPicker.addNew")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={T.teal} />
              </View>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {filtered.length === 0 ? (
                  <Text style={styles.empty}>{search.trim() ? t("unitPicker.noSearch") : t("unitPicker.empty")}</Text>
                ) : (
                  filtered.map((unit) => {
                    const active = normalizeUnitNumber(unit.unit_number) === normalizeUnitNumber(displayValue);
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

            <TouchableOpacity style={styles.closeBtn} onPress={close}>
              <Text style={styles.closeBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
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
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sw(48),
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    backgroundColor: "#fff",
  },
  triggerError: {
    borderColor: "#F87171",
  },
  triggerDisabled: {
    opacity: 0.6,
    backgroundColor: "#F8FAFC",
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
    maxHeight: "88%",
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
    borderColor: "#CBD5E1",
    borderRadius: sw(10),
    paddingHorizontal: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
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
    maxHeight: sw(320),
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
};
