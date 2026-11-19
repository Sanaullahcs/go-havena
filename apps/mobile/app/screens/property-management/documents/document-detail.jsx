import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf, hp } from "../../../../utils/responsive";
import { amenityFlowRoutes } from "../../../../constants/property-management-routes";
import {
  deleteCommunityDocument,
  fetchAgreementDetail,
  fetchCommunityDocument,
  recordDocumentDownload,
  remindAgreement,
  remindDocument,
} from "../../../../services/documents-api";
import { getCurrentRole } from "../../../../constants/role-session";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import { useAppDialog } from "../../../../providers/app-dialog-provider";

function formatDocDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(getLocaleForLang(i18n.language), { month: "long", day: "numeric", year: "numeric" });
}

function wasModifiedAfterPublish(doc) {
  if (typeof doc?.modified_after_publish === "boolean") return doc.modified_after_publish;
  const published = new Date(doc?.published_at || doc?.created_at).getTime();
  const updated = new Date(doc?.updated_at).getTime();
  if (!Number.isFinite(published) || !Number.isFinite(updated)) return false;
  return updated - published > 5000;
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
  if (status === "pending" || status === "viewed") return t("propertyMgmt.pendingFilter");
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
                  <Feather name="check" size={sf(12)} color="#FFFFFF" />
                ) : (
                  <Text style={[agreementStyles.progressNum, current && agreementStyles.progressNumOn]}>{step}</Text>
                )}
              </View>
              <Text style={[agreementStyles.progressLabel, (done || current) && agreementStyles.progressLabelOn]} numberOfLines={2}>{label}</Text>
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
  const [signatureFilter, setSignatureFilter] = useState("all");
  const recipients = Array.isArray(doc.recipients) ? doc.recipients : [];
  const recipientStatus = (row) => row.display_status || (row.signature_status === "signed" ? "signed" : "pending");
  const signedRecipients = recipients.filter((row) => recipientStatus(row) === "signed");
  const pendingRecipients = recipients.filter((row) => recipientStatus(row) === "pending" || recipientStatus(row) === "viewed");
  const overdueRecipients = recipients.filter((row) => recipientStatus(row) === "overdue");
  const expiredRecipients = recipients.filter((row) => recipientStatus(row) === "expired");
  const visibleRecipients = signatureFilter === "signed"
    ? signedRecipients
    : signatureFilter === "pending"
      ? pendingRecipients
      : signatureFilter === "overdue"
        ? overdueRecipients
        : signatureFilter === "expired"
          ? expiredRecipients
          : recipients;
  const status = assignment?.display_status || "pending";
  const tone = STATUS_TONE[status] || STATUS_TONE.pending;
  const signatureSigned = assignment?.signature_status === "signed";
  const signed = status === "signed" || signatureSigned;
  const canSign = !isAdmin && Boolean(assignment?.can_sign);
  const note = isAdmin ? null : status === "expired" ? closedCopy("expired", false, t) : signed ? null : closedCopy(status, canSign, t);
  const pages = Number(doc.page_count) > 0
    ? (Number(doc.page_count) === 1 ? t("propertyMgmt.onePage") : t("propertyMgmt.pageCount", { count: doc.page_count }))
    : null;
  const fileMeta = [doc.file_size_label, pages].filter(Boolean).join(" · ");
  const dates = [
    { key: "due", icon: "calendar", label: t("propertyMgmt.signingDeadline"), value: formatDocDate(doc.due_at), tint: "#92400E", wash: "#FFF7ED" },
    { key: "effective", icon: "check-circle", label: t("propertyMgmt.agreementEffectiveDate"), value: formatDocDate(doc.effective_at), tint: "#1B4F8A", wash: "#E8F0F7" },
    { key: "expires", icon: "flag", label: t("propertyMgmt.expirationDate"), value: formatDocDate(doc.expires_at), tint: "#475569", wash: "#F1F5F9" },
  ];

  const preview = () => {
    if (canSign) onSign();
    else if (signatureSigned) onSignedCopy();
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
              <View style={agreementStyles.summaryPills}>
                {doc.category ? (
                  <View style={agreementStyles.categoryPill}>
                    <Text style={agreementStyles.category} numberOfLines={1}>{doc.category}</Text>
                  </View>
                ) : null}
                <View style={[agreementStyles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[agreementStyles.badgeText, { color: tone.fg }]}>{statusLabel(status, t)}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={agreementStyles.metaLine}>
            <Feather name="clock" size={sf(12)} color="#64748B" />
            <Text style={agreementStyles.caption}>{t("propertyMgmt.updatedDate", { date: formatDocDate(doc.updated_at) })}</Text>
            {doc.download_count != null ? (
              <>
                <Feather name="download" size={sf(12)} color="#64748B" />
                <Text style={agreementStyles.caption}>{t("propertyMgmt.downloadCount", { count: doc.download_count })}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={agreementStyles.card}>
          <View style={agreementStyles.factPair}>
            <View style={agreementStyles.factTile}>
              <View style={[agreementStyles.factIcon, { backgroundColor: "#E8F0F7" }]}>
                <Feather name="home" size={sf(14)} color="#1B4F8A" />
              </View>
              <Text style={agreementStyles.factLabel}>{t("propertyMgmt.communityLabel")}</Text>
              <Text style={agreementStyles.factValue} numberOfLines={2}>{doc.community_name || "—"}</Text>
            </View>
            <View style={agreementStyles.factTile}>
              <View style={[agreementStyles.factIcon, { backgroundColor: "#F1F5F9" }]}>
                <Feather name="grid" size={sf(14)} color="#475569" />
              </View>
              <Text style={agreementStyles.factLabel}>{t("propertyMgmt.unitLabel")}</Text>
              <Text style={agreementStyles.factValue} numberOfLines={2}>{assignment?.unit_label || t("propertyMgmt.notUnitSpecific")}</Text>
            </View>
          </View>
          <View style={agreementStyles.dateList}>
            {dates.map((item) => (
              <View key={item.key} style={agreementStyles.dateItem}>
                <View style={[agreementStyles.dateIcon, { backgroundColor: item.wash }]}>
                  <Feather name={item.icon} size={sf(13)} color={item.tint} />
                </View>
                <View style={agreementStyles.dateCopy}>
                  <Text style={agreementStyles.dateLabel}>{item.label}</Text>
                  <Text style={agreementStyles.dateValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
          {isAdmin && doc.stats ? (
            <View style={agreementStyles.metricRow}>
              {[
                [doc.stats.signed, t("propertyMgmt.statusSigned"), "#0F766E"],
                [doc.stats.pending, t("propertyMgmt.pendingFilter"), "#1B4F8A"],
                [doc.stats.overdue, t("propertyMgmt.statusOverdue"), "#92400E"],
                [doc.stats.expired, t("propertyMgmt.statusExpired"), "#B91C1C"],
              ].map(([value, label, color]) => (
                <View key={label} style={agreementStyles.metric}>
                  <Text style={[agreementStyles.metricValue, { color }]}>{value}</Text>
                  <Text style={agreementStyles.metricLabel}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {isAdmin ? (
          <View style={agreementStyles.card}>
            <Text style={agreementStyles.sectionLabel}>{t("propertyMgmt.residents")}</Text>
            <View style={agreementStyles.filterRow}>
              {[
                ["all", t("propertyMgmt.allFilter"), recipients.length],
                ["pending", t("propertyMgmt.pendingFilter"), pendingRecipients.length],
                ["overdue", t("propertyMgmt.overdueFilter"), overdueRecipients.length],
                ["signed", t("propertyMgmt.signedFilter"), signedRecipients.length],
                ["expired", t("propertyMgmt.expiredFilter"), expiredRecipients.length],
              ].map(([key, label, count]) => (
                <Pressable
                  key={key}
                  onPress={() => setSignatureFilter(key)}
                  style={[agreementStyles.chip, signatureFilter === key && agreementStyles.chipOn]}
                >
                  <Text style={[agreementStyles.chipLabel, signatureFilter === key && agreementStyles.chipLabelOn]}>
                    {label}
                  </Text>
                  <View style={[agreementStyles.chipCount, signatureFilter === key && agreementStyles.chipCountOn]}>
                    <Text style={[agreementStyles.chipCountText, signatureFilter === key && agreementStyles.chipCountTextOn]}>{count}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {visibleRecipients.length === 0 ? (
              <Text style={agreementStyles.emptyRecipients}>{t("propertyMgmt.noResidentsInFilter")}</Text>
            ) : visibleRecipients.map((row) => {
              const rowStatus = recipientStatus(row);
              const signedRow = rowStatus === "signed" || row.signature_status === "signed";
              const initial = String(row.resident_name || "?").trim().charAt(0).toUpperCase() || "?";
              return (
                <View key={String(row.id)} style={agreementStyles.recipientTile}>
                  <View style={[agreementStyles.avatar, signedRow ? agreementStyles.avatarSigned : agreementStyles.avatarPending]}>
                    <Text style={[agreementStyles.avatarText, signedRow ? agreementStyles.avatarTextSigned : agreementStyles.avatarTextPending]}>{initial}</Text>
                  </View>
                  <View style={agreementStyles.recipientCopy}>
                    <Text style={agreementStyles.recipientName} numberOfLines={1}>{row.resident_name}</Text>
                    <View style={agreementStyles.unitLine}>
                      <Feather name="grid" size={sf(11)} color="#94A3B8" />
                      <Text style={agreementStyles.recipientUnit} numberOfLines={1}>{row.unit_label || t("propertyMgmt.notUnitSpecific")}</Text>
                    </View>
                    <View style={agreementStyles.statusLine}>
                      <View style={[agreementStyles.statusPill, signedRow ? agreementStyles.statusPillSigned : agreementStyles.statusPillPending]}>
                        <Feather name={signedRow ? "check" : "clock"} size={sf(11)} color={signedRow ? "#0F766E" : "#B45309"} />
                        <Text style={[agreementStyles.statusPillText, signedRow && rowStatus !== "expired" ? agreementStyles.statusPillTextSigned : agreementStyles.statusPillTextPending]}>
                          {statusLabel(rowStatus, t)}
                        </Text>
                      </View>
                      <Text style={agreementStyles.recipientDate}>{signedRow ? formatDocDate(row.signed_at) : t("propertyMgmt.notSigned")}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {doc.description ? (
          <View style={agreementStyles.card}>
            <Text style={agreementStyles.descTitle}>{t("propertyMgmt.descriptionLabel")}</Text>
            <Text style={agreementStyles.description}>{doc.description}</Text>
          </View>
        ) : null}

        <Pressable style={agreementStyles.card} onPress={preview}>
          <View style={agreementStyles.pdfRow}>
            <View style={agreementStyles.pdfIcon}>
              <Feather name="file" size={sf(16)} color="#1B4F8A" />
            </View>
            <View style={agreementStyles.summaryCopy}>
              <Text style={agreementStyles.pdfName} numberOfLines={2}>{doc.file_name}</Text>
              {fileMeta ? <Text style={agreementStyles.caption}>{fileMeta}</Text> : null}
            </View>
          </View>
          <View style={agreementStyles.previewPill}>
            <Text style={agreementStyles.preview}>{t("propertyMgmt.previewPdf")}</Text>
            <Feather name="chevron-right" size={sf(14)} color="#0F766E" />
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
        {isAdmin && doc.publication_status === "published" && (doc.stats ? Number(doc.stats.pending) + Number(doc.stats.overdue) > 0 : pendingRecipients.length + overdueRecipients.length > 0) ? (
          <Pressable style={agreementStyles.secondaryBtn} disabled={submitting} onPress={onRemind}>
            <Text style={agreementStyles.secondaryText}>{t("propertyMgmt.remindPending")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[agreementStyles.primaryBtn, submitting && styles.btnDisabled]}
          disabled={submitting}
          onPress={canSign ? onSign : signatureSigned ? onSignedCopy : onOpenFile}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name={canSign ? "edit-3" : signatureSigned ? "check-circle" : "eye"} size={sf(16)} color="#FFFFFF" />
              <Text style={agreementStyles.primaryText}>
                {canSign
                  ? t("propertyMgmt.reviewAndSign")
                  : signatureSigned
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
  const dialog = useAppDialog();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const found = await fetchCommunityDocument(documentId);
      if (getCurrentRole() === "admin" && found?.kind === "agreement") {
        try {
          const detail = await fetchAgreementDetail(documentId);
          found.recipients = detail?.recipients ?? [];
        } catch {
          found.recipients = [];
        }
      }
      setDoc(found);
      setError(null);
    } catch (err) {
      const missing = err?.status === 404;
      if (missing) setDoc(null);
      if (!silent || missing) setError(err?.message ?? t("propertyMgmt.couldNotLoadDocs"));
    } finally {
      inFlight.current = false;
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [documentId, t]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
      const timer = setInterval(() => load(true), 15000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") load(true);
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [load]),
  );

  const assignment = (doc?.assignments ?? []).find(
    (item) => String(item.assignment_id) === String(assignmentId),
  ) ?? doc?.assignments?.[0];
  const needsSignature = doc?.kind === "agreement" || Boolean(doc?.signature_required);

  const openViewer = (source) => {
    router.push({
      pathname: amenityFlowRoutes(pathname).signAgreement,
      params: {
        documentId: String(doc.id),
        assignmentId: String(assignment?.assignment_id ?? assignmentId ?? ""),
        mode: "view",
        source,
      },
    });
  };

  const handleDownload = () => {
    if (!doc?.file_url) return;
    run(async () => {
      const updated = await recordDocumentDownload(doc.id);
      setDoc((current) => ({ ...current, ...updated, assignments: current?.assignments, stats: current?.stats, community_name: current?.community_name }));
      await Linking.openURL(doc.file_url);
    });
  };

  const handleDelete = async () => {
    Keyboard.dismiss();
    const choice = await dialog.showConfirm(
      t("propertyMgmt.deleteDocument"),
      t("propertyMgmt.deleteDocumentMsg", { title: doc?.title }),
      { confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"), destructive: true },
    );
    if (choice !== "confirm") return;
    run(async () => {
      await deleteCommunityDocument(doc.id);
      router.back();
    });
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

  if (needsSignature) {
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
        onOpenFile={() => openViewer("original")}
        onSignedCopy={() => openViewer("signed")}
        onRemind={() => run(async () => {
          if (doc.kind === "agreement") await remindAgreement(doc.id);
          else await remindDocument(doc.id);
        })}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <SafeAreaView style={styles.docScreen} edges={["left", "right"]}>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.docScroll}>
        <View style={styles.docCard}>
          <View style={styles.docSummary}>
            <View style={styles.fileBadge}>
              <Feather name="file-text" size={sf(20)} color="#E11D48" />
            </View>
            <View style={styles.docCopy}>
              <View style={styles.titleLine}>
                <Text style={[styles.title, styles.titleFlex]}>{doc.title}</Text>
                {doc.kind !== "agreement" ? (
                  <View style={styles.versionPill}>
                    <Text style={styles.versionText}>V{doc.version || 1}</Text>
                  </View>
                ) : null}
              </View>
              {doc.category ? (
                <View style={styles.categoryPill}>
                  <Text style={styles.category} numberOfLines={1}>{doc.category}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {doc.file_name ? (
            <View style={styles.fileRow}>
              <Feather name="paperclip" size={sf(14)} color="#64748B" />
              <Text style={styles.fileName}>{doc.file_name}</Text>
            </View>
          ) : null}

          {isAdmin ? (
            <View style={styles.statRow}>
              {doc.file_size_label ? (
                <View style={styles.statTile}>
                  <View style={[styles.statIcon, { backgroundColor: "#E8F0F7" }]}>
                    <Feather name="file" size={sf(14)} color="#1B4F8A" />
                  </View>
                  <Text style={styles.statValue}>{doc.file_size_label}</Text>
                </View>
              ) : null}
              <View style={styles.statTile}>
                <View style={[styles.statIcon, { backgroundColor: "#F0FDFA" }]}>
                  <Feather name="download" size={sf(14)} color="#0F766E" />
                </View>
                <Text style={styles.statValue}>{t("propertyMgmt.downloadCount", { count: doc.download_count ?? 0 })}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.dateRow}>
            <View style={styles.dateIcon}>
              <Feather name="clock" size={sf(14)} color="#475569" />
            </View>
            <Text style={styles.dateText}>
              {!isAdmin && wasModifiedAfterPublish(doc)
                ? t("propertyMgmt.updatedDate", { date: formatDocDate(doc.updated_at) })
                : !isAdmin
                  ? t("propertyMgmt.publishedDate", { date: formatDocDate(doc.published_at || doc.created_at) })
                  : t("propertyMgmt.updatedDate", { date: formatDocDate(doc.updated_at) })}
            </Text>
          </View>
        </View>

        {doc.description ? (
          <View style={styles.docCard}>
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
  docScreen: { flex: 1, backgroundColor: "#F6F8FB" },
  docScroll: { paddingHorizontal: sw(16), paddingTop: sw(12), paddingBottom: sw(20), gap: sw(10) },
  docCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EBF1",
    padding: sw(14),
  },
  docSummary: { flexDirection: "row", alignItems: "flex-start", gap: sw(12) },
  fileBadge: {
    width: sw(48), height: sw(48), borderRadius: sw(14),
    backgroundColor: "#FFF1F2", alignItems: "center", justifyContent: "center",
  },
  docCopy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: "row", alignItems: "flex-start", gap: sw(8) },
  titleFlex: { flex: 1, minWidth: 0 },
  versionPill: {
    marginTop: sw(3),
    borderRadius: sw(6),
    backgroundColor: "#E8F0F7",
    paddingHorizontal: sw(7),
    paddingVertical: sw(3),
  },
  versionText: { fontFamily: Fonts.bold, fontSize: sf(11), color: "#1B4F8A", fontWeight: "700" },
  title: { fontFamily: Fonts.bold, fontSize: sf(20), lineHeight: sf(26), color: "#101828", fontWeight: "700" },
  categoryPill: {
    alignSelf: "flex-start",
    marginTop: sw(8),
    borderRadius: sw(999),
    backgroundColor: "#E8F0F7",
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    maxWidth: "100%",
  },
  category: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
  fileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    marginTop: sw(14),
    padding: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
  },
  fileName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#334155" },
  statRow: { flexDirection: "row", gap: sw(8), marginTop: sw(10) },
  statTile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    padding: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
  },
  statIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(12), lineHeight: sf(16), color: "#101828", fontWeight: "700" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: sw(10), marginTop: sw(12) },
  dateIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  dateText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  descLabel: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#64748B", fontWeight: "700", marginBottom: sw(6) },
  descText: { fontFamily: Fonts.regular, fontSize: sf(15), lineHeight: sf(22), color: "#101828" },
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
  summaryPills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sw(6), marginTop: sw(8) },
  categoryPill: {
    maxWidth: "100%",
    borderRadius: sw(999),
    backgroundColor: "#E8F0F7",
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  category: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
  metaLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sw(6), marginTop: sw(12) },
  caption: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#64748B" },
  badge: { alignSelf: "flex-start", borderRadius: sw(999), paddingHorizontal: sw(8), paddingVertical: sw(4) },
  badgeText: { fontFamily: Fonts.bold, fontSize: sf(11), fontWeight: "700" },
  factPair: { flexDirection: "row", gap: sw(8) },
  factTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    paddingHorizontal: sw(10),
    paddingVertical: sw(10),
  },
  factIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(8),
  },
  factLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  factValue: { marginTop: 2, fontFamily: Fonts.bold, fontSize: sf(13), lineHeight: sf(18), color: "#101828", fontWeight: "700" },
  dateList: { marginTop: sw(12), gap: sw(10) },
  dateItem: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  dateIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  dateCopy: { flex: 1, minWidth: 0 },
  dateLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  dateValue: { marginTop: 1, fontFamily: Fonts.medium, fontSize: sf(14), color: "#101828" },
  metricRow: {
    flexDirection: "row",
    marginTop: sw(12),
    paddingTop: sw(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  metric: { flex: 1, alignItems: "center" },
  metricValue: { fontFamily: Fonts.bold, fontSize: sf(16), fontWeight: "700" },
  metricLabel: { marginTop: 2, fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginTop: sw(10), marginBottom: sw(4) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(6),
    paddingLeft: sw(10),
    paddingRight: sw(6),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EBF1",
  },
  chipOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  chipLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#334155" },
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
  emptyRecipients: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#94A3B8", paddingVertical: sw(12) },
  recipientTile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginTop: sw(8),
    padding: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
  },
  avatar: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSigned: { backgroundColor: "#CCFBF1" },
  avatarPending: { backgroundColor: "#FFEDD5" },
  avatarText: { fontFamily: Fonts.bold, fontSize: sf(14), fontWeight: "700" },
  avatarTextSigned: { color: "#0F766E" },
  avatarTextPending: { color: "#C2410C" },
  recipientCopy: { flex: 1, minWidth: 0 },
  recipientName: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#101828", fontWeight: "700" },
  unitLine: { flexDirection: "row", alignItems: "center", gap: sw(4), marginTop: sw(3) },
  recipientUnit: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  statusLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sw(8), marginTop: sw(8) },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    borderRadius: sw(999),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  statusPillSigned: { backgroundColor: "#F0FDFA" },
  statusPillPending: { backgroundColor: "#FFF7ED" },
  statusPillText: { fontFamily: Fonts.bold, fontSize: sf(11), fontWeight: "700" },
  statusPillTextSigned: { color: "#0F766E" },
  statusPillTextPending: { color: "#B45309" },
  recipientDate: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  sectionLabel: {
    fontFamily: Fonts.bold, fontSize: sf(11), color: "#6A7282", fontWeight: "700",
    letterSpacing: 0.4, textTransform: "uppercase", marginBottom: sw(6),
  },
  descTitle: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#64748B", fontWeight: "700", marginBottom: sw(6) },
  description: { fontFamily: Fonts.regular, fontSize: sf(15), lineHeight: sf(22), color: "#101828" },
  pdfRow: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  pdfIcon: {
    width: sw(36), height: sw(36), borderRadius: sw(10),
    backgroundColor: "#E8F0F7", alignItems: "center", justifyContent: "center",
  },
  pdfName: { fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#101828" },
  previewPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
    marginTop: sw(12),
    paddingVertical: sw(6),
    paddingHorizontal: sw(10),
    borderRadius: sw(999),
    backgroundColor: "#F0FDFA",
  },
  preview: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#0F766E", fontWeight: "700" },
  progress: { flexDirection: "row", alignItems: "flex-start" },
  progressStep: { flex: 1, alignItems: "center", minWidth: 0, paddingHorizontal: sw(2) },
  progressDot: {
    width: sw(28), height: sw(28), borderRadius: sw(14),
    backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center",
  },
  progressDotOn: { backgroundColor: "#1B4F8A" },
  progressNum: { fontFamily: Fonts.bold, fontSize: sf(12), lineHeight: sf(16), color: "#64748B", fontWeight: "700" },
  progressNumOn: { color: "#FFFFFF" },
  progressLabel: { marginTop: sw(8), fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#94A3B8", textAlign: "center" },
  progressLabelOn: { color: "#1B4F8A" },
  progressLine: { width: sw(16), height: 2, borderRadius: 1, backgroundColor: "#E6EBF1", marginTop: sw(13) },
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
