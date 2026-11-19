import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { getCurrentRole } from "../../constants/role-session";
import ListingFormFields, { listingFormError } from "../discover/listing-form-fields";
import { listingCategoryLabel, NEW_CATEGORY } from "../discover/category-picker";
import {
  createEssentialEntry,
  deleteEssentialEntry,
  fetchAdminEssentials,
  fetchEssentials,
  reviewPlaceSuggestion,
  updateEssentialEntry,
} from "../../services/community-directory-api";
import { DEFAULT_PHONE_COUNTRY } from "../../constants/phone-countries";
import { toE164 } from "../../utils/phone";
import { sf, sw } from "../../utils/responsive";

export default function EssentialServicesPanel() {
  const { t } = useTranslation();
  const isAdmin = getCurrentRole() === "admin";
  const [entries, setEntries] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState({ address: "", latitude: null, longitude: null });
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      if (isAdmin) {
        const data = await fetchAdminEssentials();
        setEntries(data.entries);
        setSuggestions(data.suggestions);
        setCategories(data.categories || []);
      } else {
        const data = await fetchEssentials();
        setEntries(data.sections.flatMap((item) => item.entries || []));
        setSuggestions(data.suggestions || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      setError(err?.message || t("topBar.nearbyLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function addEntry() {
    const message = listingFormError({
      title,
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
    const chosen = category === NEW_CATEGORY ? customCategory.trim() : category;
    setBusy(true);
    setError("");
    try {
      await createEssentialEntry({
        section: chosen,
        title: title.trim(),
        description: description.trim() || null,
        body: description.trim() || null,
        phone: phoneDigits ? toE164(phoneDigits, phoneCountry) : null,
        address: address.address.trim() || null,
        latitude: address.latitude,
        longitude: address.longitude,
        verified: true,
      });
      setTitle("");
      setCategory("");
      setDescription("");
      setPhoneDigits("");
      setCustomCategory("");
      setAddress({ address: "", latitude: null, longitude: null });
      await load();
    } catch (err) {
      setError(err?.message || t("topBar.nearbyLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function review(id, decision) {
    setBusy(true);
    try {
      await reviewPlaceSuggestion(id, decision);
      await load();
    } catch (err) {
      setError(err?.message || t("topBar.nearbyLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ActivityIndicator color={T.teal} style={{ marginTop: 24 }} />;

  return (
    <View style={styles.wrap}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isAdmin ? (
        <>
          <Text style={styles.heading}>{t("topBar.pendingSuggestions")}</Text>
          {suggestions.length === 0 ? <Text style={styles.meta}>{t("topBar.noSuggestions")}</Text> : null}
          {suggestions.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>{item.name || t("topBar.reportUpdate")}</Text>
              <Text style={styles.meta}>
                {[
                  listingCategoryLabel(item.essential_section || item.category, t),
                  item.note || item.description || item.address,
                ].filter(Boolean).join(" · ")}
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.approve} disabled={busy} onPress={() => review(item.id, "approve")}>
                  <Text style={styles.approveText}>{t("topBar.approve")}</Text>
                </Pressable>
                <Pressable style={styles.reject} disabled={busy} onPress={() => review(item.id, "reject")}>
                  <Text style={styles.rejectText}>{t("topBar.reject")}</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={styles.heading}>{t("services.essentialServicesAdd")}</Text>
          <ListingFormFields
            categories={categories}
            category={category}
            onCategory={setCategory}
            customCategory={customCategory}
            onCustomCategory={setCustomCategory}
            title={title}
            onTitle={setTitle}
            address={address}
            onAddress={setAddress}
            phoneDigits={phoneDigits}
            phoneCountry={phoneCountry}
            onPhoneDigits={setPhoneDigits}
            onPhoneCountry={setPhoneCountry}
            description={description}
            onDescription={setDescription}
          />
          <Pressable style={styles.approve} disabled={busy} onPress={addEntry}>
            <Text style={styles.approveText}>{t("services.essentialServicesAdd")}</Text>
          </Pressable>
        </>
      ) : null}
      <Text style={styles.heading}>{t("services.essentialServicesTab")}</Text>
      {entries.length === 0 ? <Text style={styles.meta}>{t("services.essentialServicesEmpty")}</Text> : null}
      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.title}>{entry.title}</Text>
          <Text style={styles.meta}>{listingCategoryLabel(entry.section, t)}{entry.phone ? ` · ${entry.phone}` : ""}</Text>
          {entry.description || entry.body ? <Text style={styles.body}>{entry.description || entry.body}</Text> : null}
          {entry.verified ? <Text style={styles.verified}>{t("topBar.verifiedByCommunity")}</Text> : null}
          {isAdmin ? (
            <View style={styles.actions}>
              <Pressable onPress={() => updateEssentialEntry(entry.id, { verified: !entry.verified }).then(load)}>
                <Text style={styles.link}>{entry.verified ? t("topBar.unverify") : t("topBar.verify")}</Text>
              </Pressable>
              <Pressable onPress={() => deleteEssentialEntry(entry.id).then(load)}>
                <Text style={styles.rejectText}>{t("topBar.remove")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {!isAdmin && suggestions.length > 0 ? (
        <>
          <Text style={styles.heading}>{t("topBar.yourSuggestions")}</Text>
          {suggestions.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>{item.name || t("topBar.reportUpdate")}</Text>
              <Text style={styles.meta}>{item.status}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: sw(16), paddingBottom: sw(32) },
  heading: { marginTop: sw(16), marginBottom: 8, fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 10 },
  title: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  meta: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), color: T.gray },
  body: { marginTop: 6, fontFamily: Fonts.regular, fontSize: sf(13), color: "#334155" },
  verified: { marginTop: 6, fontFamily: Fonts.medium, fontSize: sf(12), color: T.deepTeal },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  approve: { backgroundColor: T.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" },
  approveText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(13) },
  reject: { borderRadius: 10, borderWidth: 1, borderColor: "#FECACA", paddingHorizontal: 12, paddingVertical: 8 },
  rejectText: { color: "#B91C1C", fontFamily: Fonts.semiBold, fontSize: sf(13) },
  link: { color: T.navy, fontFamily: Fonts.semiBold, fontSize: sf(13) },
  sectionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: T.border, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff" },
  pillOn: { backgroundColor: T.navy, borderColor: T.navy },
  pillText: { fontFamily: Fonts.medium, fontSize: sf(12), color: T.navy },
  pillTextOn: { color: "#fff" },
  input: { borderWidth: 1, borderColor: T.border, borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontFamily: Fonts.regular, color: T.navy },
  note: { minHeight: 72, textAlignVertical: "top" },
  error: { color: "#B91C1C", fontFamily: Fonts.medium, marginTop: 8 },
  nearbyToggle: { marginBottom: 10 },
});
