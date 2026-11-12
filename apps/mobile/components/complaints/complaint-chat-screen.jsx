import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  AppState,
} from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../layout/internal-screen-header";
import { EmptyState, NAVY } from "./complaint-ui";
import { Colors } from "../../constants/tokens";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";
import { useComplaintBack } from "../../hooks/use-complaint-back";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { getToken, getUser } from "../../services/auth-session";
import {
  complaintDownloadPath,
  fetchAdminComplaint,
  fetchComplaint,
  postAdminComplaintMessage,
  postComplaintMessage,
} from "../../services/complaints-api";

const SYNC_MS = 4000;

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function messageSignature(complaint) {
  return (complaint?.messages ?? []).map((message) => `${message.id}:${message.body}`).join("|");
}

export default function ComplaintChatScreen({ audience = "resident", backTo }) {
  const admin = audience === "admin";
  const { id } = useLocalSearchParams();
  const goBack = useComplaintBack(backTo ?? (admin ? "/screens/admin-complaints" : "/screens/complaints"));
  const { showError } = useAppDialog();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const signatureRef = useRef("");
  const complaintRef = useRef(null);
  const [complaint, setComplaint] = useState(null);
  const [meId, setMeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState("public");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError("");
    try {
      const next = admin ? await fetchAdminComplaint(id) : await fetchComplaint(id);
      const signature = messageSignature(next);
      if (!silent || signature !== signatureRef.current || next.status !== complaintRef.current?.status) {
        signatureRef.current = signature;
        complaintRef.current = next;
        setComplaint(next);
      }
    } catch (err) {
      if (!silent) setError(err?.message || "Could not open this chat.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [admin, id]);

  useEffect(() => {
    void getUser().then((user) => setMeId(user?.id ?? null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sync = () => {
      if (AppState.currentState === "active") void load(true);
    };
    const timer = setInterval(sync, SYNC_MS);
    const sub = AppState.addEventListener("change", sync);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  const messages = useMemo(() => {
    const rows = complaint?.messages ?? [];
    if (!admin || thread === "public") return rows.filter((message) => message.visibility !== "internal");
    return rows.filter((message) => message.visibility === "internal");
  }, [admin, complaint?.messages, thread]);

  useEffect(() => {
    if (!messages.length) return;
    const handle = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(handle);
  }, [messages.length, thread]);

  const closed = complaint && ["closed", "cancelled"].includes(complaint.status);

  const openFile = async (file) => {
    try {
      const token = await getToken();
      const safeName = String(file.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
      const result = await FileSystem.downloadAsync(
        complaintDownloadPath(id, file.id, admin),
        `${FileSystem.cacheDirectory}${safeName}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "*/*" } },
      );
      if (result.status !== 200) throw new Error("Could not open this attachment.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
    } catch (err) {
      await showError("Attachment", err?.message || "Could not open this attachment.");
    }
  };

  const deliver = async (body, files = []) => {
    const text = body.trim();
    if (!text && files.length === 0) return;
    setBusy(true);
    try {
      const visibility = admin && thread === "internal" ? "internal" : "public";
      const payload = text || "Attachment added.";
      const next = admin
        ? await postAdminComplaintMessage(id, payload, visibility, files)
        : await postComplaintMessage(id, payload, files);
      signatureRef.current = messageSignature(next);
      complaintRef.current = next;
      setComplaint(next);
      if (text) setDraft("");
    } catch (err) {
      await showError("Message", err?.message || "Could not send the message.");
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      await deliver(draft, [result.assets[0]]);
    } catch (err) {
      await showError("Attachment", err?.message || "Could not add this file.");
    }
  };

  const filesFor = (messageId) => (complaint?.attachments ?? []).filter((file) => file.message_id === messageId);
  const composerInset = Math.max(insets.bottom, sw(10));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        dense
        title={complaint?.title || "Chat"}
        subtitle={complaint ? `${complaint.reference} · ${complaint.status_label}` : "Complaint"}
        onBack={goBack}
      />
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View> : null}
      {!loading && error ? (
        <EmptyState icon="alert-circle" title="Could not open this chat" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => { setLoading(true); void load(); }} />
      ) : null}
      {complaint ? (
        <View style={styles.flex}>
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {admin ? (
            <View style={styles.threads}>
              <ThreadTab label="Resident" active={thread === "public"} onPress={() => setThread("public")} />
              <ThreadTab label="Staff notes" active={thread === "internal"} onPress={() => setThread("internal")} />
            </View>
          ) : null}
          {admin && thread === "internal" ? (
            <Text style={styles.privateHint}>Only staff can see these notes. Residents are not notified.</Text>
          ) : null}
          <FlatList
            ref={listRef}
            style={styles.flex}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            ListEmptyComponent={<Text style={styles.empty}>{thread === "internal" ? "No staff notes yet." : "No messages yet."}</Text>}
            renderItem={({ item }) => {
              const mine = Number(item.sender_id) === Number(meId);
              const internal = item.visibility === "internal";
              const files = filesFor(item.id);
              return (
                <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, internal && (mine ? styles.noteMine : styles.noteOther)]}>
                    {!mine ? <Text style={styles.sender}>{item.sender_name}</Text> : null}
                    <Text style={[styles.body, mine && !internal && styles.bodyMine]}>{item.body}</Text>
                    {files.map((file) => (
                      <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.file}>
                        <Feather name="paperclip" size={sf(13)} color={mine && !internal ? "#fff" : NAVY} />
                        <Text style={[styles.fileName, mine && !internal && styles.bodyMine]} numberOfLines={1}>{file.file_name}</Text>
                      </Pressable>
                    ))}
                    <Text style={[styles.time, mine && !internal && styles.timeMine]}>{formatTime(item.created_at)}</Text>
                  </View>
                </View>
              );
            }}
          />
          </KeyboardAvoidingView>
          {closed ? (
            <View style={[styles.locked, { paddingBottom: composerInset }]}>
              <Feather name="lock" size={sf(14)} color={Colors.textMuted} />
              <Text style={styles.lockedText}>This complaint is {complaint.status_label.toLowerCase()}.</Text>
            </View>
          ) : (
            <KeyboardStickyView offset={{ closed: 0, opened: composerInset }}>
              <View style={[styles.composer, thread === "internal" && styles.composerNote, { paddingBottom: composerInset }]}>
                <Pressable disabled={busy} onPress={() => void attach()} style={styles.iconBtn} accessibilityLabel="Attach a file">
                  <Feather name="paperclip" size={sf(18)} color={NAVY} />
                </Pressable>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={thread === "internal" ? "Private note for staff" : "Write a message"}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  multiline
                />
                <Pressable
                  disabled={busy || !draft.trim()}
                  onPress={() => void deliver(draft)}
                  style={[styles.send, (!draft.trim() || busy) && styles.disabled]}
                  accessibilityLabel="Send"
                >
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={sf(16)} color="#fff" />}
                </Pressable>
              </View>
            </KeyboardStickyView>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ThreadTab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabOn]}>
      <Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  threads: { flexDirection: "row", gap: sw(8), paddingHorizontal: sw(16), paddingTop: sw(10) },
  tab: {
    flex: 1,
    minHeight: sw(36),
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  tabOn: { backgroundColor: NAVY, borderColor: NAVY },
  tabText: { fontFamily: Fonts.bold, fontSize: sf(13), color: Colors.textSecondary },
  tabTextOn: { color: "#fff" },
  privateHint: {
    marginHorizontal: sw(16),
    marginTop: sw(8),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#92400E",
  },
  list: { paddingHorizontal: sw(14), paddingTop: sw(14), paddingBottom: sw(12), flexGrow: 1 },
  empty: { marginTop: sw(48), textAlign: "center", fontFamily: Fonts.medium, fontSize: sf(13), color: Colors.textMuted },
  row: { flexDirection: "row", marginBottom: sw(8) },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: sw(18), paddingHorizontal: sw(12), paddingTop: sw(8), paddingBottom: sw(6), gap: sw(3) },
  bubbleMine: { backgroundColor: NAVY, borderBottomRightRadius: sw(4) },
  bubbleOther: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E6EDF5", borderBottomLeftRadius: sw(4) },
  noteMine: { backgroundColor: "#F59E0B" },
  noteOther: { backgroundColor: "#FFF7ED", borderColor: "#FDE68A" },
  sender: { fontFamily: Fonts.bold, fontSize: sf(11), color: NAVY },
  body: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(20), color: Colors.textPrimary },
  bodyMine: { color: "#fff" },
  time: { alignSelf: "flex-end", fontFamily: Fonts.medium, fontSize: sf(10), color: Colors.textMuted },
  timeMine: { color: "rgba(255,255,255,0.78)" },
  file: { flexDirection: "row", alignItems: "center", gap: sw(4), marginTop: sw(2) },
  fileName: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: NAVY },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: sw(8),
    paddingHorizontal: sw(12),
    paddingTop: sw(8),
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  composerNote: { backgroundColor: "#FFFBF5" },
  iconBtn: { width: sw(40), height: sw(40), alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    minHeight: sw(42),
    maxHeight: sw(110),
    borderRadius: sw(21),
    backgroundColor: "#F4F7FB",
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  send: {
    width: sw(42),
    height: sw(42),
    borderRadius: sw(21),
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingTop: sw(12),
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  lockedText: { fontFamily: Fonts.medium, fontSize: sf(13), color: Colors.textMuted },
});
