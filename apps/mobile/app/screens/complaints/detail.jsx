import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import AppModal from "../../../components/layout/app-modal";
import { useKeyboardBottomOffset } from "../../../components/layout/keyboard-safe-screen";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { KeyboardScroll } from "../../../components/ui/keyboard-form";
import { STATUS_ACTION, statusColor } from "../../../components/complaints/complaint-meta";
import { EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Colors, Layout } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useComplaintBack } from "../../../hooks/use-complaint-back";
import { useResidentComplaintMode } from "../../../hooks/use-complaint-mode";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { ImageSourcePickerDialog } from "../../../providers/image-source-picker-provider";
import { pickImage, takePhoto } from "../../../utils/pickImage";
import { persistUploadAsset } from "../../../utils/upload-form-data";
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
  const { height: windowHeight } = useWindowDimensions();
  const { bottomOffset: keyboardOffset } = useKeyboardBottomOffset();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenFile, setReopenFile] = useState(null);
  const [reopenPreview, setReopenPreview] = useState(null);
  const [reopenChooserOpen, setReopenChooserOpen] = useState(false);
  const loadedId = React.useRef(null);
  const scrollRef = useRef(null);
  const reopenScrollRef = useRef(null);
  const reopenDismissReady = useRef(false);
  const reopenSubmittingRef = useRef(false);
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try {
      setComplaint(await fetchComplaint(id));
      if (quiet) setError("");
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not open this complaint.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!busy) void load(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [load, busy]);

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

  React.useEffect(() => {
    if (!reopenOpen) {
      reopenDismissReady.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      reopenDismissReady.current = true;
    }, 450);
    return () => clearTimeout(timer);
  }, [reopenOpen]);

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

  const openReopenSheet = () => {
    setReopenReason("");
    setReopenFile(null);
    setReopenPreview(null);
    setReopenChooserOpen(false);
    setReopenOpen(true);
  };

  const closeReopenSheet = () => {
    if (reopenSubmitting) return;
    Keyboard.dismiss();
    setReopenChooserOpen(false);
    setReopenPreview(null);
    setReopenOpen(false);
    setReopenReason("");
    setReopenFile(null);
  };

  const dismissReopenFromBackdrop = () => {
    if (!reopenDismissReady.current || reopenChooserOpen || reopenPreview) return;
    closeReopenSheet();
  };

  const reopenKeyboardOpen = reopenOpen && !reopenChooserOpen && keyboardOffset > 0;
  const reopenTopPad = Math.max(insets.top, sw(12)) + sw(16);
  const reopenBottomPad = reopenKeyboardOpen ? sw(12) : Math.max(insets.bottom, sw(12));
  const reopenCardMaxHeight = Math.max(
    sw(260),
    windowHeight - (reopenOpen ? keyboardOffset : 0) - reopenTopPad - reopenBottomPad,
  );

  const openReopenChooser = () => {
    if (busy) return;
    Keyboard.dismiss();
    setReopenChooserOpen(true);
  };

  const pickReopenFromSource = async (source) => {
    if (busy || (source !== "camera" && source !== "library")) return;
    setReopenChooserOpen(false);
    try {
      const photoOptions = { showError, documentPick: true, uploadBaseName: "reopen" };
      const asset = source === "camera"
        ? await takePhoto(undefined, photoOptions)
        : await pickImage(undefined, { ...photoOptions, allowCamera: false });
      if (!asset?.uri) return;
      const prepared = await persistUploadAsset(asset, "reopen");
      const next = prepared || asset;
      setReopenFile({
        ...next,
        name: next.fileName || next.name || "photo.jpg",
      });
    } catch (err) {
      await showError("Attachment", err?.message || "Could not add this photo.");
    }
  };

  const submitReopen = async () => {
    if (reopenSubmittingRef.current) return;
    const reason = reopenReason.trim();
    if (reason.length < 3) {
      await showError("Reason required", "Please tell us why the issue has not been resolved.");
      return;
    }
    reopenSubmittingRef.current = true;
    setReopenSubmitting(true);
    setBusy(true);
    try {
      const updated = await updateComplaintStatus(id, "reopened", reason, reopenFile ? [reopenFile] : []);
      Keyboard.dismiss();
      setComplaint(updated);
      setReopenChooserOpen(false);
      setReopenPreview(null);
      setReopenOpen(false);
      setReopenReason("");
      setReopenFile(null);
      void load(true);
      void showSuccess("Complaint reopened", "Your community admin has been notified and will assign staff.");
    } catch (err) {
      await showError("Reopen", err?.message || "Could not reopen this complaint.");
    } finally {
      reopenSubmittingRef.current = false;
      setReopenSubmitting(false);
      setBusy(false);
    }
  };

  const focusFeedbackComment = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    }, 280);
  };

  const changeStatus = async (status) => {
    if (reopenOpen || reopenSubmitting) return;
    if (status === "reopened") {
      openReopenSheet();
      return;
    }
    const label = STATUS_ACTION[status] || "Update complaint";
    const cancelling = status === "cancelled";
    const choice = await showConfirm(
      label,
      cancelling
        ? "This cancels the complaint for the support team."
        : "This updates the complaint for the support team.",
      {
        confirmLabel: cancelling ? "Cancel" : "Confirm",
        cancelLabel: cancelling ? "Keep" : "Cancel",
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
    if (reopenOpen || reopenSubmitting) return;
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
  const accent = complaint ? statusColor(complaint.workflow_status || complaint.status) : NAVY;
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
        <KeyboardScroll
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + sw(72) }]}
          bottomOffset={sw(48)}
          scrollEnabled={!reopenOpen}
          pointerEvents={reopenOpen ? "none" : "auto"}
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
                  <MetaCell icon="user" label="Assigned" value={complaint.assigned_staff_label || complaint.assigned_to_name || "Waiting"} muted={!(complaint.assigned_staff_label || complaint.assigned_to_name)} />
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

            {complaint.resident_chat_available !== false ? (
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
            ) : null}

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
                          onPress={() => {
                            if (status === "reopened") {
                              openReopenSheet();
                              return;
                            }
                            void changeStatus(status);
                          }}
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
                    onFocus={focusFeedbackComment}
                    placeholder="Optional comment"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.comment}
                    multiline
                  />
                  <Pressable
                    disabled={busy || reopenOpen || reopenSubmitting}
                    onPress={() => void saveFeedback()}
                    style={[styles.save, (busy || reopenOpen || reopenSubmitting) && styles.disabled]}
                  >
                    <Text style={styles.saveText}>Save feedback</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
        </KeyboardScroll>
      ) : null}

      <AppModal
        visible={reopenOpen}
        animationType="fade"
        onRequestClose={() => {
          if (!reopenDismissReady.current) return;
          if (reopenChooserOpen) {
            setReopenChooserOpen(false);
            return;
          }
          if (reopenPreview) {
            setReopenPreview(null);
            return;
          }
          closeReopenSheet();
        }}
      >
        <Pressable
          style={[
            styles.modalOverlay,
            { paddingBottom: reopenChooserOpen ? 0 : (reopenOpen ? keyboardOffset : 0) },
          ]}
          onPress={dismissReopenFromBackdrop}
          disabled={reopenChooserOpen || !!reopenPreview}
          accessibilityRole="button"
          accessibilityLabel="Dismiss reopen dialog"
        >
          {reopenChooserOpen ? (
            <ImageSourcePickerDialog
              embedded
              visible
              title="Add photo"
              message="Capture a new photo or choose one from your gallery."
              allowCamera
              allowFile={false}
              cameraFirst
              onSelect={(source) => void pickReopenFromSource(source)}
              onDismiss={() => setReopenChooserOpen(false)}
            />
          ) : (
          <View
            style={[
              styles.modalRoot,
              {
                paddingTop: reopenTopPad,
                paddingBottom: reopenBottomPad,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              style={[styles.modalCard, { maxHeight: reopenCardMaxHeight }]}
              onPress={() => {}}
            >
              <ScrollView
                ref={reopenScrollRef}
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={styles.modalIcon}>
                  <Feather name="rotate-ccw" size={sf(18)} color={NAVY} />
                </View>
                <Text style={styles.modalTitle}>Reopen Complaint</Text>
                <Text style={styles.modalSubtitle}>
                  Tell us what is still unresolved so we can reopen and review it.
                </Text>

                <Text style={styles.noteLabel}>Reason for reopening *</Text>
                <TextInput
                  value={reopenReason}
                  onChangeText={setReopenReason}
                  onFocus={() => {
                    setTimeout(() => {
                      reopenScrollRef.current?.scrollTo({ y: sw(72), animated: true });
                    }, 280);
                  }}
                  placeholder="Describe what is still unresolved"
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={styles.sheetInput}
                />

                {reopenFile ? (
                  <View style={styles.reopenAttachRow}>
                    <Pressable
                      style={styles.reopenThumbWrap}
                      onPress={() => setReopenPreview(reopenFile)}
                      accessibilityLabel="Preview attachment"
                    >
                      {String(reopenFile.mimeType || "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(reopenFile.name || reopenFile.uri || "") ? (
                        <Image source={{ uri: reopenFile.uri }} style={styles.reopenThumb} />
                      ) : (
                        <View style={styles.reopenThumbFallback}>
                          <Feather name="image" size={sf(16)} color={NAVY} />
                        </View>
                      )}
                    </Pressable>
                    <Text style={styles.reopenAttachName} numberOfLines={1}>
                      {reopenFile.name || reopenFile.fileName || "Photo"}
                    </Text>
                    <Pressable
                      onPress={() => setReopenFile(null)}
                      hitSlop={8}
                      accessibilityLabel="Remove attachment"
                      style={styles.reopenRemove}
                    >
                      <Feather name="x" size={sf(14)} color="#64748B" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    disabled={busy}
                    onPress={openReopenChooser}
                    style={[styles.sheetSecondary, busy && styles.disabled]}
                  >
                    <Feather name="paperclip" size={sf(14)} color={NAVY} />
                    <Text style={styles.sheetSecondaryText}>Add photo or file</Text>
                  </Pressable>
                )}
                <Text style={styles.attachHint}>Optional supporting photo or file</Text>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable disabled={reopenSubmitting} onPress={closeReopenSheet} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={reopenSubmitting || reopenReason.trim().length < 3}
                  onPress={() => void submitReopen()}
                  style={[
                    styles.modalConfirm,
                    (reopenSubmitting || reopenReason.trim().length < 3) && styles.modalConfirmDisabled,
                  ]}
                >
                  {reopenSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Reopen Complaint</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </View>
          )}

          {reopenPreview ? (
            <View style={styles.preview} pointerEvents="box-none">
              <Pressable onPress={() => setReopenPreview(null)} style={styles.previewClose} accessibilityLabel="Close preview">
                <Feather name="x" size={sf(22)} color="#fff" />
              </Pressable>
              {reopenPreview?.uri ? (
                <Image source={{ uri: reopenPreview.uri }} style={styles.previewImage} resizeMode="contain" />
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </AppModal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: sw(28),
    width: "100%",
  },
  modalCard: {
    alignSelf: "center",
    width: "100%",
    maxWidth: sw(360),
    flexShrink: 1,
    backgroundColor: "#fff",
    borderRadius: sw(20),
    paddingTop: sw(20),
    paddingHorizontal: sw(20),
    paddingBottom: sw(16),
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F2744",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
    }),
  },
  modalIcon: {
    alignSelf: "center",
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    backgroundColor: MIST,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  modalTitle: {
    textAlign: "center",
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    color: "#0F2744",
  },
  modalSubtitle: {
    marginTop: sw(6),
    marginBottom: sw(14),
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
    paddingHorizontal: sw(4),
  },
  modalScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  modalScrollContent: { paddingBottom: sw(2), flexGrow: 0 },
  noteLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#0F2744",
    marginBottom: sw(8),
  },
  sheetInput: {
    minHeight: sw(88),
    maxHeight: sw(120),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    backgroundColor: "#fff",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textPrimary,
    textAlignVertical: "top",
    marginBottom: sw(12),
  },
  sheetSecondary: {
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#D6E2F0",
    backgroundColor: "#fff",
    paddingHorizontal: sw(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  sheetSecondaryText: { fontFamily: Fonts.medium, fontSize: sf(14), color: NAVY },
  attachHint: {
    marginTop: sw(8),
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#94A3B8",
  },
  reopenAttachRow: {
    minHeight: sw(48),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#D6E2F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(10),
    paddingVertical: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  reopenThumbWrap: { width: sw(36), height: sw(36), borderRadius: sw(8), overflow: "hidden", backgroundColor: MIST },
  reopenThumb: { width: "100%", height: "100%" },
  reopenThumbFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  reopenAttachName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: "#163A66" },
  reopenRemove: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F6",
  },
  modalActions: { marginTop: sw(16), flexDirection: "row", gap: sw(10) },
  modalCancel: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#D6E2F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: NAVY },
  modalConfirm: {
    flex: 1.35,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(8),
  },
  modalConfirmDisabled: { backgroundColor: "#9BB0C7" },
  modalConfirmText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(13) },
  preview: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: "rgba(10, 42, 67, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewClose: {
    position: "absolute",
    top: sw(54),
    right: sw(20),
    zIndex: 2,
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  previewImage: { width: "92%", height: "72%" },
});
