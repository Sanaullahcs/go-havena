import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { PropertyType } from "../../../../constants/property-management-type";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { HomeTheme as T } from "../../../../constants/home-theme";
import { sw, sf } from "../../../../utils/responsive";
import { amenityFlowRoutes } from "../../../../constants/property-management-routes";
import { fetchAdminAgreements, fetchCommunityDocuments } from "../../../../services/documents-api";
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

function fileKind(doc) {
  const ext = String(doc.file_name ?? "").split(".").pop()?.trim().toUpperCase();
  if (!ext || ext.length > 5 || ext === String(doc.file_name ?? "").toUpperCase()) return "";
  return ext;
}

function formatDocDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(getLocaleForLang(i18n.language), { month: "short", day: "numeric", year: "numeric" });
}

function agreementMatches(doc, filter) {
  if (filter === "pending") {
    return doc.display_status
      ? ["pending", "viewed", "overdue"].includes(doc.display_status)
      : (doc.stats?.pending ?? 0) > 0;
  }
  if (filter === "signed") {
    return doc.display_status
      ? doc.display_status === "signed"
      : (doc.stats?.signed ?? 0) > 0 && (doc.stats?.pending ?? 0) === 0;
  }
  if (filter === "expired") {
    return doc.display_status === "expired" || doc.publication_status === "archived";
  }
  return true;
}

function agreementTone(doc) {
  const personal = doc.display_status;
  const publication = doc.publication_status;
  if (personal === "signed" || (publication === "published" && (doc.stats?.pending ?? 0) === 0 && (doc.stats?.signed ?? 0) > 0)) {
    return { bg: "#F0FDFA", color: "#0F766E", bar: "#0F766E" };
  }
  if (personal === "overdue" || publication === "revoked") {
    return { bg: "#FEF2F2", color: "#B91C1C", bar: "#B91C1C" };
  }
  if (personal === "expired" || publication === "archived" || publication === "superseded") {
    return { bg: "#F1F5F9", color: "#64748B", bar: "#94A3B8" };
  }
  if ((doc.stats?.pending ?? 0) > 0 || personal === "pending" || personal === "viewed") {
    return { bg: "#FFF7ED", color: "#B45309", bar: "#1B4F8A" };
  }
  return { bg: "#E8F0F7", color: "#1B4F8A", bar: "#1B4F8A" };
}

function AgreementCard({ doc, onPress }) {
  const { t } = useTranslation();
  const meta = getCategoryMeta(doc.category);
  const tone = agreementTone(doc);
  const hasStats = doc.stats != null;
  const badgeTone = hasStats
    ? doc.publication_status === "published"
      ? { bg: "#E8F0F7", color: "#1B4F8A" }
      : doc.publication_status === "draft"
        ? { bg: "#F1F5F9", color: "#475569" }
        : doc.publication_status === "revoked"
          ? { bg: "#FEF2F2", color: "#B91C1C" }
          : { bg: "#F1F5F9", color: "#64748B" }
    : tone;
  const signed = Number(doc.stats?.signed ?? 0);
  const pending = Number(doc.stats?.pending ?? 0);
  const total = signed + pending;
  const progress = total > 0 ? Math.round((signed / total) * 100) : 0;
  const due = formatDocDate(doc.due_at);
  const updated = formatDocDate(doc.updated_at);
  const publication = doc.publication_status === "published"
    ? t("propertyMgmt.savedStatus")
    : doc.publication_status === "draft"
      ? t("propertyMgmt.draftStatus")
      : doc.publication_status === "revoked"
        ? t("propertyMgmt.statusRevoked")
        : doc.publication_status === "archived" || doc.publication_status === "superseded"
          ? t("propertyMgmt.statusExpired")
          : null;
  const personal = doc.display_status === "signed"
    ? t("propertyMgmt.statusSigned")
    : doc.display_status === "overdue"
      ? t("propertyMgmt.statusOverdue")
      : doc.display_status === "expired"
        ? t("propertyMgmt.statusExpired")
        : doc.display_status === "declined"
          ? t("propertyMgmt.statusDeclined")
          : doc.display_status === "viewed"
            ? t("propertyMgmt.viewedCount")
            : doc.display_status
              ? t("propertyMgmt.requiresSignature")
              : null;
  const badge = hasStats ? publication : personal;

  return (
    <Pressable style={styles.agreeCard} onPress={onPress}>
      <View style={[styles.agreeAccent, { backgroundColor: tone.bar }]} />
      <View style={styles.docMain}>
        <View style={[styles.docIconWrap, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={sf(18)} color={meta.color} />
        </View>
        <View style={styles.docBody}>
          <Text style={styles.docTitle} numberOfLines={2}>{doc.title}</Text>
          <Text style={styles.docCategory} numberOfLines={1}>
            {doc.category}{doc.unit_label ? ` · ${doc.unit_label}` : ""}
          </Text>
          <View style={styles.agreePills}>
            {badge ? (
              <View style={[styles.pill, { backgroundColor: badgeTone.bg }]}>
                <Text style={[styles.pillText, { color: badgeTone.color }]}>{badge}</Text>
              </View>
            ) : null}
            {hasStats ? (
              <>
                <View style={styles.metricPill}>
                  <Text style={[styles.metricValue, { color: "#0F766E" }]}>{signed}</Text>
                  <Text style={styles.metricLabel}>{t("propertyMgmt.statusSigned")}</Text>
                </View>
                <View style={[styles.metricPill, pending > 0 && styles.metricPillWait]}>
                  <Text style={[styles.metricValue, { color: pending > 0 ? "#B45309" : "#64748B" }]}>{pending}</Text>
                  <Text style={styles.metricLabel}>{t("propertyMgmt.pendingFilter")}</Text>
                </View>
              </>
            ) : null}
          </View>
          {hasStats && total > 0 ? (
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progress}%`, backgroundColor: tone.bar }]} />
            </View>
          ) : null}
          {due || updated ? (
            <View style={styles.docMeta}>
              {due ? (
                <>
                  <Feather name="calendar" size={sf(11)} color="#64748B" />
                  <Text style={styles.docMetaText}>{due}</Text>
                </>
              ) : null}
              {updated ? (
                <>
                  {due ? <Text style={styles.docMetaText}>•</Text> : null}
                  <Text style={styles.docMetaText}>{t("propertyMgmt.updatedDate", { date: updated })}</Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={sf(18)} color="#9CA3AF" style={styles.actionIcon} />
    </Pressable>
  );
}

function DocumentRow({ doc, onPress, showDownloads }) {
  const meta = getCategoryMeta(doc.category);
  const updated = formatDocDate(doc.updated_at);
  const kind = fileKind(doc);
  return (
    <Pressable style={styles.fileCard} onPress={onPress}>
      <View style={[styles.agreeAccent, { backgroundColor: meta.color }]} />
      <View style={[styles.docIconWrap, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={sf(18)} color={meta.color} />
      </View>
      <View style={styles.docBody}>
        <Text style={styles.docTitle} numberOfLines={2}>{doc.title}</Text>
        <View style={styles.agreePills}>
          {doc.category ? (
            <View style={[styles.pill, { backgroundColor: meta.bg }]}>
              <Text style={[styles.pillText, { color: meta.color }]} numberOfLines={1}>{doc.category}</Text>
            </View>
          ) : null}
          {kind ? (
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>{kind}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.docMeta}>
          {doc.file_size_label ? (
            <>
              <Feather name="file" size={sf(11)} color="#64748B" />
              <Text style={styles.docMetaText}>{doc.file_size_label}</Text>
            </>
          ) : null}
          {updated ? (
            <>
              <Feather name="clock" size={sf(11)} color="#64748B" />
              <Text style={styles.docMetaText}>{updated}</Text>
            </>
          ) : null}
          {showDownloads ? (
            <>
              <Feather name="download" size={sf(11)} color="#64748B" />
              <Text style={styles.docMetaText}>{doc.download_count ?? 0}</Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.chevronBtn}>
        <Feather name="chevron-right" size={sf(16)} color="#64748B" />
      </View>
    </Pressable>
  );
}

function RecentCard({ doc, onPress }) {
  const meta = getCategoryMeta(doc.category);
  const updated = formatDocDate(doc.updated_at);
  return (
    <Pressable style={styles.recentCard} onPress={onPress}>
      <View style={[styles.recentIcon, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={sf(16)} color={meta.color} />
      </View>
      <Text style={styles.recentTitle} numberOfLines={2}>{doc.title}</Text>
      <Text style={styles.recentMeta} numberOfLines={1}>{updated || doc.category}</Text>
    </Pressable>
  );
}

export default function Documents() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = getCurrentRole() === "admin";

  const [documents, setDocuments] = useState([]);
  const [agreementRows, setAgreementRows] = useState([]);
  const [recent, setRecent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [section, setSection] = useState("documents");
  const [agreementFilter, setAgreementFilter] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityDocuments();
      const plain = (data.documents ?? []).filter((item) => item.kind !== "agreement");
      const assigned = (data.documents ?? []).filter((item) => item.kind === "agreement");
      setDocuments(plain);
      setRecent((data.recent ?? []).filter((item) => item.kind !== "agreement"));
      setCategories(data.categories);
      let agreements = assigned;
      if (isAdmin) {
        try {
          agreements = await fetchAdminAgreements();
        } catch {
          agreements = assigned;
        }
      }
      setAgreementRows(agreements);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadDocs"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, [isAdmin, t]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const pendingAgreements = useMemo(
    () => agreementRows.filter((doc) => doc.display_status
      ? ["pending", "viewed", "overdue"].includes(doc.display_status)
      : (doc.stats?.pending ?? 0) > 0),
    [agreementRows],
  );

  const agreementCounts = useMemo(() => ({
    all: agreementRows.length,
    pending: agreementRows.filter((doc) => agreementMatches(doc, "pending")).length,
    signed: agreementRows.filter((doc) => agreementMatches(doc, "signed")).length,
  }), [agreementRows]);

  const filteredDocuments = useMemo(() => {
    let list = section === "agreements" ? agreementRows : documents;
    if (section === "agreements" && agreementFilter !== "all") {
      list = list.filter((doc) => agreementMatches(doc, agreementFilter));
    }
    if (section === "documents" && selectedCategory !== "all") {
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
  }, [documents, agreementRows, section, agreementFilter, selectedCategory, search]);

  const openDocument = (doc) => {
    router.push({
      pathname: amenityFlowRoutes(pathname).documentDetail,
      params: {
        documentId: String(doc.id),
        assignmentId: doc.assignment_id ? String(doc.assignment_id) : "",
      },
    });
  };

  const openAddDocument = () => {
    const routes = amenityFlowRoutes(pathname);
    router.push(section === "agreements" ? routes.agreementForm : routes.documentForm);
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentsTitle")} subtitle={t("common.loading")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
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
                <Feather name="plus" size={sf(16)} color="#1B4F8A" />
                <Text style={styles.addBtnText}>{t("propertyMgmt.addBtn")}</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={pageStyles.scrollBottom}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B4F8A" colors={["#1B4F8A"]} />}
      >
        {showSearch && (
          <View style={propertyStyles.sectionBlock}>
            <View style={styles.searchWrap}>
              <Feather name="search" size={sf(16)} color="#9CA3AF" />
              <LocaleTextInput
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

        <View style={styles.tabs}>
          <Pressable onPress={() => setSection("documents")} style={[styles.tab, section === "documents" && styles.tabOn]}>
            <Text style={[styles.tabText, section === "documents" && styles.tabTextOn]}>{t("propertyMgmt.allDocumentsTab")}</Text>
          </Pressable>
          <Pressable onPress={() => setSection("agreements")} style={[styles.tab, section === "agreements" && styles.tabOn]}>
            <Text style={[styles.tabText, section === "agreements" && styles.tabTextOn]}>{t("propertyMgmt.agreementsTab")}</Text>
          </Pressable>
        </View>

        {section === "agreements" && !isAdmin && pendingAgreements.length > 0 ? (
          <Pressable
            style={styles.actionCard}
            onPress={() => {
              if (pendingAgreements.length === 1) openDocument(pendingAgreements[0]);
              else setAgreementFilter("pending");
            }}
          >
            <Text style={styles.actionTitle}>{t("propertyMgmt.actionRequired")}</Text>
            <Text style={styles.actionBody}>
              {pendingAgreements.length === 1
                ? t("propertyMgmt.oneAgreementNeedsSignature")
                : t("propertyMgmt.manyAgreementsNeedSignature", { count: pendingAgreements.length })}
            </Text>
            <Text style={styles.actionLink}>{t("propertyMgmt.reviewAgreement")}</Text>
          </Pressable>
        ) : null}

        {section === "agreements" ? (
          <View style={styles.filterRow}>
            {["all", "pending", "signed"].map((key) => (
              <Pressable key={key} onPress={() => setAgreementFilter(key)} style={[styles.chip, agreementFilter === key && styles.chipOn]}>
                <Text style={[styles.chipLabel, agreementFilter === key && styles.chipLabelOn]}>
                  {key === "all" ? t("propertyMgmt.allFilter") : key === "pending" ? t("propertyMgmt.pendingFilter") : t("propertyMgmt.signedFilter")}
                </Text>
                <View style={[styles.chipCount, agreementFilter === key && styles.chipCountOn]}>
                  <Text style={[styles.chipCountText, agreementFilter === key && styles.chipCountTextOn]}>{agreementCounts[key]}</Text>
                </View>
              </Pressable>
            ))}
            {agreementRows.some((doc) => doc.display_status === "expired" || doc.publication_status === "archived") ? (
              <Pressable onPress={() => setAgreementFilter("expired")} style={[styles.chip, agreementFilter === "expired" && styles.chipOn]}>
                <Text style={[styles.chipLabel, agreementFilter === "expired" && styles.chipLabelOn]}>{t("propertyMgmt.expiredFilter")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {section === "documents" && categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRail}
            style={styles.chipWrap}
          >
            <Pressable
              onPress={() => setSelectedCategory("all")}
              style={[styles.chip, selectedCategory === "all" && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, selectedCategory === "all" && styles.chipLabelOn]}>
                {t("propertyMgmt.allFilter")}
              </Text>
              <View style={[styles.chipCount, selectedCategory === "all" && styles.chipCountOn]}>
                <Text style={[styles.chipCountText, selectedCategory === "all" && styles.chipCountTextOn]}>{documents.length}</Text>
              </View>
            </Pressable>
            {categories.map((cat) => {
              const on = selectedCategory === cat.name;
              const meta = getCategoryMeta(cat.name);
              return (
                <Pressable
                  key={cat.name}
                  onPress={() => setSelectedCategory(cat.name)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Feather name={meta.icon} size={sf(12)} color={on ? "#FFF" : meta.color} />
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <View style={[styles.chipCount, on && styles.chipCountOn]}>
                    <Text style={[styles.chipCountText, on && styles.chipCountTextOn]}>{cat.count ?? 0}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {section === "documents" && recent.length > 0 && selectedCategory === "all" && !search.trim() && (
          <View style={propertyStyles.sectionBlock}>
            <Text style={propertyStyles.sectionTitle}>{t("propertyMgmt.recentDocuments")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRail}>
              {recent.map((doc) => (
                <RecentCard key={`recent-${doc.id}`} doc={doc} onPress={() => openDocument(doc)} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[propertyStyles.sectionBlock, styles.lastSection]}>
          <View style={styles.sectionHeader}>
            <Text style={propertyStyles.sectionTitle}>{section === "agreements" ? t("propertyMgmt.agreementsTab") : t("propertyMgmt.allDocuments")}</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {t("propertyMgmt.filteredCount", { filtered: filteredDocuments.length, total: section === "agreements" ? agreementRows.length : documents.length })}
              </Text>
            </View>
          </View>

          {(section === "agreements" ? agreementRows.length : documents.length) === 0 && !error && (
            <View style={styles.empty}>
              <Feather name="folder" size={sf(32)} color="#D1D5DB" />
              <Text style={styles.emptyText}>{section === "agreements" ? t("propertyMgmt.noAgreements") : t("propertyMgmt.noDocuments")}</Text>
              {isAdmin && <Text style={styles.emptyHint}>{t("propertyMgmt.addFirstDocument")}</Text>}
            </View>
          )}

          {(section === "agreements" ? agreementRows.length : documents.length) > 0 && filteredDocuments.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("propertyMgmt.noDocumentsMatch")}</Text>
              <Pressable onPress={() => { setSelectedCategory("all"); setSearch(""); }}>
                <Text style={styles.retryText}>{t("propertyMgmt.clearFilters")}</Text>
              </Pressable>
            </View>
          )}

          {filteredDocuments.map((doc) => (
            doc.kind === "agreement" ? (
              <AgreementCard
                key={doc.assignment_id ? `${doc.id}-${doc.assignment_id}` : String(doc.id)}
                doc={doc}
                onPress={() => openDocument(doc)}
              />
            ) : (
              <DocumentRow
                key={doc.assignment_id ? `${doc.id}-${doc.assignment_id}` : String(doc.id)}
                doc={doc}
                onPress={() => openDocument(doc)}
                showDownloads={section === "documents" && isAdmin}
              />
            )
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
  addBtnText: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: sw(18),
    marginTop: sw(12),
    padding: sw(4),
    borderRadius: sw(14),
    backgroundColor: "#F1F5F9",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: sw(8), borderRadius: sw(11) },
  tabOn: { backgroundColor: T.navy },
  tabText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  tabTextOn: { color: T.white, fontFamily: Fonts.bold },
  actionCard: {
    marginHorizontal: sw(18),
    marginTop: sw(14),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  actionTitle: { fontFamily: Fonts.bold, color: "#9A3412", fontSize: sf(14) },
  actionBody: { fontFamily: Fonts.regular, color: "#7C2D12", marginTop: sw(4), fontSize: sf(13) },
  actionLink: { fontFamily: Fonts.bold, color: "#1B4F8A", marginTop: sw(8) },
  filterRow: { flexDirection: "row", gap: sw(8), paddingHorizontal: sw(18), marginTop: sw(12) },
  docStatus: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#B45309", marginTop: sw(2) },
  chipWrap: { flexGrow: 0, marginTop: sw(16), marginBottom: sw(14) },
  chipRail: { paddingHorizontal: sw(18), gap: sw(8) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingVertical: sw(8),
    paddingHorizontal: sw(14),
    borderRadius: sw(999),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipOn: { backgroundColor: T.navy, borderColor: T.navy },
  chipLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.navy,
    fontWeight: "600",
    includeFontPadding: false,
  },
  chipLabelOn: { color: "#FFFFFF" },
  chipCount: {
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(5),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0F7",
  },
  chipCountOn: { backgroundColor: "rgba(255,255,255,0.22)" },
  chipCountText: { fontFamily: Fonts.bold, fontSize: sf(10), color: "#1B4F8A", fontWeight: "700" },
  chipCountTextOn: { color: "#FFFFFF" },
  agreeCard: {
    marginTop: sw(12),
    paddingVertical: sw(14),
    paddingRight: sw(12),
    paddingLeft: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF4",
    borderRadius: sw(16),
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: sw(8),
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  agreeAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: sw(3) },
  agreePills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sw(6), marginTop: sw(8) },
  pill: { borderRadius: sw(999), paddingHorizontal: sw(8), paddingVertical: sw(3) },
  pillText: { fontFamily: Fonts.bold, fontSize: sf(11), fontWeight: "700" },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    borderRadius: sw(999),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    backgroundColor: "#F8FAFC",
  },
  metricPillWait: { backgroundColor: "#FFF7ED" },
  metricValue: { fontFamily: Fonts.bold, fontSize: sf(12), fontWeight: "700" },
  metricLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  track: { height: sw(4), borderRadius: sw(4), backgroundColor: "#EEF2F6", marginTop: sw(10), overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: sw(4) },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(4),
  },
  countPill: {
    borderRadius: sw(999),
    backgroundColor: "#E8F0F7",
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
  },
  countPillText: { fontFamily: Fonts.bold, fontSize: sf(11), color: "#1B4F8A", fontWeight: "700" },
  recentRail: { gap: sw(10), paddingTop: sw(12) },
  recentCard: {
    width: sw(148),
    minHeight: sw(112),
    padding: sw(12),
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF4",
    backgroundColor: "#FFFFFF",
    gap: sw(8),
  },
  recentIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  recentTitle: { fontFamily: Fonts.bold, fontSize: sf(13), lineHeight: sf(18), color: "#101828", fontWeight: "700" },
  recentMeta: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  fileCard: {
    marginTop: sw(12),
    paddingVertical: sw(14),
    paddingRight: sw(12),
    paddingLeft: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF4",
    borderRadius: sw(16),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  chevronBtn: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  lastSection: { borderBottomWidth: 0 },
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
  retryText: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#1B4F8A", fontWeight: "700" },
});
