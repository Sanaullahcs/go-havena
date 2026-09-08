import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import LocaleTextInput from "./locale-text-input";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { fetchCountries, fetchCountryStates } from "../../services/geography-api";
import { getApiErrorMessage } from "../../utils/auth-errors";

function matchesQuery(item, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.code]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function SearchableField({
  label,
  placeholder,
  searchPlaceholder,
  value,
  options,
  loading,
  disabled,
  disabledHint,
  emptyText,
  onSelect,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => options.filter((item) => matchesQuery(item, query)),
    [options, query],
  );

  const close = () => {
    setQuery("");
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.fieldButton, disabled && styles.fieldButtonDisabled, open && styles.fieldButtonOpen]}
        activeOpacity={disabled ? 1 : 0.85}
        disabled={disabled}
        onPress={() => setOpen((prev) => !prev)}
      >
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]} numberOfLines={1}>
          {value?.name || (disabled ? disabledHint : placeholder)}
        </Text>
        {value && !disabled ? (
          <Pressable
            hitSlop={8}
            onPress={() => onSelect(null)}
            accessibilityLabel={t("region.clearFilter")}
          >
            <Ionicons name="close-circle" size={18} color={T.gray} />
          </Pressable>
        ) : (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={T.gray} />
        )}
      </TouchableOpacity>

      {open && !disabled ? (
        <View style={styles.dropdown}>
          <View style={styles.dropdownSearch}>
            <Ionicons name="search-outline" size={16} color={T.gray} />
            <LocaleTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={T.gray}
              style={styles.dropdownInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={T.gray} />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.dropdownState}>
              <ActivityIndicator size="small" color={T.teal} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              style={styles.dropdownList}
              nestedScrollEnabled
              ListEmptyComponent={
                <Text style={styles.dropdownEmpty}>{emptyText}</Text>
              }
              renderItem={({ item }) => {
                const selected = value?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.option, selected && styles.optionSelected]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onSelect(item);
                      close();
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {item.name}
                    </Text>
                    {item.code ? <Text style={styles.optionMeta}>{item.code}</Text> : null}
                    {selected ? <Ionicons name="checkmark" size={16} color={T.teal} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function RegionFilterSheet({
  visible,
  country,
  state,
  onApply,
  onClose,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draftCountry, setDraftCountry] = useState(country);
  const [draftState, setDraftState] = useState(state);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setDraftCountry(country);
    setDraftState(state);
    setError(null);
  }, [visible, country, state]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;

    (async () => {
      setLoadingCountries(true);
      try {
        const list = await fetchCountries();
        if (!cancelled) setCountries(list);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoadingCountries(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !draftCountry?.id) {
      setStates([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoadingStates(true);
      try {
        const list = await fetchCountryStates(draftCountry.id);
        if (!cancelled) setStates(list);
      } catch (err) {
        if (!cancelled) {
          setStates([]);
          setError(getApiErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, draftCountry?.id]);

  const handleCountrySelect = (next) => {
    setDraftCountry(next);
    setDraftState(null);
    setError(null);
  };

  const handleClear = () => {
    setDraftCountry(null);
    setDraftState(null);
    onApply({ country: null, state: null });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("region.filterRegions")}</Text>
          <Text style={styles.subtitle}>{t("region.filterHint")}</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <SearchableField
            label={t("region.country")}
            placeholder={t("region.selectCountry")}
            searchPlaceholder={t("region.searchCountries")}
            value={draftCountry}
            options={countries}
            loading={loadingCountries}
            emptyText={t("region.noCountriesMatch")}
            onSelect={handleCountrySelect}
          />

          <SearchableField
            label={t("region.state")}
            placeholder={t("region.selectState")}
            searchPlaceholder={t("region.searchStates")}
            value={draftState}
            options={states}
            loading={loadingStates}
            disabled={!draftCountry}
            disabledHint={t("region.pickCountryFirst")}
            emptyText={t("region.noStatesMatch")}
            onSelect={setDraftState}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.85}>
              <Text style={styles.clearText}>{t("region.clearFilter")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => onApply({ country: draftCountry, state: draftState })}
              activeOpacity={0.88}
            >
              <Text style={styles.applyText}>{t("region.applyFilter")}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: T.white,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: T.border,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: T.navy,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  errorText: {
    marginBottom: 10,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#DC2626",
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 8,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.navy,
    fontWeight: "600",
  },
  fieldButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldButtonOpen: {
    borderColor: T.teal,
  },
  fieldButtonDisabled: {
    backgroundColor: T.canvas,
  },
  fieldValue: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.navy,
  },
  fieldPlaceholder: {
    color: T.gray,
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  dropdownSearch: {
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropdownInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.navy,
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownState: {
    paddingVertical: 20,
    alignItems: "center",
  },
  dropdownEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.gray,
    textAlign: "center",
  },
  option: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionSelected: {
    backgroundColor: T.mint,
  },
  optionText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: T.navy,
  },
  optionTextSelected: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  optionMeta: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: T.gray,
  },
  actions: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.navy,
    fontWeight: "600",
  },
  applyBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.white,
    fontWeight: "600",
  },
});

