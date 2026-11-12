import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTranslation } from "react-i18next";
import ListingFormFields, { listingFormError } from "./listing-form-fields";
import { NEW_CATEGORY } from "./category-picker";
import { HomeTheme as T } from "../../constants/home-theme";
import { Fonts } from "../../constants/font";
import { DEFAULT_PHONE_COUNTRY } from "../../constants/phone-countries";
import { createEssentialEntry, fetchEssentials, submitPlaceSuggestion } from "../../services/community-directory-api";
import { toE164 } from "../../utils/phone";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { sf, sw } from "../../utils/responsive";

export default function SuggestPlaceSheet({
  visible,
  mode = "suggest",
  creating = false,
  place,
  onClose,
  onSubmitted,
  defaultCategory = "",
}) {
  const { t } = useTranslation();
  const { showSuccess } = useAppDialog();
  const reporting = mode === "report";
  const [name, setName] = useState(place?.name || "");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [address, setAddress] = useState({ address: place?.address || "", latitude: null, longitude: null });
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || reporting) return;
    let active = true;
    fetchEssentials({ includePlaces: false })
      .then((data) => { if (active) setCategories(data.categories || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [visible, reporting]);

  useEffect(() => {
    if (!visible || reporting || !defaultCategory) return;
    setCategory(defaultCategory);
  }, [visible, defaultCategory, reporting]);

  function resetForm() {
    setName(reporting ? place?.name || "" : "");
    setCategory("");
    setCustomCategory("");
    setAddress({
      address: reporting ? place?.address || "" : "",
      latitude: null,
      longitude: null,
    });
    setPhoneDigits("");
    setPhoneCountry(DEFAULT_PHONE_COUNTRY);
    setDescription("");
    setNote("");
    setError("");
  }

  async function submit() {
    setError("");
    if (reporting && !note.trim()) {
      setError(t("topBar.reportNoteRequired"));
      return;
    }
    const chosen = reporting ? "" : (category === NEW_CATEGORY ? customCategory.trim() : category);
    if (!reporting) {
      const message = listingFormError({
        title: name,
        category,
        customCategory,
        phoneDigits,
        phoneCountry,
        address,
      }, t);
      if (message) {
        setError(message);
        return;
      }
    }
    setBusy(true);
    const phone = phoneDigits ? toE164(phoneDigits, phoneCountry) : undefined;
    const descriptionText = description.trim() || undefined;
    try {
      if (creating && !reporting) {
        await createEssentialEntry({
          section: chosen,
          title: name.trim(),
          phone,
          address: address.address.trim() || undefined,
          latitude: address.latitude,
          longitude: address.longitude,
          description: descriptionText,
          body: descriptionText,
          verified: true,
        });
      } else {
        await submitPlaceSuggestion({
          kind: reporting ? "report" : "suggest",
          place_id: reporting ? place?.id : undefined,
          name: name.trim() || undefined,
          essential_section: !reporting ? chosen : undefined,
          publish_nearby: false,
          publish_essentials: !reporting,
          address: address.address.trim() || undefined,
          latitude: address.latitude,
          longitude: address.longitude,
          phone,
          description: descriptionText,
          note: reporting ? note.trim() || undefined : undefined,
        });
      }
      resetForm();
      onSubmitted?.();
      onClose?.();
      setBusy(false);
      await new Promise((resolve) => setTimeout(resolve, 320));
      await showSuccess(
        reporting
          ? t("topBar.reportSentTitle")
          : creating
            ? t("topBar.placeCreatedTitle")
            : t("topBar.suggestionSentTitle"),
        reporting
          ? t("topBar.reportSentMessage")
          : creating
            ? t("topBar.placeCreatedMessage")
            : t("topBar.suggestionSentMessage"),
      );
      return;
    } catch (err) {
      setError(err?.message || t("topBar.nearbyLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {reporting ? t("topBar.reportUpdate") : creating ? t("topBar.createPlace") : t("topBar.suggestPlace")}
          </Text>
          <Text style={styles.sub}>
            {reporting ? t("topBar.reportUpdateSub") : creating ? t("topBar.createPlaceSub") : t("topBar.suggestPlaceSub")}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.form}
            contentContainerStyle={styles.formContent}
          >
            {!reporting ? (
              <ListingFormFields
                categories={categories}
                category={category}
                onCategory={setCategory}
                customCategory={customCategory}
                onCustomCategory={setCustomCategory}
                title={name}
                onTitle={setName}
                address={address}
                onAddress={setAddress}
                phoneDigits={phoneDigits}
                phoneCountry={phoneCountry}
                onPhoneDigits={setPhoneDigits}
                onPhoneCountry={setPhoneCountry}
                description={description}
                onDescription={setDescription}
              />
            ) : (
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t("topBar.reportNote")}
                placeholderTextColor="#94A3B8"
                multiline
                style={[styles.input, styles.note]}
              />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <Pressable style={[styles.submit, busy && styles.disabled]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitText}>
                {creating && !reporting ? t("topBar.createPlaceAction") : t("topBar.submitSuggestion")}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  sheet: {
    backgroundColor: T.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: sw(20),
    maxHeight: "90%",
    width: "100%",
  },
  title: { fontFamily: Fonts.bold, fontSize: sf(18), color: T.navy },
  sub: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(13), color: T.gray },
  form: { marginTop: sw(12), flexGrow: 0, flexShrink: 1 },
  formContent: { paddingBottom: 4 },
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
  note: { minHeight: sw(72), textAlignVertical: "top" },
  error: { color: "#B91C1C", fontFamily: Fonts.medium, fontSize: sf(12), marginBottom: 8 },
  submit: { marginTop: 4, backgroundColor: T.teal, borderRadius: 12, minHeight: 46, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#fff", fontFamily: Fonts.bold, fontSize: sf(15) },
  disabled: { opacity: 0.7 },
});
