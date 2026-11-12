import React, { useEffect, useState } from "react";
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
import { MAINTENANCE_CATEGORIES, TECHNICAL_CATEGORIES, PRIORITIES } from "../../../components/complaints/complaint-meta";
import { ChoiceChip, NAVY } from "../../../components/complaints/complaint-ui";
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
import { useResidentComplaintMode } from "../../../hooks/use-complaint-mode";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { useSessionUser } from "../../../hooks/use-session-user";
import { isResidentFeatureEnabled } from "../../../constants/resident-features";
import { isCommunityAdminRole } from "../../../services/community-access";
import { createComplaint, fetchComplaintUnits } from "../../../services/complaints-api";

export default function CreateComplaintScreen() {
  const router = useRouter();
  const goBack = useComplaintBack("/screens/complaints");
  useResidentComplaintMode();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const insets = useSafeAreaInsets();
  const user = useSessionUser();
  const maintenanceOn = isResidentFeatureEnabled(user, "complaints");
  const [type, setType] = useState(maintenanceOn ? "maintenance" : "technical");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [units, setUnits] = useState([]);
  const [unitState, setUnitState] = useState("loading");
  const [unitId, setUnitId] = useState("");
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchComplaintUnits().then((rows) => {
      setUnits(rows);
      if (rows.length === 1) setUnitId(String(rows[0].id));
      setUnitState("ready");
    }).catch(() => setUnitState("failed"));
  }, []);

  const maintenanceNeedsUnit = unitState === "ready" && units.length === 0;
  const canMaintenance = maintenanceOn && !maintenanceNeedsUnit;

  useEffect(() => {
    if (unitState === "loading") return;
    if (!canMaintenance && type === "maintenance") setType("technical");
  }, [canMaintenance, type, unitState]);

  const categories = type === "maintenance" ? MAINTENANCE_CATEGORIES : TECHNICAL_CATEGORIES;
  const adminTechnical = isCommunityAdminRole(user) && type === "technical";
  const showUnit = type === "maintenance" && !adminTechnical && units.length > 1;
  const categoryLabel = categories.find(([key]) => key === category)?.[1] || "";
  const priorityLabel = PRIORITIES.find(([key]) => key === priority)?.[1] || "Normal";
  const titleMessage = touched.title ? titleError(title) : "";
  const descriptionMessage = touched.description ? descriptionError(description) : "";
  const categoryMessage = touched.category && !category ? "Choose a category." : "";
  const unitMessage = touched.unit && showUnit && !unitId ? "Choose the unit this complaint is about." : "";
  const canSubmit = !busy
    && !titleError(title)
    && !descriptionError(description)
    && !!category
    && !!priority
    && !(showUnit && !unitId);

  const mark = (field) => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  const changeTitle = (value) => {
    setTitle(value);
    mark("title");
    setErrors((current) => ({ ...current, title: titleError(value) }));
  };

  const changeDescription = (value) => {
    setDescription(value);
    mark("description");
    setErrors((current) => ({ ...current, description: descriptionError(value) }));
  };

  const chooseType = (next) => {
    if (next === type) return;
    setType(next);
    setCategory("");
    setMenu(null);
    if (touched.category) setErrors((current) => ({ ...current, category: "Choose a category." }));
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
    const next = {
      category: category ? "" : "Choose a category.",
      title: titleError(title),
      description: descriptionError(description),
      unit: showUnit && !unitId ? "Choose the unit this complaint is about." : "",
    };
    setTouched({ category: true, title: true, description: true, unit: true });
    setErrors(next);
    if (Object.values(next).some(Boolean) || !canSubmit) return;
    const choice = await showConfirm(
      "Submit complaint",
      "Send this complaint to the support team?",
      { confirmLabel: "Submit complaint", cancelLabel: "Cancel" },
    );
    if (choice !== "confirm") return;
    setBusy(true);
    try {
      const created = await createComplaint({
        type,
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        unit_id: type === "maintenance" && !adminTechnical ? unitId : "",
      }, files);
      await showSuccess("Complaint submitted", "Your complaint has been sent to the support team.");
      router.replace({ pathname: "/screens/complaints/detail", params: { id: String(created.id) } });
    } catch (err) {
      await showError("Could not submit", err?.message || "Could not submit the complaint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader dense title="New complaint" onBack={goBack} />
      <KeyboardScroll
        style={styles.flex}
        footerHeight={sw(88)}
        contentContainerStyle={styles.form}
        onScrollBeginDrag={() => setMenu(null)}
      >
        <Text style={styles.lead}>Tell us what needs attention. We’ll route it to the right team.</Text>

        <View style={[styles.card, menu && styles.cardOpen]}>
          <Text style={[styles.label, styles.labelFirst]}>Type</Text>
          <View style={styles.segment}>
            <Pressable
              disabled={!canMaintenance}
              onPress={() => chooseType("maintenance")}
              style={[styles.segmentItem, type === "maintenance" && styles.segmentOn, !canMaintenance && styles.disabled]}
            >
              <Feather name="tool" size={sf(14)} color={type === "maintenance" ? NAVY : "#64748B"} />
              <Text style={[styles.segmentText, type === "maintenance" && styles.segmentTextOn]}>Maintenance</Text>
            </Pressable>
            <Pressable
              onPress={() => chooseType("technical")}
              style={[styles.segmentItem, type === "technical" && styles.segmentOn]}
            >
              <Feather name="smartphone" size={sf(14)} color={type === "technical" ? NAVY : "#64748B"} />
              <Text style={[styles.segmentText, type === "technical" && styles.segmentTextOn]}>Technical</Text>
            </Pressable>
          </View>
          {!maintenanceOn ? (
            <Text style={styles.hint}>Maintenance complaints are turned off for this community. Technical support is still available.</Text>
          ) : maintenanceNeedsUnit ? (
            <Text style={styles.hint}>Personal maintenance complaints need an approved unit. Technical support is still available.</Text>
          ) : null}

          <FormSelect
            label="Category"
            value={categoryLabel}
            placeholder="Choose a category"
            open={menu === "category"}
            options={categories.map(([id, label]) => ({ id, label }))}
            selected={category}
            error={categoryMessage || errors.category}
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
              setErrors((current) => ({ ...current, category: "" }));
              setMenu(null);
            }}
          />

          {showUnit ? (
            <>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.wrap}>
                {units.map((unit) => (
                  <ChoiceChip
                    key={unit.id}
                    label={unit.unit_number}
                    active={unitId === String(unit.id)}
                    onPress={() => {
                      setUnitId(String(unit.id));
                      mark("unit");
                      setErrors((current) => ({ ...current, unit: "" }));
                    }}
                  />
                ))}
              </View>
              {unitMessage || errors.unit ? <Text style={complaintInputStyles.error}>{unitMessage || errors.unit}</Text> : null}
            </>
          ) : null}

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
            placeholder="What happened, and where?"
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
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit complaint</Text>}
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
  segment: {
    flexDirection: "row",
    alignSelf: "stretch",
    height: sw(44),
    padding: sw(3),
    borderRadius: sw(12),
    backgroundColor: "#F1F5F9",
    gap: sw(3),
  },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(6), borderRadius: sw(10) },
  segmentOn: { backgroundColor: Colors.surface },
  segmentText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  segmentTextOn: { fontFamily: Fonts.semiBold, color: NAVY },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: sw(8) },
  hint: { marginTop: sw(8), fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: Colors.textSecondary },
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
