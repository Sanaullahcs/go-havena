import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import SearchInput from "../../../components/ui/search-input";
import EssentialSuggestionRow from "../../../components/discover/essential-suggestion-row";
import { HomeTheme as T } from "../../../constants/home-theme";
import { Fonts } from "../../../constants/font";
import { fetchMyPlaceSuggestions } from "../../../services/community-directory-api";
import { setPlaceSuggestionDraft } from "../../../services/place-suggestion-draft";
import { useNow } from "../../../hooks/use-now";
import { sf, sw } from "../../../utils/responsive";

export default function DiscoverSuggestionsScreen() {
  const { t } = useTranslation();
  const now = useNow();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const rows = await fetchMyPlaceSuggestions();
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const hay = [item.name, item.address, item.note, item.description, item.category, item.essential_section]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, query]);

  function openItem(item) {
    setPlaceSuggestionDraft(item);
    router.push({ pathname: "/screens/discover-suggestion-detail", params: { id: String(item.id) } });
  }

  return (
    <View style={styles.screen}>
      <InternalScreenHeader
        title={t("topBar.yourSuggestions")}
        subtitle={t("topBar.yourSuggestionsScreenSub")}
        compact
        dense
      />
      <View style={styles.controls}>
        <SearchInput
          placeholder={t("topBar.suggestionsSearch")}
          value={query}
          onChangeText={setQuery}
          imeSync={false}
          containerStyle={styles.search}
          placeholderTextColor="#9CA3AF"
        />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={T.teal} onRefresh={() => load(true)} />
          }
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              {query.trim() ? t("common.noResults") : t("topBar.noSuggestions")}
            </Text>
          ) : (
            <View style={styles.listCard}>
              {filtered.map((item, index) => (
                <EssentialSuggestionRow
                  key={item.id}
                  item={item}
                  t={t}
                  now={now}
                  divider={index < filtered.length - 1}
                  onPress={() => openItem(item)}
                />
              ))}
            </View>
          )}
          <View style={styles.note}>
            <Feather name="info" size={sf(14)} color="#94A3B8" />
            <Text style={styles.noteText}>{t("topBar.suggestionsApprovalNote")}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  controls: { paddingHorizontal: sw(16), paddingTop: sw(4), paddingBottom: sw(10) },
  search: {
    height: sw(48),
    borderRadius: sw(16),
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    paddingHorizontal: sw(16),
  },
  scroll: { paddingHorizontal: sw(16), paddingBottom: sw(40) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listCard: {
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
    overflow: "hidden",
  },
  empty: {
    marginTop: sw(24),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: T.gray,
    textAlign: "center",
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: sw(16),
    paddingHorizontal: 2,
  },
  noteText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: "#94A3B8", lineHeight: sf(17) },
});
