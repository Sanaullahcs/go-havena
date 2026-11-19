import React, { useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

export default function SearchInput({
  placeholder,
  value: valueProp,
  onChangeText,
  autoFocus = false,
  imeSync = true,
  onFocus,
  inputRef,
  editable = true,
  containerStyle,
  placeholderTextColor = "rgba(10, 10, 10, 0.45)",
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
    <View style={[styles.searchContainer, containerStyle]}>
      <View style={styles.iconSlot} pointerEvents="none">
        <Ionicons name="search-outline" size={sf(17)} color="#99A1AF" />
      </View>
      <LocaleTextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder ?? t("common.search")}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onChangeText={handleChange}
        onFocus={onFocus}
        autoFocus={autoFocus}
        editable={editable}
        showSoftInputOnFocus={editable}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        blurOnSubmit={false}
        imeSync={imeSync}
        clearButtonMode="never"
        underlineColorAndroid="transparent"
      />
      {value?.length > 0 ? (
        <Pressable
          onPress={clear}
          hitSlop={8}
          accessibilityLabel={t("common.clearSearch")}
          style={styles.clearBtn}
        >
          <View style={styles.clearIconWrap}>
            <Ionicons name="close-circle" size={sf(18)} color="#99A1AF" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const SEARCH_FONT = sf(14);

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    minHeight: sw(44),
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  iconSlot: {
    justifyContent: "center",
    alignItems: "center",
    marginEnd: sw(8),
    height: sw(44),
  },
  input: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: sw(44),
    fontSize: SEARCH_FONT,
    lineHeight: Platform.OS === "android" ? SEARCH_FONT + 2 : SEARCH_FONT,
    color: "#101828",
    fontFamily: Fonts.regular,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
  },
  clearBtn: {
    marginStart: sw(4),
    alignSelf: "stretch",
    justifyContent: "center",
  },
  clearIconWrap: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: sw(44),
  },
});
