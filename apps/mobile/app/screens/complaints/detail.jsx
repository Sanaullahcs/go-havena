import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { STATUS_ACTION, statusColor } from "../../../components/complaints/complaint-meta";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Colors, Layout } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useComplaintBack } from "../../../hooks/use-complaint-back";
import { useResidentComplaintMode } from "../../../hooks/use-complaint-mode";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { getToken } from "../../../services/auth-session";
import {
  complaintDownloadPath,
  fetchComplaint,
  submitComplaintFeedback,
  updateComplaintStatus,
} from "../../../services/complaints-api";

const MIST = "#E8F0F7";

function pretty(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSize(bytes) {
  const size = Number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime) {
  const type = String(mime || "");
  if (type.startsWith("image/")) return "image";
  if (type.includes("pdf")) return "file-text";
  return "file";
}

function statusIcon(status) {
  if (status === "in_progress") return "tool";
  if (status === "in_review") return "eye";
  if (status === "waiting_on_resident") return "clock";
  if (status === "resolved") return "check-circle";
  if (status === "reopened") return "rotate-ccw";
  if (status === "closed") return "lock";
  if (status === "cancelled") return "x-circle";
  return "inbox";
}

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const goBack = useComplaintBack("/screens/complaints");
  useResidentComplaintMode();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const loadedId = React.useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setComplaint(await fetchComplaint(id));
    } catch (err) {
      setError(err?.message || "Could not open this complaint.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    let active = true;
    getToken().then((value) => {
      if (active) setToken(value || "");
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!complaint || loadedId.current === complaint.id) return;
    loadedId.current = complaint.id;
    setRating(complaint.feedback_rating || 0);
    setComment(complaint.feedback_comment || "");
  }, [complaint]);

  const openFile = async (file) => {
    try {
      const auth = token || await getToken();
      const safeName = String(file.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
      const result = await FileSystem.downloadAsync(complaintDownloadPath(id, file.id), `${FileSystem.cacheDirectory}${safeName}`, {
        headers: { Authorization: `Bearer ${auth}`, Accept: "*/*" },
      });
      if (result.status !== 200) throw new Error("Could not open this attachment.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
    } catch (err) {
      await showError("Attachment", err?.message || "Could not open this attachment.");
    }
  };

  const changeStatus = async (status) => {
    const label = STATUS_ACTION[status] || "Update complaint";
    const cancelling = status === "cancelled";
    const choice = await showConfirm(
      label,
      cancelling
        ? "This cancels the complaint for the support team."
        : "This updates the complaint for the support team.",
      {
        confirmLabel: cancelling ? "Cancel complaint" : "Confirm",
        cancelLabel: cancelling ? "Keep complaint" : "Cancel",
        destructive: cancelling,
      },
    );
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      setComplaint(await updateComplaintStatus(id, status));
      await showSuccess(label, "The complaint has been updated.");
    } catch (err) {
      await showError(label, err?.message || "Could not update the complaint.");
    } finally {
      setBusy(false);
    }
  };

  const saveFeedback = async () => {
    if (rating < 1) {
      await showError("Feedback", "Choose a rating from 1 to 5.");
      return;
    }
    setBusy(true);
    try {
      setComplaint(await submitComplaintFeedback(id, rating, comment.trim()));
      await showSuccess("Feedback saved", "Thank you. Your rating has been sent.");
    } catch (err) {
      await showError("Feedback", err?.message || "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  };

  const canFeedback = complaint?.status === "resolved" || complaint?.status === "closed";
  const publicMessages = (complaint?.messages ?? []).filter((message) => message.visibility !== "internal");
  const lastMessage = publicMessages[publicMessages.length - 1];
  const attachments = complaint?.attachments ?? [];
  const transitions = (complaint?.allowed_transitions ?? []).filter((status) => (
    !(status === "cancelled" && complaint?.status === "in_progress")
  ));
  const accent = complaint ? statusColor(complaint.status) : NAVY;
  const unitLabel = complaint?.unit_number ? `Unit ${complaint.unit_number}` : "";
  const showUnit = unitLabel && unitLabel.toLowerCase() !== String(complaint?.description || "").trim().toLowerCase();

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader dense title={complaint?.reference || "Complaint"} onBack={goBack} />
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View> : null}
      {!loading && error && !complaint ? (
        <View style={styles.flex}>
          <EmptyState icon="alert-circle" title="Could not open this complaint" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} />
        </View>
      ) : null}
      {complaint ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + sw(48) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={[styles.heroBar, { backgroundColor: accent }]} />
              <View style={styles.heroBody}>
                <View style={[styles.statusPill, { backgroundColor: `${accent}1A` }]}>
                  <Feather name={statusIcon(complaint.status)} size={sf(13)} color={accent} />
                  <Text style={[styles.statusText, { color: accent }]}>{complaint.status_label}</Text>
                </View>
                <Text style={styles.title}>{complaint.title}</Text>
                {complaint.description ? <Text style={styles.copy}>{complaint.description}</Text> : null}
                {showUnit ? (
                  <View style={styles.unitRow}>
                    <Feather name="map-pin" size={sf(13)} color={NAVY} />
                    <Text style={styles.unitText}>{unitLabel}</Text>
                  </View>
                ) : null}
                <View style={styles.metaGrid}>
                  <MetaCell icon="tag" label="Category" value={complaint.category_label} />
                  <MetaCell icon="flag" label="Priority" value={pretty(complaint.priority)} tone={statusColor(complaint.priority)} />
                  <MetaCell icon="life-buoy" label="Support" value={complaint.support_team} />
                  <MetaCell icon="user" label="Assigned" value={complaint.assigned_to_name || "Waiting"} muted={!complaint.assigned_to_name} />
                </View>
              </View>
            </View>

            {attachments.length ? (
              <View style={styles.block}>
                <SectionHeading icon="paperclip" label="Attachments" meta={String(attachments.length)} />
                <View style={styles.stack}>
                  {attachments.map((file) => (
                    <AttachmentRow key={file.id} file={file} token={token} complaintId={id} onPress={() => void openFile(file)} />
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open chat"
              onPress={() => router.push({ pathname: "/screens/complaints/chat", params: { id: String(id) } })}
              style={styles.chatCard}
            >
              <View style={styles.chatIcon}>
                <Feather name="message-circle" size={sf(18)} color={NAVY} />
              </View>
              <View style={styles.chatCopy}>
                <View style={styles.chatTop}>
                  <Text style={styles.chatTitle}>Chat</Text>
                  <Text style={styles.chatCount}>
                    {publicMessages.length === 0 ? "No messages" : publicMessages.length === 1 ? "1 message" : `${publicMessages.length} messages`}
                  </Text>
                </View>
                <Text style={styles.chatPreview} numberOfLines={2}>
                  {lastMessage?.body || "Write to the support team."}
                </Text>
              </View>
              <View style={styles.openHint}>
                <Text style={styles.openText}>Open</Text>
                <Feather name="chevron-right" size={sf(16)} color={NAVY} />
              </View>
            </Pressable>

            {transitions.length ? (
              <View style={styles.block}>
                <SectionHeading icon="check-circle" label="Resolution" />
                <View style={styles.card}>
                  <Text style={styles.helper}>Update this complaint for you and the support team.</Text>
                  <View style={styles.actions}>
                    {transitions.map((status) => {
                      const tone = status === "cancelled" ? "danger" : status === "closed" ? "primary" : "neutral";
                      return (
                        <Pressable
                          key={status}
                          disabled={busy}
                          onPress={() => changeStatus(status)}
                          style={[styles.action, styles[`action_${tone}`], busy && styles.disabled]}
                        >
                          <Text style={[styles.actionText, styles[`actionText_${tone}`]]}>{STATUS_ACTION[status] || pretty(status)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}

            {canFeedback ? (
              <View style={styles.block}>
                <SectionHeading icon="star" label="Feedback" />
                <View style={styles.card}>
                  <Text style={styles.helper}>How was the resolution?</Text>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const on = rating >= value;
                      return (
                        <Pressable key={value} onPress={() => setRating(value)} style={[styles.star, on && styles.starOn]} accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}>
                          <Feather name="star" size={sf(16)} color={on ? "#fff" : NAVY} />
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Optional comment"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.comment}
                    multiline
                  />
                  <Pressable disabled={busy} onPress={() => void saveFeedback()} style={[styles.save, busy && styles.disabled]}>
                    <Text style={styles.saveText}>Save feedback</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

function SectionHeading({ icon, label, meta }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionTitle}>
        <View style={styles.sectionIcon}>
          <Feather name={icon} size={sf(13)} color={NAVY} />
        </View>
        <Text style={styles.section}>{label}</Text>
      </View>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

function MetaCell({ icon, label, value, muted, tone }) {
  const color = !muted && tone && tone !== NAVY ? tone : NAVY;
  return (
    <View style={styles.metaCell}>
      <View style={[styles.metaIcon, { backgroundColor: muted ? "#F1F5F9" : `${color}16` }]}>
        <Feather name={icon} size={sf(13)} color={muted ? "#94A3B8" : color} />
      </View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, muted && styles.metaMuted, !muted && tone && tone !== NAVY ? { color: tone } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function AttachmentRow({ file, token, complaintId, onPress }) {
  const isImage = String(file.mime_type || "").startsWith("image/");
  const [failed, setFailed] = useState(false);
  const showImage = isImage && !!token && !failed;
  const size = formatSize(file.file_size);

  return (
    <Pressable onPress={onPress} style={styles.fileRow} accessibilityRole="button" accessibilityLabel={`Open ${file.file_name}`}>
      {showImage ? (
        <Image
          source={{ uri: complaintDownloadPath(complaintId, file.id), headers: { Authorization: `Bearer ${token}` } }}
          style={styles.thumb}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.fileIcon}>
          <Feather name={fileIcon(file.mime_type)} size={sf(16)} color={NAVY} />
        </View>
      )}
      <View style={styles.fileCopy}>
        <Text style={styles.fileName} numberOfLines={1}>{file.file_name}</Text>
        {size ? <Text style={styles.fileMeta}>{size}</Text> : null}
      </View>
      <Feather name="download" size={sf(16)} color="#94A3B8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(16), gap: sw(22) },
  block: { gap: sw(10) },
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    overflow: "hidden",
  },
  heroBar: { height: sw(4) },
  heroBody: { paddingHorizontal: sw(16), paddingTop: sw(16), paddingBottom: sw(16) },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    paddingHorizontal: sw(16),
    paddingVertical: sw(16),
    overflow: "visible",
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    minHeight: sw(32),
    borderRadius: 999,
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
  },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(12), lineHeight: sf(18) },
  title: { marginTop: sw(14), fontFamily: Fonts.semiBold, fontSize: sf(18), lineHeight: sf(26), color: "#0F2744" },
  copy: { marginTop: sw(8), fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(22), color: Colors.textSecondary },
  unitRow: {
    alignSelf: "flex-start",
    marginTop: sw(12),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: MIST,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
  },
  unitText: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: NAVY },
  metaGrid: {
    marginTop: sw(16),
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(10),
  },
  metaCell: {
    flexGrow: 1,
    flexBasis: "46%",
    backgroundColor: "#F7F9FC",
    borderRadius: sw(14),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  metaIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabel: { marginTop: sw(8), fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(16), color: "#94A3B8" },
  metaValue: { marginTop: sw(2), fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(20), color: "#163A66" },
  metaMuted: { color: "#94A3B8" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  sectionIcon: {
    width: sw(26),
    height: sw(26),
    borderRadius: sw(8),
    backgroundColor: MIST,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontFamily: Fonts.semiBold, fontSize: sf(15), lineHeight: sf(20), color: "#0F2744" },
  sectionMeta: {
    minWidth: sw(22),
    textAlign: "center",
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: NAVY,
    backgroundColor: MIST,
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  stack: { gap: sw(8) },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    minHeight: sw(58),
    paddingHorizontal: sw(10),
    paddingVertical: sw(8),
    borderRadius: Layout.cardRadius,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E8EEF5",
  },
  thumb: { width: sw(40), height: sw(40), borderRadius: sw(8), backgroundColor: MIST },
  fileIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MIST,
  },
  fileCopy: { flex: 1, gap: 1 },
  fileName: { fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#163A66" },
  fileMeta: { fontFamily: Fonts.regular, fontSize: sf(11), lineHeight: sf(15), color: Colors.textMuted },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(16),
    borderRadius: sw(18),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E8EEF5",
  },
  chatIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    backgroundColor: MIST,
    alignItems: "center",
    justifyContent: "center",
  },
  chatCopy: { flex: 1, gap: sw(4) },
  chatTop: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  chatTitle: { fontFamily: Fonts.semiBold, fontSize: sf(15), lineHeight: sf(20), color: "#0F2744" },
  chatCount: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: Colors.textMuted },
  chatPreview: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: Colors.textSecondary },
  openHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
    backgroundColor: MIST,
    borderRadius: 999,
    paddingLeft: sw(10),
    paddingRight: sw(6),
    paddingVertical: sw(6),
  },
  openText: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: NAVY },
  helper: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: Colors.textSecondary },
  actions: { marginTop: sw(12), gap: sw(8) },
  action: {
    minHeight: sw(42),
    borderRadius: Layout.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(14),
    borderWidth: 1,
  },
  action_primary: { backgroundColor: NAVY, borderColor: NAVY },
  action_danger: { backgroundColor: Colors.surface, borderColor: "#F3C3CE" },
  action_neutral: { backgroundColor: Colors.surface, borderColor: "#D6E2F0" },
  actionText: { fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(18) },
  actionText_primary: { color: "#fff" },
  actionText_danger: { color: "#E11D48" },
  actionText_neutral: { color: NAVY },
  stars: { marginTop: sw(12), flexDirection: "row", gap: sw(8) },
  star: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#D6E2F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  starOn: { backgroundColor: NAVY, borderColor: NAVY },
  comment: {
    marginTop: sw(12),
    minHeight: sw(72),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: Layout.buttonRadius,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textPrimary,
    textAlignVertical: "top",
  },
  save: {
    marginTop: sw(12),
    minHeight: sw(44),
    borderRadius: Layout.buttonRadius,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontFamily: Fonts.medium, fontSize: sf(14) },
  disabled: { opacity: 0.55 },
});
