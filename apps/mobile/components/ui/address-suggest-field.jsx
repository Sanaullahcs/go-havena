import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { suggestAddress } from "../../services/geo-api";
import { addressFromSuggestion } from "../../utils/address-suggestion";
import { sf } from "../../utils/responsive";
import LocaleTextInput from "./locale-text-input";

export default function AddressSuggestField({ value, onChange, placeholder }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value?.address || "");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const skipSuggest = useRef(true);
  const typingRef = useRef(false);
  const lastValueSig = useRef("");

  useEffect(() => {
    const next = value?.address ?? "";
    const sig = `${next}|${value?.latitude ?? ""}|${value?.longitude ?? ""}`;
    if (sig === lastValueSig.current) return;
    lastValueSig.current = sig;

    const coordsPicked = value?.latitude != null && value?.longitude != null;
    const externalReset = !next.trim() && value?.latitude == null && value?.longitude == null;
    if (coordsPicked || externalReset || !typingRef.current) {
      skipSuggest.current = true;
      typingRef.current = false;
      setQuery(next);
      setOptions([]);
    }
  }, [value?.address, value?.latitude, value?.longitude]);

  useEffect(() => {
    if (skipSuggest.current || !typingRef.current) {
      skipSuggest.current = false;
      return undefined;
    }
    const term = query.trim();
    if (term.length < 3) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      suggestAddress(term)
        .then((rows) => {
          if (!active) return;
          setOptions(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View style={styles.wrap}>
      <LocaleTextInput
        value={query}
        onChangeText={(text) => {
          typingRef.current = true;
          setQuery(text);
          onChange?.({ address: text, latitude: null, longitude: null });
        }}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
      {loading && options.length === 0 ? (
        <View style={styles.searching}>
          <ActivityIndicator size="small" color={T.teal} />
          <Text style={styles.searchingText}>{t("topBar.searchingAddresses")}</Text>
        </View>
      ) : null}
      {options.length > 0 ? (
        <View style={styles.list}>
          {options.map((row) => (
            <Pressable
              key={`${row.latitude}-${row.longitude}-${row.address}`}
              style={styles.option}
              onPress={() => {
                const selectedAddress = addressFromSuggestion(row);
                const next = {
                  address: selectedAddress,
                  latitude: row.latitude ?? null,
                  longitude: row.longitude ?? null,
                };
                lastValueSig.current = `${selectedAddress}|${next.latitude ?? ""}|${next.longitude ?? ""}`;
                skipSuggest.current = true;
                typingRef.current = false;
                setQuery(selectedAddress);
                setOptions([]);
                setLoading(false);
                onChange?.(next);
              }}
            >
              <Text style={styles.optionText} numberOfLines={2}>{row.label || row.address}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10, zIndex: 2 },
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
  searching: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  searchingText: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  list: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  option: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  optionText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#0F172A" },
});
