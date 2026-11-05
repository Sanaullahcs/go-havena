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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import { amenityFlowRoutes } from "../../../../constants/property-management-routes";
import {
  deleteCommunityDocument,
  fetchCommunityDocument,
  fetchSignedAgreementLink,
  recordDocumentDownload,
  remindAgreement,
} from "../../../../services/documents-api";
import { getCurrentRole } from "../../../../constants/role-session";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";

function formatDocDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(getLocaleForLang(i18n.language), { month: "long", day: "numeric", year: "numeric" });
}

const STATUS_TONE = {
  pending: { bg: "#E8F0F7", fg: "#1B4F8A" },
  viewed: { bg: "#E8F0F7", fg: "#1B4F8A" },
  signed: { bg: "#CCFBF1", fg: "#0F766E" },
  overdue: { bg: "#FEF3C7", fg: "#92400E" },
  expired: { bg: "#FEF2F2", fg: "#B91C1C" },
  revoked: { bg: "#FEF2F2", fg: "#B91C1C" },
  declined: { bg: "#F1F5F9", fg: "#475569" },
};

function statusLabel(status, t) {
  if (status === "signed") return t("propertyMgmt.statusSigned");
  if (status === "overdue") return t("propertyMgmt.statusOverdue");
  if (status === "expired") return t("propertyMgmt.statusExpired");
  if (status === "revoked") return t("propertyMgmt.statusRevoked");
  if (status === "declined") return t("propertyMgmt.statusDeclined");
  return t("propertyMgmt.requiresSignature");
}

function closedCopy(status, canSign, t) {
  if (canSign && status === "overdue") return t("propertyMgmt.lateSigningOpen");
  if (canSign) return null;
  if (status === "overdue") return t("propertyMgmt.signingClosedOverdue");
  if (status === "expired") return t("propertyMgmt.signingClosedExpired");
  if (status === "revoked") return t("propertyMgmt.signingClosedRevoked");
  if (status === "signed") return null;
  return t("propertyMgmt.signingClosedGeneric");
}

function progressIndex(assignment) {
  if (assignment?.signature_status === "signed" || assignment?.display_status === "signed") return 3;
  if (assignment?.viewed_at) return 2;
  return 1;
}

function SigningProgress({ index }) {
  const { t } = useTranslation();
  const steps = [
    t("propertyMgmt.reviewStep"),
    t("propertyMgmt.signStep"),
    t("propertyMgmt.completeStep"),
  ];
  return (
    <View style={agreementStyles.progress}>
      {steps.map((label, position) => {
        const step = position + 1;
        const done = index > step;
        const current = index === step;
        return (
          <React.Fragment key={label}>
            {position > 0 ? <View style={[agreementStyles.progressLine, (done || current) && agreementStyles.progressLineOn]} /> : null}
            <View style={agreementStyles.progressStep}>
              <View style={[agreementStyles.progressDot, (done || current) && agreementStyles.progressDotOn]}>
                {done ? (
                  <Feather name="check" size={sf(10)} color="#FFFFFF" />
                ) : (
                  <Text style={[agreementStyles.progressNum, current && agreementStyles.progressNumOn]}>{step}</Text>
                )}
              </View>
              <Text style={[agreementStyles.progressLabel, current && agreementStyles.progressLabelOn]}>{label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function AgreementDetails({
  doc,
  assignment,
  isAdmin,
  submitting,
  onSign,
  onOpenFile,
  onSignedCopy,
  onRemind,
  onEdit,
  onDelete,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const status = assignment?.display_status || "pending";
  const tone = STATUS_TONE[status] || STATUS_TONE.pending;
  const signed = status === "signed" || assignment?.signature_status === "signed";
  const canSign = !isAdmin && Boolean(assignment?.can_sign);
  const note = isAdmin || signed ? null : closedCopy(status, canSign, t);
  const pages = Number(doc.page_count) > 0
    ? (Number(doc.page_count) === 1 ? t("propertyMgmt.onePage") : t("propertyMgmt.pageCount", { count: doc.page_count }))
    : null;
  const fileMeta = [doc.file_size_label, pages].filter(Boolean).join(" · ");
  const rows = [
    [t("propertyMgmt.communityLabel"), doc.community_name || "—"],
    [t("propertyMgmt.unitLabel"), assignment?.unit_label || t("propertyMgmt.notUnitSpecific")],
    [t("propertyMgmt.signingDeadline"), formatDocDate(doc.due_at)],
    [t("propertyMgmt.agreementEffectiveDate"), formatDocDate(doc.effective_at)],
    [t("propertyMgmt.expirationDate"), formatDocDate(doc.expires_at)],
    [t("propertyMgmt.versionLabel"), doc.version ? `v${doc.version}` : "—"],
  ];

  const preview = () => {
    if (canSign) onSign();
    else if (signed) onSignedCopy();
    else onOpenFile();
  };

  return (
    <SafeAreaView style={agreementStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("propertyMgmt.agreementDetails")}
        right={
          isAdmin ? (
            <View style={styles.adminActions}>
              <Pressable onPress={onEdit} style={styles.iconBtn}>
                <Feather name="edit-2" size={sf(16)} color="#1B4F8A" />
              </Pressable>
              <Pressable onPress={onDelete} style={[styles.iconBtn, styles.iconBtnRed]}>
                <Feather name="trash-2" size={sf(16)} color="#E7000B" />
              </Pressable>
            </View>
          ) : null
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={agreementStyles.scroll}>
        <View style={agreementStyles.card}>
          <View style={agreementStyles.summaryRow}>
            <View style={agreementStyles.fileIcon}>
              <Feather name="file-text" size={sf(18)} color="#E11D48" />
            </View>
            <View style={agreementStyles.summaryCopy}>
              <Text style={agreementStyles.title}>{doc.title}</Text>
              {doc.category ? <Text style={agreementStyles.category}>{doc.category}</Text> : null}
              <View style={[agreementStyles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[agreementStyles.badgeText, { color: tone.fg }]}>{statusLabel(status, t)}</Text>
              </View>
            </View>
          </View>
          <Text style={agreementStyles.caption}>
            {t("propertyMgmt.updatedDate", { date: formatDocDate(doc.updated_at) })}
            {doc.download_count != null ? ` · ${t("propertyMgmt.downloadCount", { count: doc.download_count })}` : ""}
          </Text>
        </View>

        <View style={agreementStyles.card}>
          {rows.map(([label, value], index) => (
            <View key={label} style={[agreementStyles.infoRow, index > 0 && agreementStyles.infoDivider]}>
              <Text style={agreementStyles.infoLabel}>{label}</Text>
              <Text style={agreementStyles.infoValue}>{value}</Text>
            </View>
          ))}
          {isAdmin && doc.stats ? (
            <Text style={agreementStyles.adminStats}>
              {doc.stats.signed} signed · {doc.stats.pending} pending · {doc.stats.viewed} viewed
            </Text>
          ) : null}
        </View>

        {doc.description ? (
          <View style={agreementStyles.card}>
            <Text style={agreementStyles.sectionLabel}>{t("propertyMgmt.descriptionLabel")}</Text>
            <Text style={agreementStyles.description}>{doc.description}</Text>
          </View>
        ) : null}

        <Pressable style={agreementStyles.card} onPress={preview}>
          <View style={agreementStyles.pdfRow}>
            <View style={agreementStyles.pdfIcon}>
              <Feather name="file" size={sf(16)} color="#1B4F8A" />
            </View>
            <View style={agreementStyles.summaryCopy}>
              <Text style={agreementStyles.pdfName} numberOfLines={1}>{doc.file_name}</Text>
              {fileMeta ? <Text style={agreementStyles.caption}>{fileMeta}</Text> : null}
            </View>
            <Text style={agreementStyles.preview}>{t("propertyMgmt.previewPdf")}</Text>
          </View>
        </Pressable>

        {!isAdmin ? (
          <View style={agreementStyles.card}>
            <SigningProgress index={progressIndex(assignment)} />
          </View>
        ) : null}

        {note ? <Text style={agreementStyles.note}>{note}</Text> : null}
      </ScrollView>

      <View style={[agreementStyles.footer, { paddingBottom: Math.max(insets.bottom, sw(12)) }]}>
        {isAdmin && doc.publication_status === "published" ? (
          <Pressable style={agreementStyles.secondaryBtn} disabled={submitting} onPress={onRemind}>
            <Text style={agreementStyles.secondaryText}>{t("propertyMgmt.remindPending")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[agreementStyles.primaryBtn, submitting && styles.btnDisabled]}
          disabled={submitting}
          onPress={canSign ? onSign : signed ? onSignedCopy : onOpenFile}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name={canSign ? "edit-3" : signed ? "check-circle" : "eye"} size={sf(16)} color="#FFFFFF" />
              <Text style={agreementStyles.primaryText}>
                {canSign
                  ? t("propertyMgmt.reviewAndSign")
                  : signed
                    ? t("propertyMgmt.viewSignedCopy")
                    : t("propertyMgmt.viewDocument")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function DocumentDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { documentId, assignmentId } = useLocalSearchParams();
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

  const assignment = (doc?.assignments ?? []).find(
    (item) => String(item.assignment_id) === String(assignmentId),
  ) ?? doc?.assignments?.[0];
  const isAgreement = doc?.kind === "agreement";

  const openSigned = () => run(async () => {
    const url = assignment?.signed_file_url || await fetchSignedAgreementLink(doc.id, assignment?.assignment_id);
    if (url) await Linking.openURL(url);
  });

  const handleDownload = () => {
    if (!doc?.file_url) return;
    run(async () => {
      const updated = await recordDocumentDownload(doc.id);
      setDoc((current) => ({ ...current, ...updated, assignments: current?.assignments, stats: current?.stats, community_name: current?.community_name }));
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
      pathname: amenityFlowRoutes(pathname).documentForm,
      params: { documentId: String(doc.id) },
    });
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentTitle")} />
        <View style={styles.centered}><ActivityIndicator size="large" color="#1B4F8A" /></View>
      </SafeAreaView>
    );
  }

  if (error || !doc) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.documentTitle")} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t("propertyMgmt.notFoundDoc")}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.linkText}>{t("propertyMgmt.retryBtn")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isAgreement) {
    return (
      <AgreementDetails
        doc={doc}
        assignment={assignment}
        isAdmin={isAdmin}
        submitting={submitting}
        onSign={() =>
          router.push({
            pathname: amenityFlowRoutes(pathname).signAgreement,
            params: {
              documentId: String(doc.id),
              assignmentId: String(assignment?.assignment_id ?? ""),
            },
          })
        }
        onOpenFile={handleDownload}
        onSignedCopy={() => void openSigned()}
        onRemind={() => run(async () => { await remindAgreement(doc.id); })}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
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
                <Feather name="edit-2" size={sf(16)} color="#1B4F8A" />
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: sw(12), paddingHorizontal: sw(24) },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(14), color: "#E7000B", textAlign: "center" },
  linkText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#1B4F8A", fontWeight: "700" },
  retryBtn: { paddingVertical: sw(8), paddingHorizontal: sw(12) },
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
  category: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#1B4F8A", marginTop: sw(4) },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sw(4), marginTop: sw(6) },
  metaText: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#9CA3AF", flexShrink: 1 },
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
    backgroundColor: "#1B4F8A", borderRadius: sw(14), paddingVertical: sw(15),
  },
  btnDisabled: { opacity: 0.5 },
  downloadBtnText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF", fontWeight: "700" },
});

const agreementStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  scroll: { paddingHorizontal: sw(16), paddingTop: sw(12), paddingBottom: sw(20), gap: sw(10) },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EBF1",
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
  },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  fileIcon: {
    width: sw(40), height: sw(40), borderRadius: sw(12),
    backgroundColor: "#FFF1F2", alignItems: "center", justifyContent: "center",
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  title: { fontFamily: Fonts.bold, fontSize: sf(17), lineHeight: sf(22), color: "#101828", fontWeight: "700" },
  category: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#1B4F8A", marginTop: sw(2) },
  caption: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#6A7282", marginTop: sw(2) },
  badge: { alignSelf: "flex-start", borderRadius: sw(999), paddingHorizontal: sw(8), paddingVertical: sw(4), marginTop: sw(8) },
  badgeText: { fontFamily: Fonts.bold, fontSize: sf(11), fontWeight: "700" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(12), paddingVertical: sw(8) },
  infoDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#EEF2F6" },
  infoLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#6A7282" },
  infoValue: { flex: 1, textAlign: "right", fontFamily: Fonts.medium, fontSize: sf(13), color: "#101828" },
  adminStats: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B", marginTop: sw(4) },
  sectionLabel: {
    fontFamily: Fonts.bold, fontSize: sf(11), color: "#6A7282", fontWeight: "700",
    letterSpacing: 0.4, textTransform: "uppercase", marginBottom: sw(6),
  },
  description: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(21), color: "#364153" },
  pdfRow: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  pdfIcon: {
    width: sw(36), height: sw(36), borderRadius: sw(10),
    backgroundColor: "#E8F0F7", alignItems: "center", justifyContent: "center",
  },
  pdfName: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#101828" },
  preview: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#0F766E", fontWeight: "700" },
  progress: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  progressStep: { alignItems: "center", width: sw(72) },
  progressDot: {
    width: sw(22), height: sw(22), borderRadius: sw(11),
    backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center",
  },
  progressDotOn: { backgroundColor: "#1B4F8A" },
  progressNum: { fontFamily: Fonts.bold, fontSize: sf(11), color: "#64748B", fontWeight: "700" },
  progressNumOn: { color: "#FFFFFF" },
  progressLabel: { marginTop: sw(4), fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  progressLabelOn: { color: "#1B4F8A" },
  progressLine: { flex: 1, height: 1, backgroundColor: "#E6EBF1", marginTop: sw(11) },
  progressLineOn: { backgroundColor: "#1B4F8A" },
  note: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: "#92400E", paddingHorizontal: sw(4) },
  footer: {
    paddingHorizontal: sw(16), paddingTop: sw(10), gap: sw(8),
    backgroundColor: "#FFFFFF", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E6EBF1",
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(8),
    backgroundColor: "#1B4F8A", borderRadius: sw(14), paddingVertical: sw(14),
  },
  primaryText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF", fontWeight: "700" },
  secondaryBtn: {
    alignItems: "center", justifyContent: "center",
    borderRadius: sw(14), paddingVertical: sw(12),
    borderWidth: 1, borderColor: "#D7DEE8", backgroundColor: "#FFFFFF",
  },
  secondaryText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#1B4F8A", fontWeight: "700" },
});
