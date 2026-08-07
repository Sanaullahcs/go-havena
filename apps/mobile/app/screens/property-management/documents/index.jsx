import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { Property, propertyStyles, twoColumnWidth } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import { fetchCommunityDocuments } from "../../../../services/documents-api";
import { getCurrentRole } from "../../../../constants/role-session";

const CATEGORY_META = {
  "Rules & Policies": { icon: "file-text", color: "#E7000B", bg: "#FEF2F2" },
  Forms:            { icon: "clipboard", color: "#14B8A6", bg: "#D1FAF5" },
  Guidelines:       { icon: "book-open", color: "#059669", bg: "#ECFDF5" },
  Safety:           { icon: "shield", color: "#DC2626", bg: "#FEF2F2" },
  "Maps & Diagrams": { icon: "map", color: "#0891B2", bg: "#ECFEFF" },
  Financial:        { icon: "dollar-sign", color: "#D97706", bg: "#FFFBEB" },
};

function getCategoryMeta(name) {
  return CATEGORY_META[name] ?? { icon: "folder", color: "#64748B", bg: "#F8FAFC" };
}

function formatDocDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(getLocaleForLang(i18n.language), { month: "short", day: "numeric", year: "numeric" });
}

function DocumentRow({ doc, onPress, showDownloads, actionIcon = "download" }) {
  const { i18n } = useTranslation();
  const meta = getCategoryMeta(doc.category);
  return (
    <Pressable style={styles.docCard} onPress={onPress}>
      <View style={styles.docMain}>
        <View style={[styles.docIconWrap, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={sf(18)} color={meta.color} />
        </View>
        <View style={styles.docBody}>
          <Text style={styles.docTitle} numberOfLines={2}>{doc.title}</Text>
<Text style={styles.docCategory} numberOfLines={1}>{doc.category}</Text>
          <View style={styles.docMeta}>
            <Text style={styles.docMetaText}>{doc.file_size_label}</Text>
            <Text style={styles.docMetaText}>•</Text>
            <Text style={styles.docMetaText}>{formatDocDate(doc.updated_at)}</Text>
            {showDownloads ? (
              <>
                <Text style={styles.docMetaText}>•</Text>
                <Feather name="download" size={sf(11)} color="#6A7282" />
                <Text style={styles.docMetaText}>{doc.download_count ?? 0}</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
      <Feather name={actionIcon} size={sf(18)} color="#9CA3AF" style={styles.actionIcon} />
    </Pressable>
  );
}

export default function Documents() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const tileWidth = useMemo(() => twoColumnWidth(screenWidth), [screenWidth]);
  const isAdmin = getCurrentRole() === "admin";

  const [documents, setDocuments] = useState([]);
  const [recent, setRecent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityDocuments();
      setDocuments(data.documents);
      setRecent(data.recent);
      setCategories(data.categories);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadDocs"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const filteredDocuments = useMemo(() => {
    let list = documents;
    if (selectedCategory !== "all") {
      list = list.filter((d) => d.category === selectedCategory);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [documents, selectedCategory, search]);

  const openDocument = (doc) => {
    router.push({
      pathname: PropertyManagementRoutes.DOCUMENT_DETAIL,
      params: { documentId: String(doc.id) },
    });
  };

  const openAddDocument = () => {
    router.push(PropertyManagementRoutes.DOCUMENT_FORM);
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentsTitle")} subtitle={t("common.loading")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  const subtitle = t("propertyMgmt.documentCount", { count: documents.length });

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.documentsTitle")}
        subtitle={subtitle}
        right={
          <View style={styles.headerActions}>
            <Pressable onPress={() => setShowSearch((v) => !v)} style={styles.iconBtn}>
              <Feather name="search" size={sf(18)} color="#4A5565" />
            </Pressable>
            {isAdmin ? (
              <Pressable onPress={openAddDocument} style={styles.addBtn}>
                <Feather name="plus" size={sf(16)} color="#0A2A43" />
                <Text style={styles.addBtnText}>{t("propertyMgmt.addBtn")}</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={pageStyles.scrollBottom}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A2A43" colors={["#0A2A43"]} />}
      >
        {showSearch && (
          <View style={propertyStyles.sectionBlock}>
            <View style={styles.searchWrap}>
              <Feather name="search" size={sf(16)} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("propertyMgmt.searchDocuments")}
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <Pressable onPress={() => setSearch("")}>
                  <Feather name="x" size={sf(16)} color="#9CA3AF" />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        {error && (
          <View style={[propertyStyles.sectionBlock, styles.errorBox]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()}><Text style={styles.retryText}>{t("propertyMgmt.retryBtn")}</Text></Pressable>
          </View>
        )}

        {categories.length > 0 && (
          <View style={propertyStyles.sectionBlock}>
            <View style={styles.categoriesCard}>
              <View style={styles.headingRow}>
                <Image source={require("../../../../assets/images/document-categories.svg")} style={styles.headingIcon} contentFit="contain" />
                <Text style={propertyStyles.sectionTitle}>{t("propertyMgmt.categoriesTitle")}</Text>
              </View>
              <View style={[propertyStyles.grid, styles.categoryGrid]}>
                {categories.map((cat) => {
                  const meta = getCategoryMeta(cat.name);
                  const isSelected = selectedCategory === cat.name;
                  return (
                    <Pressable
                      key={cat.name}
                      onPress={() => setSelectedCategory(isSelected ? "all" : cat.name)}
                      style={({ pressed }) => [
                        styles.categoryTile,
                        { width: tileWidth },
                        isSelected && styles.categoryTileActive,
                        pressed && { opacity: 0.92 },
                      ]}
                    >
                      <View style={[styles.categoryIcon, { backgroundColor: meta.bg }]}>
                        <Feather name={meta.icon} size={sf(16)} color={meta.color} />
                      </View>
                      <Text style={[styles.categoryTitle, isSelected && styles.categoryTitleActive]} numberOfLines={2}>
                        {cat.name}
                        <Text style={styles.categoryCount}> ({cat.count})</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {recent.length > 0 && selectedCategory === "all" && !search.trim() && (
          <View style={propertyStyles.sectionBlock}>
            <Text style={propertyStyles.sectionTitle}>{t("propertyMgmt.recentDocuments")}</Text>
            {recent.map((doc) => (
              <DocumentRow key={`recent-${doc.id}`} doc={doc} onPress={() => openDocument(doc)} actionIcon="download" />
            ))}
          </View>
        )}

        <View style={[propertyStyles.sectionBlock, styles.lastSection]}>
          <View style={styles.sectionHeader}>
            <Text style={propertyStyles.sectionTitle}>{t("propertyMgmt.allDocuments")}</Text>
            <Text style={styles.sectionSub}>
              {t("propertyMgmt.filteredCount", { filtered: filteredDocuments.length, total: documents.length })}
              {selectedCategory !== "all" ? ` · ${selectedCategory}` : ""}
            </Text>
          </View>

          {categories.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsScroll}>
              <Pressable
                onPress={() => setSelectedCategory("all")}
                style={[styles.filterChip, selectedCategory === "all" && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedCategory === "all" && styles.filterChipTextActive]}>{t("propertyMgmt.allFilter")}</Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.name}
                  onPress={() => setSelectedCategory(cat.name)}
                  style={[styles.filterChip, selectedCategory === cat.name && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedCategory === cat.name && styles.filterChipTextActive]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {documents.length === 0 && !error && (
            <View style={styles.empty}>
              <Feather name="folder" size={sf(32)} color="#D1D5DB" />
              <Text style={styles.emptyText}>{t("propertyMgmt.noDocuments")}</Text>
              {isAdmin && <Text style={styles.emptyHint}>{t("propertyMgmt.addFirstDocument")}</Text>}
            </View>
          )}

          {documents.length > 0 && filteredDocuments.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("propertyMgmt.noDocumentsMatch")}</Text>
              <Pressable onPress={() => { setSelectedCategory("all"); setSearch(""); }}>
                <Text style={styles.retryText}>{t("propertyMgmt.clearFilters")}</Text>
              </Pressable>
            </View>
          )}

          {filteredDocuments.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onPress={() => openDocument(doc)} showDownloads actionIcon="eye" />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  iconBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingVertical: sw(6),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  addBtnText: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#0A2A43", fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    backgroundColor: "#FFFFFF",
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(13), color: "#101828", padding: 0 },
  categoriesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: sw(14),
  },
  headingRow: { flexDirection: "row", alignItems: "center", gap: sw(8), marginBottom: sw(12) },
  headingIcon: { width: sw(20), height: sw(20) },
  categoryGrid: { marginTop: sw(2) },
  categoryTile: {
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    padding: sw(12),
    minHeight: sw(96),
    justifyContent: "space-between",
  },
  categoryTileActive: {
    borderColor: "#0A2A43",
    backgroundColor: "#D1FAF5",
  },
  categoryIcon: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#101828",
    fontWeight: "700",
    marginTop: sw(10),
  },
  categoryTitleActive: { color: "#0A2A43" },
  categoryCount: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#9CA3AF", fontWeight: "600" },
  sectionHeader: { marginBottom: sw(8) },
  sectionSub: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#9CA3AF", marginTop: 2 },
  filterChipsScroll: { gap: sw(8), paddingBottom: sw(12) },
  filterChip: {
    paddingVertical: sw(8),
    paddingHorizontal: sw(12),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    maxWidth: sw(180),
  },
  filterChipActive: { borderColor: "#0A2A43", backgroundColor: "#0A2A43" },
  filterChipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#4A5565", fontWeight: "600" },
  filterChipTextActive: { color: "#FFFFFF" },
  lastSection: { borderBottomWidth: 0 },
  docCard: {
    marginTop: sw(12),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: sw(14),
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(10),
    backgroundColor: "#FFFFFF",
  },
  docMain: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: sw(12), minWidth: 0 },
  docIconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docBody: { flex: 1, minWidth: 0, gap: 2 },
  docTitle: {
    fontFamily: Fonts.bold,
    fontSize: PropertyType.body,
    lineHeight: PropertyType.headingLine,
    color: "#101828",
    fontWeight: "700",
  },
  docCategory: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
    color: "#6A7282",
  },
  docMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sw(6), marginTop: 2 },
  docMetaText: {
    fontFamily: Fonts.medium,
    fontSize: PropertyType.caption,
    lineHeight: PropertyType.captionLine,
    color: "#6A7282",
  },
  actionIcon: { marginTop: sw(4), flexShrink: 0 },
  empty: { alignItems: "center", paddingVertical: sw(40), gap: sw(8) },
  emptyText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#9CA3AF", fontWeight: "700" },
  emptyHint: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#D1D5DB", textAlign: "center" },
  errorBox: { gap: sw(8) },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#E7000B" },
  retryText: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#0A2A43", fontWeight: "700" },
});
