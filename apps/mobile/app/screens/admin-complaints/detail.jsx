import React, { useCallback, useState } from "react";
import {
  View,
  Text,
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
import {
  assignComplaint,
  complaintDownloadPath,
  fetchAdminComplaint,
  updateAdminComplaintStatus,
} from "../../../services/complaints-api";

const ADMIN_STATUS = {
  ...STATUS_ACTION,
  resolved: "Mark resolved",
  closed: "Close service request",
  cancelled: "Cancel service request",
};

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminComplaintDetailScreen() {
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

  const load = useCallback(async () => {
    setError("");
    try { setComplaint(await fetchAdminComplaint(id)); }
    catch (err) { setError(err?.message || "Could not open this service request."); }
    finally { setLoading(false); }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  const openFile = async (file) => {
    try {
      const token = await getToken();
      const safeName = String(file.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
      const result = await FileSystem.downloadAsync(
        complaintDownloadPath(id, file.id, true),
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
    const label = ADMIN_STATUS[status] || "Update status";
    const cancelling = status === "cancelled";
    const choice = await showConfirm(
      label,
      cancelling
        ? "The resident is notified that this service request is cancelled."
        : "The resident is notified when the status changes.",
      {
        confirmLabel: cancelling ? "Cancel" : "Confirm",
        cancelLabel: cancelling ? "Keep" : "Cancel",
        destructive: cancelling,
      },
    );
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      setComplaint(await updateAdminComplaintStatus(id, status));
      await showSuccess(label, "The service request status has been updated.");
    } catch (err) {
      await showError(label, err?.message || "Could not update the status.");
    } finally {
      setBusy(false);
    }
  };

  const assign = async (userId, name) => {
    const choice = await showConfirm("Assign service request", `${name} will be notified.`, {
      confirmLabel: "Assign",
      cancelLabel: "Cancel",
    });
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      setComplaint(await assignComplaint(id, userId));
      await showSuccess("Service request assigned", `${name} has been notified.`);
    } catch (err) {
      await showError("Assignment", err?.message || "Could not assign this service request.");
    } finally {
      setBusy(false);
    }
  };

  const accent = statusColor(complaint?.workflow_status || complaint?.status);
  const publicMessages = (complaint?.messages ?? []).filter((message) => message.visibility === "public");
  const lastMessage = publicMessages[publicMessages.length - 1];
  const noteCount = (complaint?.messages ?? []).filter((message) => message.visibility === "internal").length;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader dense title={complaint?.reference || "Service request"} subtitle="Service request management" onBack={goBack} />
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View> : null}
      {!loading && error ? (
        <EmptyState icon="alert-circle" title="Could not open this service request" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} />
      ) : null}
      {complaint ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + sw(32) }]} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={[styles.statusPill, { backgroundColor: `${accent}1F` }]}>
              <View style={[styles.statusDot, { backgroundColor: accent }]} />
              <Text style={[styles.statusText, { color: accent }]}>{complaint.status_label}</Text>
            </View>
            <Text style={styles.title}>{complaint.title}</Text>
            {complaint.description ? <Text style={styles.copy}>{complaint.description}</Text> : null}
            <View style={styles.metaGrid}>
              <Meta icon="user" label="Resident" value={complaint.reporter_name || "Resident"} />
              <Meta icon="map-pin" label="Unit" value={complaint.unit_number ? `Unit ${complaint.unit_number}` : "Not linked"} muted={!complaint.unit_number} />
              <Meta icon="tag" label="Category" value={complaint.category_label} />
              <Meta icon="flag" label="Priority" value={pretty(complaint.priority)} tone={statusColor(complaint.priority)} />
            </View>
          </View>

          <Text style={styles.section}>Assign staff</Text>
          <View style={styles.card}>
            {(complaint.assignees ?? []).length === 0 ? (
              <Text style={styles.helper}>No staff members are available to assign.</Text>
            ) : (
              <View style={styles.wrap}>
                {(complaint.assignees ?? []).map((person) => {
                  const selected = complaint.assigned_to_user_id === person.id;
                  return (
                    <Pressable key={person.id} disabled={busy} onPress={() => assign(person.id, person.name)} style={[styles.person, selected && styles.personOn]}>
                      <Text style={[styles.personText, selected && styles.personTextOn]}>{person.label || person.name}{person.matched ? " · Suggested" : ""}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.helper}>{complaint.assigned_to_name ? `Currently assigned to ${complaint.assigned_to_name}.` : "This service request is unassigned."}</Text>
          </View>

          <Text style={styles.section}>Resolution</Text>
          <View style={styles.card}>
            {(complaint.allowed_transitions ?? []).length === 0 ? (
              <Text style={styles.helper}>No further status changes are available.</Text>
            ) : (
              <View style={styles.wrap}>
                {(complaint.allowed_transitions ?? []).map((status) => {
                  const danger = status === "cancelled";
                  return (
                    <Pressable key={status} disabled={busy} onPress={() => changeStatus(status)} style={[styles.action, danger && styles.actionDanger, busy && styles.disabled]}>
                      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{ADMIN_STATUS[status] || pretty(status)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {(complaint.attachments ?? []).length > 0 ? (
            <>
              <Text style={styles.section}>Attachments</Text>
              {(complaint.attachments ?? []).map((file) => (
                <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.fileRow}>
                  <Feather name="paperclip" size={sf(14)} color={NAVY} />
                  <Text style={styles.fileName} numberOfLines={1}>{file.file_name}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          <Text style={styles.section}>Activity</Text>
          <View style={styles.card}>
            {(complaint.events ?? []).length === 0 ? <Text style={styles.helper}>No activity yet.</Text> : null}
            {(complaint.events ?? []).map((event, index) => (
              <View key={event.id} style={[styles.event, index === 0 && styles.eventFirst]}>
                <Text style={styles.eventTitle}>{pretty(event.action)}{event.to_status ? ` · ${pretty(event.to_status)}` : ""}</Text>
                {event.note ? <Text style={styles.copy}>{event.note}</Text> : null}
                <Text style={styles.when}>{formatWhen(event.created_at)}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => router.push({ pathname: "/screens/admin-complaints/chat", params: { id: String(id) } })}
            style={styles.chatCard}
          >
            <View style={styles.chatIcon}><Feather name="message-circle" size={sf(18)} color={NAVY} /></View>
            <View style={styles.chatCopy}>
              <Text style={styles.eventTitle}>Chat and staff notes</Text>
              <Text style={styles.meta} numberOfLines={2}>{lastMessage?.body || "Message the resident, or keep a private staff note."}</Text>
              <Text style={styles.when}>{noteCount === 0 ? "No private notes yet" : noteCount === 1 ? "1 private note" : `${noteCount} private notes`}</Text>
            </View>
            <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Meta({ icon, label, value, muted, tone }) {
  return (
    <View style={styles.metaCell}>
      <View style={styles.metaLabelRow}>
        <Feather name={icon} size={sf(12)} color="#94A3B8" />
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={[styles.metaValue, muted && styles.metaMuted, tone && tone !== NAVY ? { color: tone } : null]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(14), gap: sw(10) },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
  },
  statusPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: sw(6), minHeight: sw(28), borderRadius: 999, paddingHorizontal: sw(10) },
  statusDot: { width: sw(7), height: sw(7), borderRadius: sw(4) },
  statusText: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16) },
  title: { marginTop: sw(12), fontFamily: Fonts.semiBold, fontSize: sf(18), lineHeight: sf(24), color: "#0F2744" },
  copy: { marginTop: sw(6), fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(20), color: Colors.textSecondary },
  metaGrid: { marginTop: sw(14), flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  metaCell: { flexGrow: 1, flexBasis: "46%", backgroundColor: "#F7F9FC", borderRadius: sw(12), paddingHorizontal: sw(12), paddingVertical: sw(10) },
  metaLabelRow: { flexDirection: "row", alignItems: "center", gap: sw(4) },
  metaLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  metaValue: { marginTop: sw(4), fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(18), color: "#163A66" },
  metaMuted: { color: "#94A3B8" },
  section: { marginTop: sw(8), fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#0F2744" },
  helper: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: "#5B6B7C" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  person: { borderRadius: 999, borderWidth: 1, borderColor: "#E6EDF5", backgroundColor: "#F8FAFC", paddingHorizontal: sw(12), paddingVertical: sw(8) },
  personOn: { borderColor: NAVY, backgroundColor: "#E8F0F7" },
  personText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  personTextOn: { color: NAVY },
  action: { borderRadius: sw(12), backgroundColor: NAVY, paddingHorizontal: sw(12), paddingVertical: sw(10) },
  actionDanger: { backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FECDD3" },
  actionText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#fff" },
  actionTextDanger: { color: "#E11D48" },
  disabled: { opacity: 0.5 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(44),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E8EEF5",
  },
  fileName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: NAVY },
  event: { paddingVertical: sw(8), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E8EEF5" },
  eventFirst: { borderTopWidth: 0, paddingTop: 0 },
  eventTitle: { fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(18), color: "#163A66" },
  when: { marginTop: sw(3), fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8" },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    padding: sw(12),
    borderRadius: sw(16),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E8EEF5",
  },
  chatIcon: { width: sw(36), height: sw(36), borderRadius: sw(12), backgroundColor: "#E8F0F7", alignItems: "center", justifyContent: "center" },
  chatCopy: { flex: 1 },
  meta: { marginTop: sw(3), fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#5B6B7C" },
});
