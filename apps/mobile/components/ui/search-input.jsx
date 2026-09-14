import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PageType } from "../../constants/page-styles";
import { sw, sf } from "../../utils/responsive";

export default function SearchInput({
  placeholder,
  value: valueProp,
  onChangeText,
  autoFocus = false,
  imeSync = true,
}) {
  const { t } = useTranslation();
  const [internal, setInternal] = useState("");
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : internal;
  const handleChange = (text) => {
    if (!isControlled) setInternal(text);
    onChangeText?.(text);
  };
  const clear = () => handleChange("");

  return (
    <View style={styles.searchContainer}>
      <Ionicons name="search-outline" size={sf(16)} color="#99A1AF" style={styles.icon} />
      <LocaleTextInput
        style={[styles.input]}
        placeholder={placeholder ?? t("common.search")}
        placeholderTextColor="rgba(10, 10, 10, 0.45)"
        value={value}
        onChangeText={handleChange}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        blurOnSubmit={false}
        imeSync={imeSync}
        clearButtonMode="never"
      />
      {value?.length > 0 ? (
        <Pressable onPress={clear} hitSlop={8} accessibilityLabel={t("common.clearSearch")} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={sf(18)} color="#99A1AF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    height: sw(42),
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  icon: { marginEnd: sw(8) },
  input: {
    flex: 1,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#101828",
    fontFamily: Fonts.regular,
    paddingVertical: 0,
  },
  clearBtn: {
    marginStart: sw(4),
    padding: sw(2),
  },
});
