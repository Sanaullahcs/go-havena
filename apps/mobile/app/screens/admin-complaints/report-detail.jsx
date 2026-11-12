import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { STATUS_ACTION, statusColor } from "../../../components/complaints/complaint-meta";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Colors } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useComplaintBack } from "../../../hooks/use-complaint-back";
import { useAdminComplaintMode } from "../../../hooks/use-complaint-mode";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { getToken } from "../../../services/auth-session";
import { complaintDownloadPath, fetchComplaint, submitComplaintFeedback, updateComplaintStatus } from "../../../services/complaints-api";

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminTechnicalReportDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const goBack = useComplaintBack("/screens/admin-complaints");
  useAdminComplaintMode();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await fetchComplaint(id);
      setComplaint(next);
      setRating(next.feedback_rating || 0);
      setComment(next.feedback_comment || "");
    } catch (err) {
      setError(err?.message || "Could not open this report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  const maintenance = complaint?.type === "maintenance";
  const canFeedback = !maintenance && ["resolved", "closed"].includes(complaint?.status) && !complaint?.feedback_rating;

  const openFile = async (file) => {
    try {
      const token = await getToken();
      const safeName = String(file.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
      const result = await FileSystem.downloadAsync(
        complaintDownloadPath(id, file.id),
        `${FileSystem.cacheDirectory}${safeName}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "*/*" } },
      );
      if (result.status !== 200) throw new Error("Could not open this attachment.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
    } catch (err) {
      await showError("Attachment", err?.message || "Could not open this attachment.");
    }
  };

  const changeStatus = async (status) => {
    const label = STATUS_ACTION[status] || "Update report";
    const cancelling = status === "cancelled";
    const choice = await showConfirm(
      label,
      cancelling
        ? "This cancels the report for System Admin."
        : "This update is sent to System Admin.",
      {
        confirmLabel: cancelling ? "Cancel complaint" : "Confirm",
        cancelLabel: cancelling ? "Keep report" : "Cancel",
        destructive: cancelling,
      },
    );
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      setComplaint(await updateComplaintStatus(id, status));
      await showSuccess(label, "The report has been updated.");
    } catch (err) {
      await showError(label, err?.message || "Could not update this report.");
    } finally {
      setBusy(false);
    }
  };

  const saveFeedback = async () => {
    if (!rating) {
      await showError("Feedback", "Choose a rating first.");
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

  const accent = statusColor(complaint?.status);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader dense title={complaint?.reference || "My report"} subtitle="System Admin" onBack={goBack} />
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View> : null}
      {!loading && error ? (
        <EmptyState icon="alert-circle" title="Could not open this report" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} />
      ) : null}
      {complaint ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + sw(32) }]} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={[styles.pill, { backgroundColor: `${accent}1F` }]}>
              <Text style={[styles.pillText, { color: accent }]}>{complaint.status_label}</Text>
            </View>
            <Text style={styles.title}>{complaint.title}</Text>
            {complaint.description ? <Text style={styles.copy}>{complaint.description}</Text> : null}
            <Text style={styles.meta}>{complaint.category_label} · {pretty(complaint.priority)} · {complaint.support_team}</Text>
          </View>
          {(complaint.attachments ?? []).length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.chatTitle}>Attachments</Text>
              {(complaint.attachments ?? []).map((file) => (
                <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.fileRow}>
                  <Feather name="paperclip" size={sf(14)} color={NAVY} />
                  <Text style={styles.fileName} numberOfLines={1}>{file.file_name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {maintenance ? (
            <View style={styles.card}>
              <Text style={styles.copy}>This is a personal maintenance complaint. Switch to Resident Mode to update it, chat, or leave feedback.</Text>
            </View>
          ) : (
            <>
              <Pressable onPress={() => router.push({ pathname: "/screens/admin-complaints/report-chat", params: { id: String(id) } })} style={styles.chat}>
                <Feather name="message-circle" size={sf(18)} color={NAVY} />
                <View style={styles.chatCopy}>
                  <Text style={styles.chatTitle}>Chat with System Admin</Text>
                  <Text style={styles.meta}>Follow the report and reply here.</Text>
                </View>
                <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
              </Pressable>
              {(complaint.allowed_transitions ?? []).length ? (
                <View style={styles.card}>
                  <Text style={styles.chatTitle}>Resolution</Text>
                  <View style={styles.wrap}>
                    {complaint.allowed_transitions.map((status) => (
                      <Pressable key={status} disabled={busy} onPress={() => changeStatus(status)} style={[styles.action, busy && styles.disabled]}>
                        <Text style={styles.actionText}>{STATUS_ACTION[status] || pretty(status)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {canFeedback ? (
                <View style={styles.card}>
                  <Text style={styles.chatTitle}>Feedback</Text>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Pressable key={value} onPress={() => setRating(value)} style={[styles.star, rating >= value && styles.starOn]}>
                        <Feather name="star" size={sf(16)} color={rating >= value ? "#fff" : NAVY} />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput value={comment} onChangeText={setComment} placeholder="Optional comment" placeholderTextColor="#94A3B8" style={styles.comment} multiline />
                  <Pressable disabled={busy} onPress={() => void saveFeedback()} style={[styles.save, busy && styles.disabled]}>
                    <Text style={styles.saveText}>Save feedback</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: sw(16), gap: sw(12) },
  card: { backgroundColor: Colors.surface, borderRadius: sw(16), borderWidth: 1, borderColor: "#E8EEF5", padding: sw(14), gap: sw(8) },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: sw(10), paddingVertical: sw(4) },
  pillText: { fontFamily: Fonts.medium, fontSize: sf(12) },
  title: { fontFamily: Fonts.semiBold, fontSize: sf(18), lineHeight: sf(24), color: "#0F2744" },
  copy: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(20), color: Colors.textSecondary },
  meta: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#64748B" },
  chat: { flexDirection: "row", alignItems: "center", gap: sw(10), backgroundColor: Colors.surface, borderRadius: sw(16), borderWidth: 1, borderColor: "#E8EEF5", padding: sw(14) },
  chatCopy: { flex: 1 },
  chatTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F2744" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: sw(8), paddingVertical: sw(6) },
  fileName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: NAVY },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  action: { borderRadius: sw(12), backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E6EDF5", paddingHorizontal: sw(12), paddingVertical: sw(10) },
  actionText: { fontFamily: Fonts.medium, fontSize: sf(13), color: NAVY },
  stars: { flexDirection: "row", gap: sw(8) },
  star: { width: sw(36), height: sw(36), borderRadius: sw(18), alignItems: "center", justifyContent: "center", backgroundColor: "#E8F0F7" },
  starOn: { backgroundColor: NAVY },
  comment: { minHeight: sw(72), borderWidth: 1, borderColor: "#E6EDF5", borderRadius: sw(12), padding: sw(10), fontFamily: Fonts.regular, fontSize: sf(14), color: Colors.textPrimary },
  save: { height: sw(44), borderRadius: sw(12), backgroundColor: NAVY, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(14) },
  disabled: { opacity: 0.5 },
});
