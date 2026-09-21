import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import {
  deleteCommunityDocument,
  fetchCommunityDocument,
  recordDocumentDownload,
} from "../../../../services/documents-api";
import { getCurrentRole } from "../../../../constants/role-session";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";

function formatDocDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(getLocaleForLang(i18n.language), { month: "long", day: "numeric", year: "numeric" });
}

export default function DocumentDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { documentId } = useLocalSearchParams();
  const isAdmin = getCurrentRole() === "admin";
  const { submitting, run } = useSubmitLock();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const found = await fetchCommunityDocument(documentId);
      setDoc(found);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadDocs"));
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [documentId]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const handleDownload = () => {
    if (!doc?.file_url) return;
    run(async () => {
      const updated = await recordDocumentDownload(doc.id);
      setDoc(updated);
      await Linking.openURL(doc.file_url);
    });
  };

  const handleDelete = () => {
    Alert.alert(t("propertyMgmt.deleteDocument"), t("propertyMgmt.deleteDocumentMsg", { title: doc?.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          run(async () => {
            await deleteCommunityDocument(doc.id);
            router.back();
          }),
      },
    ]);
  };

  const handleEdit = () => {
    router.push({
      pathname: PropertyManagementRoutes.DOCUMENT_FORM,
      params: { documentId: String(doc.id) },
    });
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentTitle")} />
        <View style={styles.centered}><ActivityIndicator size="large" color="#0A2A43" /></View>
      </SafeAreaView>
    );
  }

  if (error || !doc) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentTitle")} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t("propertyMgmt.notFoundDoc")}</Text>
          <Pressable onPress={router.back}><Text style={styles.linkText}>{t("propertyMgmt.goBackDoc")}</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.documentTitle")}
        right={
          isAdmin ? (
            <View style={styles.adminActions}>
              <Pressable onPress={handleEdit} style={styles.iconBtn}>
                <Feather name="edit-2" size={sf(16)} color="#0A2A43" />
              </Pressable>
              <Pressable onPress={handleDelete} style={[styles.iconBtn, styles.iconBtnRed]}>
                <Feather name="trash-2" size={sf(16)} color="#E7000B" />
              </Pressable>
            </View>
          ) : null
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pageStyles.scrollBottom}>
        <View style={[propertyStyles.sectionBlock, styles.heroBlock]}>
          <View style={styles.fileBadge}>
            <Feather name="file-text" size={sf(22)} color="#E7000B" />
          </View>
          <Text style={styles.title}>{doc.title}</Text>
<Text style={styles.category}>{doc.category}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{doc.file_size_label} · {doc.file_name}</Text>
          </View>
          <View style={styles.metaRow}>
            <Feather name="clock" size={sf(11)} color="#9CA3AF" />
            <Text style={styles.metaText}>{t("propertyMgmt.updatedDate", { date: formatDocDate(doc.updated_at) })}</Text>
          </View>
          <View style={styles.metaRow}>
            <Feather name="download" size={sf(11)} color="#9CA3AF" />
            <Text style={styles.metaText}>{t("propertyMgmt.downloadCount", { count: doc.download_count ?? 0 })}</Text>
          </View>
        </View>

        {doc.description ? (
          <View style={[propertyStyles.sectionBlock, styles.descBlock]}>
            <Text style={styles.descLabel}>{t("propertyMgmt.descriptionLabel")}</Text>
            <Text style={styles.descText}>{doc.description}</Text>
</View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.downloadBtn, submitting && styles.btnDisabled]} disabled={submitting} onPress={handleDownload}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="download" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.downloadBtnText}>{t("propertyMgmt.downloadDocument")}</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(12) },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(14), color: "#E7000B", textAlign: "center" },
  linkText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0A2A43", fontWeight: "700" },
  adminActions: { flexDirection: "row", gap: sw(6) },
  iconBtn: {
    width: sw(34), height: sw(34), borderRadius: sw(8),
    backgroundColor: "#D1FAF5", alignItems: "center", justifyContent: "center",
  },
  iconBtnRed: { backgroundColor: "#FEF2F2" },
  heroBlock: { alignItems: "flex-start" },
  fileBadge: {
    width: sw(52), height: sw(52), borderRadius: sw(14),
    backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: sw(12),
  },
  title: { fontFamily: Fonts.bold, fontSize: sf(20), lineHeight: sf(27), color: "#101828", fontWeight: "700" },
  category: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#0A2A43", marginTop: sw(4) },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sw(4), marginTop: sw(6) },
  metaText: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#9CA3AF" },
  descBlock: { paddingTop: sw(8) },
  descLabel: {
    fontFamily: Fonts.bold, fontSize: sf(12), fontWeight: "700", color: "#6A7282",
    letterSpacing: 0.5, textTransform: "uppercase", marginBottom: sw(8),
  },
  descText: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(22), color: "#364153" },
  footer: {
    paddingHorizontal: sw(18), paddingBottom: hp(3), paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6", backgroundColor: "#FFFFFF",
  },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(8),
    backgroundColor: "#0A2A43", borderRadius: sw(14), paddingVertical: sw(15),
  },
  btnDisabled: { opacity: 0.5 },
  downloadBtnText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF", fontWeight: "700" },
});
