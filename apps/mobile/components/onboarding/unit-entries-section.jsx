import React, { useEffect, useRef } from "react";
import { Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import UnitPickerField from "../ui/unit-picker-field";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { pickImage } from "../../utils/pickImage";
import { sf, sw } from "../../utils/responsive";

function isPdfAsset(asset) {
  const mime = String(asset?.mimeType ?? "").toLowerCase();
  const uri = String(asset?.uri ?? "").toLowerCase();
  return mime === "application/pdf" || uri.endsWith(".pdf");
}

function ProofUploadBox({ label, file, error, onPick, required = true }) {
  const { t } = useTranslation();
  return (
    <View style={styles.proofBlock}>
      <Text style={styles.proofLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.uploadBox, file ? styles.uploadBoxFilled : null, error ? styles.uploadBoxError : null]}
        activeOpacity={0.85}
        onPress={onPick}
      >
        {file?.uri ? (
          isPdfAsset(file) ? (
            <View style={styles.pdfPreview}>
              <Ionicons name="document-text-outline" size={28} color={T.navy} />
              <Text style={styles.uploadText} numberOfLines={1}>
                {file.fileName || t("onboarding.documentPdf")}
              </Text>
            </View>
          ) : (
            <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="contain" />
          )
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={22} color={T.teal} />
            <Text style={styles.uploadText}>{t("onboarding.uploadFile")}</Text>
          </>
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/**
 * Multi-unit onboarding block: each unit has number, residence type, and two proofs.
 */
function isBlankUnit(entry) {
  return (
    !entry?.locked &&
    !String(entry?.unit_number ?? "").trim() &&
    !entry?.residence_type &&
    !entry?.utilityFile?.uri
  );
}

export default function UnitEntriesSection({
  entries,
  onChange,
  canAdd = true,
  canRemove = true,
  maxUnits = 10,
  unitMax = 50,
  loadUnits,
  createUnit,
  errors = {},
  onTouchField,
  dialog,
  hint,
  scrollRef,
}) {
  const { t } = useTranslation();
  const cardRefs = useRef({});
  const pendingScrollKey = useRef(null);
  const addingRef = useRef(false);

  function scrollToEntry(key) {
    const card = cardRefs.current[key];
    const scroller = scrollRef?.current;
    if (!card || !scroller?.scrollTo) {
      scroller?.scrollToEnd?.({ animated: true });
      return;
    }

    const scrollNode =
      scroller.getNativeScrollRef?.() ??
      scroller.getScrollableNode?.() ??
      scroller;

    card.measureLayout(
      scrollNode,
      (_x, y) => {
        scroller.scrollTo({ y: Math.max(0, y - 12), animated: true });
      },
      () => {
        scroller.scrollToEnd?.({ animated: true });
      },
    );
  }

  useEffect(() => {
    const key = pendingScrollKey.current;
    if (!key) return undefined;
    const timer = setTimeout(() => {
      scrollToEntry(key);
      pendingScrollKey.current = null;
    }, 80);
    return () => clearTimeout(timer);
  }, [entries]);

  function updateEntry(index, patch) {
    const next = entries.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function addEntry() {
    if (addingRef.current || entries.length >= maxUnits) return;

    const last = entries[entries.length - 1];
    if (last && isBlankUnit(last)) {
      scrollToEntry(last.key);
      return;
    }

    addingRef.current = true;
    const key = `unit-${Date.now()}`;
    pendingScrollKey.current = key;
    onChange([
      ...entries,
      {
        key,
        unit_number: "",
        locked: false,
        is_new_unit: true,
        residence_type: "",
        utilityFile: null,
      },
    ]);
    setTimeout(() => {
      addingRef.current = false;
    }, 450);
  }

  function removeEntry(index) {
    if (!canRemove || entries.length <= 1) return;
    onChange(entries.filter((_, i) => i !== index));
  }

  function pickProof(index, field) {
    const prefix = `unit_${index}`;
    onTouchField?.(`${prefix}_utility`);
    pickImage(
      (file) => updateEntry(index, { [field]: file }),
      {
        allowCamera: true,
        allowFile: false,
        documentPick: true,
        uploadBaseName: field === "utilityFile" ? "utility-bill" : "unit-proof",
        promptTitle: t("onboarding.uploadDocument"),
        promptMessage: t("onboarding.uploadDocumentMsg"),
        showError: (title, message) => dialog?.showError?.(title, message),
      },
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{t("onboarding.yourUnits")}</Text>
          <Text style={styles.sectionHint}>{hint || t("onboarding.yourUnitsHint")}</Text>
        </View>
        {canAdd && entries.length < maxUnits ? (
          <TouchableOpacity style={styles.addBtn} onPress={addEntry} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>{t("onboarding.addUnit")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {entries.map((entry, index) => {
        const prefix = `unit_${index}`;
        return (
          <View
            key={entry.key || `${entry.unit_number}-${index}`}
            ref={(node) => {
              if (entry.key) cardRefs.current[entry.key] = node;
            }}
            collapsable={false}
            style={styles.card}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {t("onboarding.unitCardTitle", { n: index + 1 })}
              </Text>
              {canRemove && !entry.locked && entries.length > 1 ? (
                <TouchableOpacity onPress={() => removeEntry(index)} hitSlop={10}>
                  <Text style={styles.removeText}>{t("common.delete")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <UnitPickerField
              label={`${t("onboarding.unitNumber")} *`}
              value={String(entry.unit_number ?? "")}
              locked={Boolean(entry.locked)}
              disabled={Boolean(entry.locked)}
              placeholder={t("onboarding.unitPlaceholder")}
              unitMax={unitMax}
              error={errors[`${prefix}_number`]}
              onBlur={() => onTouchField?.(`${prefix}_number`)}
              onChange={(text) =>
                updateEntry(index, {
                  unit_number: text,
                  // Picker create/select always lands on an existing catalog unit.
                  is_new_unit: entry.locked ? entry.is_new_unit : false,
                })
              }
              loadUnits={entry.locked ? async () => [] : loadUnits}
              createUnit={entry.locked ? undefined : createUnit}
            />
            {!entry.locked ? (
              <Text style={styles.helper}>
                {t("onboarding.unitBillingHint")}
              </Text>
            ) : (
              <Text style={styles.helper}>{t("onboarding.unitAssignedByAdmin")}</Text>
            )}

            <Text style={styles.proofLabel}>
              {t("onboarding.iAmA")} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.residenceRow}>
              {["homeowner", "tenant"].map((type) => {
                const active = entry.residence_type === type;
                return (
                  <TouchableOpacity
                    key={type}
                    activeOpacity={0.85}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                    onPress={() => {
                      onTouchField?.(`${prefix}_residence`);
                      updateEntry(index, { residence_type: type });
                    }}
                  >
                    <Ionicons
                      name={type === "homeowner" ? "home-outline" : "person-outline"}
                      size={22}
                      color={active ? T.navy : T.gray}
                    />
                    <Text style={styles.typeTitle}>
                      {type === "homeowner" ? t("onboarding.homeowner") : t("onboarding.tenant")}
                    </Text>
                    <Text style={styles.typeSub}>
                      {type === "homeowner" ? t("onboarding.iOwnUnit") : t("onboarding.iRentUnit")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors[`${prefix}_residence`] ? (
              <Text style={styles.errorText}>{errors[`${prefix}_residence`]}</Text>
            ) : null}

            <ProofUploadBox
              label={t("onboarding.utilityBillProof")}
              file={entry.utilityFile}
              error={errors[`${prefix}_utility`]}
              onPick={() => pickProof(index, "utilityFile")}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sw(12) },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: T.navy,
  },
  sectionHint: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
    lineHeight: sf(17),
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.teal,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#FFF",
  },
  card: {
    borderWidth: 1,
    borderColor: "#D7E3EC",
    backgroundColor: "#F8FBFD",
    borderRadius: 16,
    padding: sw(14),
    gap: sw(10),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
  },
  removeText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  helper: {
    fontFamily: Fonts.regular,
    fontSize: sf(11.5),
    color: T.gray,
    marginTop: -4,
  },
  proofLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
  },
  required: { color: "#DC2626" },
  residenceRow: { flexDirection: "row", gap: sw(10) },
  typeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D7E3EC",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: sw(12),
    alignItems: "center",
    gap: 4,
  },
  typeCardActive: {
    borderColor: T.teal,
    backgroundColor: "#F0FDFA",
  },
  typeTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.navy,
  },
  typeSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: T.gray,
    textAlign: "center",
  },
  proofBlock: { gap: 6 },
  uploadBox: {
    minHeight: sw(88),
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#B7CBD8",
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: sw(12),
  },
  uploadBoxFilled: {
    borderStyle: "solid",
    borderColor: T.teal,
  },
  uploadBoxError: {
    borderColor: "#FCA5A5",
  },
  uploadText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.navy,
  },
  pdfPreview: { alignItems: "center", gap: 6 },
  previewImage: { width: "100%", height: sw(96), borderRadius: 8 },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
});
