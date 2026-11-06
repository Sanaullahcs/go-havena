import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import AddressSuggestField from "../ui/address-suggest-field";
import { FormPhoneInput } from "../ui/phone-input";
import CategoryPicker, { NEW_CATEGORY } from "./category-picker";
import { getPhoneValidationError } from "../../utils/phone";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf } from "../../utils/responsive";

export function sectionTitle(key, t) {
  const label = String(key || "").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function listingFormError({ title, category, customCategory, phoneDigits, phoneCountry, address }, t) {
  if (!category) return t("topBar.categoryRequired");
  if (category === NEW_CATEGORY) {
    const custom = String(customCategory || "").trim();
    if (!custom) return t("topBar.categoryNameRequired");
    if (custom.length < 2) return t("topBar.titleTooShort");
  }
  const placeName = String(title || "").trim();
  if (!placeName) return t("topBar.suggestNameRequired");
  if (placeName.length < 2) return t("topBar.titleTooShort");
  if (!String(phoneDigits || "").trim()) return t("topBar.phoneRequired");
  const phoneError = getPhoneValidationError(phoneDigits, phoneCountry);
  if (phoneError) return phoneError;
  if (!String(address?.address || "").trim()) return t("topBar.addressRequired");
  if (address?.latitude == null || address?.longitude == null) return t("topBar.addressPickRequired");
  return "";
}

export default function ListingFormFields({
  categories,
  category,
  onCategory,
  customCategory,
  onCustomCategory,
  title,
  onTitle,
  address,
  onAddress,
  phoneDigits,
  phoneCountry,
  onPhoneDigits,
  onPhoneCountry,
  description,
  onDescription,
}) {
  const { t } = useTranslation();

  return (
    <View>
      <CategoryPicker
        categories={categories}
        value={category}
        onChange={onCategory}
        customName={customCategory}
        onCustomName={onCustomCategory}
      />
      <Text style={styles.caption}>{t("topBar.placeName")} <Text style={styles.required}>*</Text></Text>
      <TextInput
        value={title}
        onChangeText={onTitle}
        placeholder={t("topBar.placeName")}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
      <Text style={styles.caption}>{t("topBar.phone")} <Text style={styles.required}>*</Text></Text>
      <FormPhoneInput
        digits={phoneDigits}
        onChangeDigits={onPhoneDigits}
        country={phoneCountry}
        onCountryChange={onPhoneCountry}
        containerStyle={styles.phone}
      />
      <Text style={styles.caption}>{t("topBar.placeAddress")} <Text style={styles.required}>*</Text></Text>
      <AddressSuggestField
        value={address}
        onChange={onAddress}
        placeholder={t("topBar.placeAddress")}
      />
      <Text style={styles.hint}>{t("topBar.addressSuggestHint")}</Text>
      <Text style={styles.caption}>{t("topBar.listingDescription")}</Text>
      <TextInput
        value={description}
        onChangeText={(value) => onDescription(String(value).slice(0, 2000))}
        placeholder={t("topBar.listingDescription")}
        placeholderTextColor="#94A3B8"
        multiline
        maxLength={2000}
        style={[styles.input, styles.note]}
      />
      <Text style={[styles.count, String(description || "").length >= 2000 && styles.countLimit]}>
        {String(description || "").length}/2000
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { marginBottom: 6, fontFamily: Fonts.medium, fontSize: sf(13), color: "#475569" },
  required: { color: "#B91C1C" },
  hint: { marginTop: -4, marginBottom: 10, fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8" },
  phone: { marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
    backgroundColor: "#fff",
  },
  note: { minHeight: 72, textAlignVertical: "top", marginBottom: 4 },
  count: {
    marginBottom: 10,
    textAlign: "right",
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  countLimit: { color: "#B91C1C" },
});
