import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { TECHNICAL_CATEGORIES, PRIORITIES } from "../../../components/complaints/complaint-meta";
import { NAVY } from "../../../components/complaints/complaint-ui";
import {
  DESCRIPTION_MAX,
  FieldLabel,
  FormSelect,
  TITLE_MAX,
  complaintInputStyles,
  descriptionError,
  titleError,
  titleFieldText,
} from "../../../components/complaints/complaint-form-fields";
import { KeyboardFooter, KeyboardScroll } from "../../../components/ui/keyboard-form";
import { Colors } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useComplaintBack } from "../../../hooks/use-complaint-back";
import { useAdminComplaintMode } from "../../../hooks/use-complaint-mode";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { createComplaint } from "../../../services/complaints-api";

export default function AdminTechnicalReportScreen() {
  const router = useRouter();
  const goBack = useComplaintBack("/screens/admin-complaints");
  useAdminComplaintMode();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [touched, setTouched] = useState({});
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);

  const categoryLabel = TECHNICAL_CATEGORIES.find(([key]) => key === category)?.[1] || "";
  const priorityLabel = PRIORITIES.find(([key]) => key === priority)?.[1] || "Normal";
  const titleMessage = touched.title ? titleError(title) : "";
  const descriptionMessage = touched.description ? descriptionError(description) : "";
  const categoryMessage = touched.category && !category ? "Choose a category." : "";
  const canSubmit = !busy && !titleError(title) && !descriptionError(description) && !!category && !!priority;

  const mark = (field) => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  const changeTitle = (value) => {
    setTitle(value);
    mark("title");
  };

  const changeDescription = (value) => {
    setDescription(value);
    mark("description");
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"],
      });
      if (result.canceled) return;
      setFiles([...files, ...(result.assets ?? [])].slice(0, 5));
    } catch (err) {
      await showError("Attachment", err?.message || "Could not add this file.");
    }
  };

  const submit = async () => {
    setTouched({ category: true, title: true, description: true });
    if (titleError(title) || descriptionError(description) || !category || !priority || !canSubmit) return;
    const choice = await showConfirm(
      "Send to System Admin",
      "Send this technical report to System Admin?",
      { confirmLabel: "Send report", cancelLabel: "Cancel" },
    );
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      const created = await createComplaint({
        type: "technical",
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
      }, files);
      await showSuccess("Report sent", "System Admin has received this report.");
      router.replace({ pathname: "/screens/admin-complaints/report-detail", params: { id: String(created.id) } });
    } catch (err) {
      await showError("Could not send", err?.message || "Could not submit the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader dense title="Report an issue" subtitle="Sent to System Admin" onBack={goBack} />
      <KeyboardScroll
        style={styles.flex}
        footerHeight={sw(88)}
        contentContainerStyle={styles.form}
        onScrollBeginDrag={() => setMenu(null)}
      >
        <Text style={styles.lead}>This is for technical issues in the app. Community maintenance is handled from the service request queue.</Text>

        <View style={[styles.card, menu && styles.cardOpen]}>
          <FormSelect
            first
            label="Category"
            value={categoryLabel}
            placeholder="Choose a category"
            open={menu === "category"}
            options={TECHNICAL_CATEGORIES.map(([id, label, description]) => ({ id, label, description }))}
            selected={category}
            error={categoryMessage}
            onToggle={() => {
              if (menu === "category") {
                mark("category");
                setMenu(null);
                return;
              }
              setMenu("category");
            }}
            onSelect={(id) => {
              setCategory(id);
              mark("category");
              setMenu(null);
            }}
          />
          <FormSelect
            label="Priority"
            value={priorityLabel}
            open={menu === "priority"}
            options={PRIORITIES.map(([id, label]) => ({ id, label }))}
            selected={priority}
            onToggle={() => setMenu(menu === "priority" ? null : "priority")}
            onSelect={(id) => {
              setPriority(id);
              setMenu(null);
            }}
          />
        </View>

        <View style={styles.card}>
          <FieldLabel required count={title.length > 0 ? title.length : null} max={TITLE_MAX} first>Title</FieldLabel>
          <TextInput
            value={title}
            onChangeText={changeTitle}
            placeholder="Short summary"
            placeholderTextColor="#94A3B8"
            style={[titleFieldText, titleMessage && complaintInputStyles.fieldError]}
            maxLength={TITLE_MAX}
            scrollEnabled={false}
            textAlignVertical="center"
          />
          {titleMessage ? <Text style={complaintInputStyles.error}>{titleMessage}</Text> : null}

          <FieldLabel required count={description.length > 0 ? description.length : null} max={DESCRIPTION_MAX}>Description</FieldLabel>
          <TextInput
            value={description}
            onChangeText={changeDescription}
            placeholder="What is going wrong?"
            placeholderTextColor="#94A3B8"
            style={[complaintInputStyles.area, descriptionMessage && complaintInputStyles.fieldError]}
            multiline
            scrollEnabled
            maxLength={DESCRIPTION_MAX}
            textAlignVertical="top"
          />
          {descriptionMessage ? <Text style={complaintInputStyles.error}>{descriptionMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={[styles.label, styles.labelFirst]}>Attachments</Text>
          <Pressable onPress={() => void pickFile()} style={styles.attach}>
            <View style={styles.attachIcon}>
              <Feather name="upload" size={sf(16)} color={NAVY} />
            </View>
            <View style={styles.attachCopy}>
              <Text style={styles.attachText}>Add a photo or file</Text>
              <Text style={styles.attachHint}>PDF, Word, or image · up to 5 files</Text>
            </View>
          </Pressable>
          {files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={styles.fileRow}>
              <Feather name="file" size={sf(14)} color={NAVY} />
              <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              <Pressable accessibilityLabel="Remove attachment" onPress={() => setFiles(files.filter((_, item) => item !== index))} hitSlop={8}>
                <Feather name="x" size={sf(16)} color="#64748B" />
              </Pressable>
            </View>
          ))}
        </View>
      </KeyboardScroll>
      <KeyboardFooter style={[styles.footer, { paddingBottom: Math.max(insets.bottom, sw(12)) }]}>
        <Pressable disabled={!canSubmit} onPress={() => void submit()} style={[styles.submit, !canSubmit && styles.disabled]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send to System Admin</Text>}
        </Pressable>
      </KeyboardFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  flex: { flex: 1 },
  form: { paddingHorizontal: sw(18), paddingTop: sw(14), paddingBottom: sw(20), gap: sw(12) },
  lead: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(18), color: "#5B6B7C" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: sw(14),
  },
  cardOpen: { zIndex: 20, elevation: 6 },
  label: {
    marginTop: sw(12),
    marginBottom: sw(8),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: "#0F2744",
  },
  labelFirst: { marginTop: 0 },
  attach: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    minHeight: sw(64),
    paddingHorizontal: sw(12),
    borderRadius: sw(14),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C5D4E8",
    backgroundColor: "#F8FAFC",
  },
  attachIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  attachCopy: { flex: 1 },
  attachText: { fontFamily: Fonts.semiBold, color: NAVY, fontSize: sf(13) },
  attachHint: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(11), color: "#94A3B8" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(42),
    marginTop: sw(8),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E6EDF5",
  },
  fileName: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  footer: {
    paddingHorizontal: sw(18),
    paddingTop: sw(10),
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  submit: { height: sw(48), borderRadius: sw(14), backgroundColor: NAVY, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(15) },
  disabled: { opacity: 0.5 },
});
