import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
  Modal,
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useNavigation, usePathname, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView as SheetKeyboardAvoidingView } from "react-native-keyboard-controller";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { staffStatusTone, statusColor } from "../../../components/complaints/complaint-meta";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { safeGoBack } from "../../../utils/app-navigation";
import { canAccessDashboard } from "../../../services/community-access";
import { isResidentWithStaff, STAFF_HOME } from "../../../constants/onboarding-routes";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { getCachedUser, getToken } from "../../../services/auth-session";
import { parseApiDate } from "../../../utils/parse-api-date";
import {
  addStaffTaskUpdate,
  complaintDownloadPath,
  fetchStaffTask,
  respondToStaffTask,
  updateStaffTaskStatus,
} from "../../../services/complaints-api";

const CARD_SHADOW = rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8 });

const STAFF_STATUS_OPTIONS = [
  { id: "pending", label: "Pending", target: "in_review", icon: "clock", color: "#D97706", bg: "#FEF6E7" },
  { id: "in_progress", label: "In Progress", target: "in_progress", icon: "play-circle", color: "#1B4F8A", bg: "#E8F1FA" },
  { id: "not_resolved", label: "Not Resolved", target: "not_resolved", icon: "alert-circle", color: "#E11D48", bg: "#FDECEC" },
  { id: "resolved", label: "Resolved", target: "resolved", icon: "check-circle", color: "#059669", bg: "#E7F8EF" },
];

function staffStatusId(status) {
  if (status === "in_progress") return "in_progress";
  if (status === "not_resolved" || status === "waiting_on_resident") return "not_resolved";
  if (status === "resolved" || status === "closed") return "resolved";
  return "pending";
}

const STATUS_TITLES = {
  submitted: "Service request opened",
  in_review: "Pending",
  in_progress: "Work started",
  waiting_on_resident: "Waiting on resident",
  not_resolved: "Not resolved",
  resolved: "Resolved",
  reopened: "Reopened",
  closed: "Closed",
  cancelled: "Cancelled",
};

const ACTION_TITLES = {
  created: "Service request submitted",
  assigned: "Staff assigned",
  reassigned: "Staff reassigned",
  accepted: "Assignment accepted",
  declined: "Assignment declined",
  unassigned: "Staff unassigned",
  message: "Work update",
  attachment: "Attachment added",
  feedback: "Resident feedback",
};

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function historyStatus(status) {
  if (status === "submitted") return "Open";
  if (status === "in_review") return "Pending";
  if (status === "not_resolved") return "Not Resolved";
  if (status === "in_progress") return "In Progress";
  if (status === "waiting_on_resident") return "Waiting on Resident";
  return pretty(status);
}

function formatWhen(value) {
  const date = parseApiDate(value) || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function dayKey(value) {
  const date = parseApiDate(value) || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function eventTitle(event) {
  if (event.action === "status_changed") return STATUS_TITLES[event.to_status] || pretty(event.to_status);
  return ACTION_TITLES[event.action] || pretty(event.action);
}

function isImage(file) {
  return String(file?.mime_type || "").startsWith("image/");
}

export default function StaffTaskDetailScreen() {
  const { id, chat } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const cached = getCachedUser();
  const residentShell = usePathname().includes("assigned-tasks");
  const staffOnly = Boolean(cached?.staff_access?.active) && !canAccessDashboard(cached);
  const fallbackPath = staffOnly
    ? STAFF_HOME
    : residentShell
      ? "/(tabs)/assigned-tasks"
      : isResidentWithStaff(cached)
        ? "/screens/staff-tasks"
        : undefined;
  const chatPath = residentShell ? "/(tabs)/assigned-tasks/chat" : "/screens/staff-tasks/chat";
  useSafeModeBack(fallbackPath);
  const goBack = () => safeGoBack(router, navigation, { fallbackPath });
  const insets = useSafeAreaInsets();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const openedChat = useRef(false);
  const sheetScrollRef = useRef(null);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyDecision, setBusyDecision] = useState("");
  const respondLock = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStatus, setSheetStatus] = useState("");
  const [sheetNote, setSheetNote] = useState("");
  const [sheetNoteError, setSheetNoteError] = useState("");
  const [tab, setTab] = useState("details");
  const [file, setFile] = useState(null);
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try { setTask(await fetchStaffTask(id)); }
    catch (err) { if (!quiet) setError(err?.message || "Could not open this task."); }
    finally { if (!quiet) setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load(false);
    void getToken().then((value) => setToken(value || ""));
    const timer = setInterval(() => { void load(true); }, 8000);
    return () => clearInterval(timer);
  }, [load]));

  useEffect(() => {
    if (chat !== "1" || !task || openedChat.current) return;
    openedChat.current = true;
    router.push({ pathname: chatPath, params: { id: String(id) } });
  }, [chat, id, router, task]);

  const pending = task?.assignment_state !== "accepted";
  const transitions = task?.allowed_transitions ?? [];
  const images = (task?.attachments ?? []).filter(isImage);
  const documents = (task?.attachments ?? []).filter((item) => !isImage(item));
  const events = useMemo(() => [...(task?.events ?? [])].reverse(), [task?.events]);

  const respond = async (decision) => {
    if (respondLock.current) return;
    respondLock.current = true;
    const declining = decision === "decline";
    const complaintId = String(Array.isArray(id) ? id[0] : id || "");
    try {
      const choice = await showConfirm(
        declining ? "Decline this task?" : "Accept this task?",
        declining ? "The community admin will be asked to assign someone else." : "You can then update the service request status.",
        { confirmLabel: declining ? "Decline" : "Accept", cancelLabel: "Cancel", destructive: declining },
      );
      if (choice !== "confirm") return;
      setBusyDecision(decision);
      setBusy(true);
      let updated = null;
      try {
        updated = await respondToStaffTask(
          complaintId,
          decision,
          declining ? "Unable to take this task." : undefined,
        );
      } catch (err) {
        // The save can finish even when the phone loses the response. Trust the
        // task record before showing an assignment error.
        updated = await fetchStaffTask(complaintId).catch(() => null);
        const settled = declining
          ? updated && !updated.assigned_to_user_id
          : updated?.assignment_state === "accepted";
        if (!settled) throw err;
      }
      if (updated) setTask(updated);
      setError("");
      setBusy(false);
      setBusyDecision("");
      if (declining) goBack();
      else showSuccess("Task accepted", "This service request is now Pending. You can update the status when you start work.");
    } catch (err) {
      setBusy(false);
      setBusyDecision("");
      showError("Assignment", err?.message || "Could not update this assignment.");
    } finally {
      respondLock.current = false;
    }
  };

  const openSheet = () => {
    setSheetStatus(staffStatusId(task?.status));
    setSheetNote("");
    setSheetNoteError("");
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (busy) return;
    setSheetStatus(staffStatusId(task?.status));
    setSheetNote("");
    setSheetNoteError("");
    setSheetOpen(false);
  };

  const changeStatus = async () => {
    const option = STAFF_STATUS_OPTIONS.find((item) => item.id === (sheetStatus || staffStatusId(task?.status)));
    if (!option) return;
    if (option.id === staffStatusId(task?.status)) {
      closeSheet();
      return;
    }
    if (!transitions.includes(option.target)) {
      await showError("Status", "That status change is not available.");
      return;
    }
    if (option.target === "not_resolved" && sheetNote.trim().length < 3) {
      setSheetNoteError("Add a short note explaining why this is not resolved.");
      await showError("Work note required", "Add a short note explaining why this is not resolved.");
      return;
    }
    setSheetNoteError("");
    setBusy(true);
    try {
      let updated = await updateStaffTaskStatus(id, option.target, sheetNote.trim() || null);
      if (file) updated = await addStaffTaskUpdate(id, sheetNote.trim() || "Completion attachment", [file]);
      setTask(updated);
      setSheetNote("");
      setSheetNoteError("");
      setFile(null);
      setSheetOpen(false);
      await showSuccess("Status updated", "The resident and community admin have been notified.");
    } catch (err) {
      await showError("Status", err?.message || "Could not update the status.");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (!result.canceled) setFile(result.assets?.[0] ?? null);
  };

  const openFile = async (item) => {
    if (isImage(item)) {
      setPreview(item);
      return;
    }
    try {
      const auth = token || await getToken();
      const safeName = String(item.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
      const result = await FileSystem.downloadAsync(
        complaintDownloadPath(id, item.id, false),
        `${FileSystem.cacheDirectory}${safeName}`,
        { headers: { Authorization: `Bearer ${auth}`, Accept: "*/*" } },
      );
      if (result.status !== 200) throw new Error("Could not open this attachment.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
    } catch (err) {
      await showError("Attachment", err?.message || "Could not open this attachment.");
    }
  };

  const openContact = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("This action is not available on this phone.");
      await Linking.openURL(url);
    } catch (err) {
      await showError("Contact", err?.message || "Could not open this contact.");
    }
  };

  const tone = staffStatusTone(task?.status, task?.workflow_status);
  const accent = tone.color;
  const place = [task?.community_region, task?.community_address].filter(Boolean).join(" · ");

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader
        title={tab === "history" ? "Service request history" : "Service request details"}
        subtitle={task?.reference || ""}
        showBack
        onBack={goBack}
      />
      {loading ? <View style={styles.center}><ActivityIndicator color={NAVY} /></View> : null}
      {!loading && error ? <EmptyState icon="alert-circle" title="Could not open this task" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} /> : null}
      {task ? (
        <View style={styles.flex}>
          <View style={styles.tabs}>
            {["details", "history"].map((item) => (
              <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabOn]}>
                <Text style={[styles.tabText, tab === item && styles.tabTextOn]}>{item === "details" ? "Details" : "History"}</Text>
              </Pressable>
            ))}
          </View>
          <KeyboardSafeScreen
            footer={tab === "details" && !pending && transitions.length ? (
              <Pressable disabled={busy} onPress={openSheet} style={styles.primary}>
                <Feather name="edit-2" size={sf(14)} color="#fff" />
                <Text style={styles.primaryText}>Update status</Text>
              </Pressable>
            ) : null}
            footerBorderless
            footerStyle={styles.statusFooter}
            contentContainerStyle={[styles.body, { paddingBottom: tab === "details" && !pending && transitions.length ? sw(8) : Math.max(insets.bottom, sw(16)) }]}
            scrollStyle={styles.flex}
          >
            <View style={styles.card}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryCopy}>
                  <Text style={styles.reference}>{task.reference}</Text>
                  <Text style={styles.title}>{task.title}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                  <Feather name="clock" size={sf(12)} color={accent} />
                  <Text style={[styles.statusText, { color: accent }]}>{task.status_label}</Text>
                </View>
              </View>
              <View style={styles.factRow}>
                {task.community_name ? <Fact icon="home" text={task.community_name} /> : null}
                {task.unit_number ? <Fact icon="hash" text={`Unit ${task.unit_number}`} /> : null}
                {task.assigned_staff_label ? <Fact icon="tool" text={task.assigned_staff_label} /> : null}
              </View>
              <View style={styles.metaRow}>
                <Meta icon="calendar" label="Reported" value={formatWhen(task.created_at)} />
                <Meta icon="user" label="Reported by" value={task.reporter_name || "Resident"} />
                <Meta icon="flag" label="Priority" value={pretty(task.priority)} tone={statusColor(task.priority)} />
              </View>
              {task.category_label ? <Text style={styles.category}>{task.category_label}</Text> : null}
            </View>

            {tab === "details" && (task.reopen_reason || task.status === "reopened") ? (
              <View style={[styles.card, styles.reopenCard]}>
                <Section icon="rotate-ccw" title="Resident reopen reason" />
                <Text style={styles.reopenCopy}>
                  {task.reopen_reason || "The resident reopened this service request. Review the history for details."}
                </Text>
                {task.reopened_by_name || task.reopened_at ? (
                  <Text style={styles.reopenMeta}>
                    {[task.reopened_by_name, formatWhen(task.reopened_at)].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {tab === "details" && (task.description || images.length || documents.length) ? (
              <View style={styles.card}>
                <Section icon="file-text" title="Service request description" />
                {task.description ? <Text style={styles.copy}>{task.description}</Text> : null}
                {images.length ? (
                  <View style={styles.thumbs}>
                    {images.map((item) => (
                      <Thumb key={item.id} item={item} complaintId={id} token={token} onPress={() => void openFile(item)} />
                    ))}
                  </View>
                ) : null}
                {documents.map((item) => (
                  <Pressable key={item.id} onPress={() => void openFile(item)} style={styles.file}>
                    <Feather name="file" size={sf(14)} color={NAVY} />
                    <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {tab === "details" ? <View style={styles.split}>
              <View style={[styles.card, styles.splitCard]}>
                <Section icon="user" title="Resident" />
                <Text style={styles.person}>{task.reporter_name || "Resident"}</Text>
                {task.unit_number ? <Info icon="home" text={`Unit ${task.unit_number}`} /> : null}
                {task.reporter_phone ? (
                  <Pressable onPress={() => void openContact(`tel:${task.reporter_phone}`)} style={styles.infoBtn}>
                    <Info icon="phone" text={task.reporter_phone} />
                  </Pressable>
                ) : null}
                {task.reporter_email ? (
                  <Pressable onPress={() => void openContact(`mailto:${task.reporter_email}`)} style={styles.infoBtn}>
                    <Info icon="mail" text={task.reporter_email} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push({ pathname: chatPath, params: { id: String(id) } })}
                  style={styles.messageBtn}
                >
                  <Text style={styles.messageText}>Chat</Text>
                  {task.unread_count > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{task.unread_count}</Text></View> : null}
                  <Feather name="chevron-right" size={sf(14)} color={NAVY} />
                </Pressable>
              </View>
              {task.community_name ? (
                <View style={[styles.card, styles.splitCard]}>
                  <Section icon="map-pin" title="Community" />
                  <Text style={styles.person}>{task.community_name}</Text>
                  {place ? <Info icon="map-pin" text={place} /> : null}
                  {task.unit_number ? <Info icon="hash" text={`Unit ${task.unit_number}`} /> : null}
                </View>
              ) : null}
            </View> : null}

            {tab === "history" && events.length ? (
              <View style={styles.card}>
                <Section icon="clock" title="Service request history" />
                {events.map((event, index) => {
                  const showDay = index === 0 || dayKey(event.created_at) !== dayKey(events[index - 1]?.created_at);
                  const last = index === events.length - 1;
                  return (
                    <View key={event.id}>
                      {showDay ? <Text style={styles.day}>{dayKey(event.created_at)}</Text> : null}
                      <View style={styles.timeline}>
                        <View style={styles.rail}>
                          <View style={[styles.dot, index === 0 && { backgroundColor: accent }]} />
                          {last ? null : <View style={styles.line} />}
                        </View>
                        <View style={styles.eventCopy}>
                          <Text style={styles.eventTitle}>{eventTitle(event)}</Text>
                          {event.from_status && event.to_status && event.from_status !== event.to_status ? (
                            <Text style={styles.eventMeta}>{historyStatus(event.from_status)} → {historyStatus(event.to_status)}</Text>
                          ) : null}
                          {event.actor_name ? <Text style={styles.eventMeta}>{event.actor_name}</Text> : null}
                          {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
                          <Text style={styles.eventTime}>{formatWhen(event.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : tab === "history" ? (
              <EmptyState icon="clock" title="No history yet" body="Updates to this service request will appear here." />
            ) : null}

            {tab === "details" && pending ? (
              <View style={styles.card}>
                <Text style={styles.sectionText}>Accept this task before updating its status.</Text>
                <View style={styles.row}>
                  <Pressable disabled={busy} onPress={() => void respond("accept")} style={styles.primary}><Text style={styles.primaryText}>{busy && busyDecision === "accept" ? "Accepting…" : "Accept"}</Text></Pressable>
                  <Pressable disabled={busy} onPress={() => void respond("decline")} style={styles.secondary}><Text style={styles.secondaryText}>{busy && busyDecision === "decline" ? "Declining…" : "Decline"}</Text></Pressable>
                </View>
              </View>
            ) : null}
          </KeyboardSafeScreen>
        </View>
      ) : null}

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet} statusBarTranslucent>
        <SheetKeyboardAvoidingView style={styles.sheetRoot} behavior="padding">
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetCopy}>
                <Text style={styles.sheetTitle}>Update Status</Text>
                <Text style={styles.sheetHint}>Choose where this service request stands now.</Text>
              </View>
              <Pressable onPress={closeSheet} accessibilityLabel="Close" style={styles.sheetClose}>
                <Feather name="x" size={sf(16)} color="#334155" />
              </Pressable>
            </View>
            <ScrollView
              ref={sheetScrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.sheetGrid}>
                {STAFF_STATUS_OPTIONS.map((option) => {
                  const savedId = staffStatusId(task?.status);
                  const selected = (sheetStatus || savedId) === option.id;
                  const enabled = option.id === savedId || transitions.includes(option.target);
                  return (
                    <Pressable
                      key={option.id}
                      disabled={!enabled}
                      onPress={() => {
                        setSheetStatus(option.id);
                        setSheetNoteError("");
                      }}
                      style={[styles.sheetOption, { borderColor: selected ? option.color : "#E6EDF5", backgroundColor: selected ? option.bg : "#FFFFFF" }, !enabled && styles.sheetOptionOff]}
                    >
                      <View style={[styles.sheetIcon, { backgroundColor: selected ? "#FFFFFF" : option.bg }]}>
                        <Feather name={option.icon} size={sf(12)} color={option.color} />
                      </View>
                      <Text style={styles.sheetOptionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {option.label}
                      </Text>
                      <View style={[styles.sheetRadio, selected && { borderColor: option.color }]}>
                        {selected ? <View style={[styles.sheetRadioDot, { backgroundColor: option.color }]} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.noteLabel}>
                {(sheetStatus || staffStatusId(task?.status)) === "not_resolved" ? "Work note *" : "Work note"}
              </Text>
              <TextInput
                value={sheetNote}
                onChangeText={(value) => {
                  setSheetNote(value);
                  if (sheetNoteError && value.trim().length >= 3) setSheetNoteError("");
                }}
                onFocus={() => {
                  setTimeout(() => sheetScrollRef.current?.scrollToEnd({ animated: true }), 280);
                }}
                placeholder={
                  (sheetStatus || staffStatusId(task?.status)) === "not_resolved"
                    ? "Explain why this is not resolved"
                    : "Optional note for the resident"
                }
                placeholderTextColor="#94A3B8"
                multiline
                style={[styles.sheetInput, sheetNoteError ? styles.sheetInputError : null]}
              />
              {sheetNoteError ? <Text style={styles.sheetNoteError}>{sheetNoteError}</Text> : null}
              <Pressable disabled={busy} onPress={() => void pickFile()} style={styles.sheetSecondary}>
                <Feather name="paperclip" size={sf(14)} color={NAVY} />
                <Text style={styles.sheetSecondaryText} numberOfLines={1}>{file?.name || "Add photo or file"}</Text>
              </Pressable>
              <Pressable
                disabled={busy || ((sheetStatus || staffStatusId(task?.status)) === "not_resolved" && sheetNote.trim().length < 3)}
                onPress={() => void changeStatus()}
                style={[
                  styles.sheetPrimary,
                  (busy || ((sheetStatus || staffStatusId(task?.status)) === "not_resolved" && sheetNote.trim().length < 3)) && styles.sheetPrimaryOff,
                ]}
              >
                <Text style={styles.sheetPrimaryText}>{busy ? "Updating…" : "Update Status"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </SheetKeyboardAvoidingView>
      </Modal>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.preview}>
          <Pressable onPress={() => setPreview(null)} style={styles.previewClose} accessibilityLabel="Close preview">
            <Feather name="x" size={sf(22)} color="#fff" />
          </Pressable>
          {preview ? (
            <Image
              source={{ uri: complaintDownloadPath(id, preview.id, false), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ icon, title }) {
  return (
    <View style={styles.sectionRow}>
      <Feather name={icon} size={sf(14)} color={NAVY} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

function Fact({ icon, text }) {
  return (
    <View style={styles.fact}>
      <Feather name={icon} size={sf(12)} color="#64748B" />
      <Text style={styles.factText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Meta({ icon, label, value, tone }) {
  return (
    <View style={styles.meta}>
      <Feather name={icon} size={sf(12)} color="#94A3B8" />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, tone ? { color: tone } : null]} numberOfLines={2}>{value || "—"}</Text>
    </View>
  );
}

function Info({ icon, text }) {
  return (
    <View style={styles.info}>
      <Feather name={icon} size={sf(13)} color="#64748B" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function Thumb({ item, complaintId, token, onPress }) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable onPress={onPress} style={styles.thumbWrap} accessibilityLabel={`Open ${item.file_name}`}>
      {failed || !token ? (
        <View style={styles.thumbFallback}><Feather name="image" size={sf(16)} color={NAVY} /></View>
      ) : (
        <Image
          source={{ uri: complaintDownloadPath(complaintId, item.id, false), headers: { Authorization: `Bearer ${token}` } }}
          style={styles.thumb}
          onError={() => setFailed(true)}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: sw(16), paddingTop: sw(14), gap: sw(12) },
  card: { backgroundColor: "#fff", borderRadius: sw(16), borderWidth: 1, borderColor: "#E6EDF5", padding: sw(14), gap: sw(8), ...CARD_SHADOW },
  reopenCard: { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
  reopenCopy: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(20), color: "#4C1D95" },
  reopenMeta: { fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#6D28D9" },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: sw(10) },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  reference: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#64748B" },
  title: { fontFamily: Fonts.bold, fontSize: sf(17), lineHeight: sf(22), color: "#0F172A" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: sw(8), paddingVertical: sw(5) },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  factRow: { flexDirection: "row", flexWrap: "wrap", gap: sw(10) },
  fact: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  factText: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#475569" },
  metaRow: { flexDirection: "row", gap: sw(8), borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: sw(10) },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  metaLabel: { fontFamily: Fonts.medium, fontSize: sf(10), color: "#94A3B8" },
  metaValue: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  category: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, backgroundColor: "#F4F8FD", paddingHorizontal: sw(8), paddingVertical: 3, fontFamily: Fonts.medium, fontSize: sf(11), color: NAVY },
  copy: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(21), color: "#334155" },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: sw(6) },
  sectionText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0F172A" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: sw(8) },
  thumbWrap: { width: sw(72), height: sw(72), borderRadius: sw(12), overflow: "hidden", backgroundColor: "#F8FAFC" },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  file: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  fileName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: NAVY },
  split: { flexDirection: "row", alignItems: "stretch", gap: sw(10) },
  splitCard: { flex: 1, minWidth: 0 },
  person: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#0F172A" },
  info: { flexDirection: "row", alignItems: "flex-start", gap: sw(6) },
  infoText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#475569" },
  infoBtn: { alignSelf: "stretch" },
  messageBtn: { marginTop: sw(4), minHeight: sw(34), borderRadius: sw(10), borderWidth: 1, borderColor: "#D7E4F2", paddingHorizontal: sw(8), flexDirection: "row", alignItems: "center", gap: 4 },
  messageText: { flex: 1, fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  unread: { minWidth: sw(16), height: sw(16), borderRadius: 99, backgroundColor: "#0F766E", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  unreadText: { fontFamily: Fonts.bold, fontSize: sf(9), color: "#fff" },
  day: { marginTop: sw(4), fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#94A3B8" },
  timeline: { flexDirection: "row", gap: sw(8) },
  rail: { width: sw(14), alignItems: "center" },
  dot: { width: sw(8), height: sw(8), borderRadius: 99, marginTop: sw(4), backgroundColor: "#CBD5E1" },
  dotOn: { backgroundColor: NAVY },
  line: { width: 1, flex: 1, backgroundColor: "#E2E8F0", marginTop: 2 },
  eventCopy: { flex: 1, minWidth: 0, paddingBottom: sw(8), gap: 1 },
  eventTitle: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#0F172A" },
  eventMeta: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  eventNote: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#334155" },
  eventTime: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  row: { flexDirection: "row", gap: sw(8) },
  primary: { flex: 1, minHeight: sw(44), borderRadius: sw(12), backgroundColor: NAVY, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: sw(10) },
  primaryText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#fff" },
  secondary: { flex: 1, minHeight: sw(44), borderRadius: sw(12), borderWidth: 1, borderColor: "#D6E0EA", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: sw(10) },
  secondaryText: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },
  tabs: { flexDirection: "row", gap: sw(8), paddingHorizontal: sw(16), paddingTop: sw(12) },
  tab: { flex: 1, height: sw(36), borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E6EDF5", alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: NAVY, borderColor: NAVY },
  tabText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#64748B" },
  tabTextOn: { color: "#fff" },
  statusFooter: { paddingHorizontal: sw(16), paddingTop: sw(8), backgroundColor: "#F4F7FB" },
  sheetRoot: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: sw(20), backgroundColor: "rgba(15, 23, 42, 0.55)" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    elevation: 0,
  },
  sheetHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sw(10), paddingHorizontal: sw(16), paddingTop: sw(16), paddingBottom: sw(4) },
  sheetCopy: { flex: 1, minWidth: 0, gap: 2 },
  sheetTitle: { fontFamily: Fonts.bold, fontSize: sf(20), color: "#0F172A" },
  sheetHint: { fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#64748B" },
  sheetClose: { width: sw(32), height: sw(32), borderRadius: sw(16), backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetScrollContent: { gap: sw(12), paddingHorizontal: sw(16), paddingTop: sw(10), paddingBottom: sw(16) },
  sheetGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: sw(10) },
  sheetOption: { width: "48.5%", minHeight: sw(52), borderRadius: sw(14), borderWidth: 1.5, paddingHorizontal: sw(6), paddingVertical: sw(8), flexDirection: "row", alignItems: "center", gap: sw(4) },
  sheetOptionOff: { opacity: 0.45 },
  sheetIcon: { width: sw(24), height: sw(24), borderRadius: sw(12), alignItems: "center", justifyContent: "center" },
  sheetOptionText: { flex: 1, minWidth: 0, fontFamily: Fonts.semiBold, fontSize: sf(11), lineHeight: sf(14), color: "#1E293B" },
  sheetRadio: { width: sw(16), height: sw(16), borderRadius: sw(8), borderWidth: 1.5, borderColor: "#D5DEE8", alignItems: "center", justifyContent: "center" },
  sheetRadioDot: { width: sw(8), height: sw(8), borderRadius: sw(4) },
  sheetInput: { minHeight: sw(68), maxHeight: sw(110), borderRadius: sw(12), borderWidth: 1, borderColor: "#E6EDF5", backgroundColor: "#FFFFFF", paddingHorizontal: sw(12), paddingVertical: sw(10), fontFamily: Fonts.regular, fontSize: sf(14), color: "#0F172A", textAlignVertical: "top" },
  sheetInputError: { borderColor: "#F3C3CE" },
  sheetNoteError: { marginTop: sw(-4), fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: "#E11D48" },
  sheetSecondary: { minHeight: sw(44), borderRadius: sw(12), backgroundColor: "#E8F1FA", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(6), paddingHorizontal: sw(12) },
  sheetSecondaryText: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(14), color: NAVY },
  sheetPrimary: { minHeight: sw(48), borderRadius: sw(14), backgroundColor: NAVY, alignItems: "center", justifyContent: "center", paddingHorizontal: sw(12) },
  sheetPrimaryOff: { opacity: 0.45 },
  sheetPrimaryText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  noteLabel: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0F172A" },
  menu: { backgroundColor: "#fff", borderRadius: sw(12), borderWidth: 1, borderColor: "#E6EDF5", overflow: "hidden", ...CARD_SHADOW },
  menuItem: { minHeight: sw(42), justifyContent: "center", paddingHorizontal: sw(14), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#EEF2F6" },
  menuText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },
  preview: { flex: 1, backgroundColor: "rgba(10, 42, 67, 0.92)", alignItems: "center", justifyContent: "center" },
  previewClose: { position: "absolute", top: sw(54), right: sw(16), zIndex: 2, width: sw(36), height: sw(36), alignItems: "center", justifyContent: "center" },
  previewImage: { width: "92%", height: "75%" },
});
