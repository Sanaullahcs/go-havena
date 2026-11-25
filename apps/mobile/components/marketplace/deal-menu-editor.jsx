import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import LocaleTextInput from "../ui/locale-text-input";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";
import {
  marketplaceFieldInput,
  marketplaceTextArea,
} from "../../constants/marketplace-form-fields";
import { pickImage } from "../../utils/pickImage";
import { hasFieldErrors, LIMITS, validateDealMenuItem } from "../../utils/form-validation";
import {
  createEmptyMenuItem,
  DEAL_MENU_LIMITS,
  draftFromMenuItem,
  isBlankMenuDraft,
  menuItemPreviewUri,
  mergeDraftIntoItem,
} from "../../utils/deal-menu";

const EMPTY_DRAFT = {
  name: "",
  description: "",
  price: "",
  imageFile: null,
  imageUrl: null,
};

const DealMenuEditor = forwardRef(function DealMenuEditor({
  menuImageFile,
  menuImageUrl,
  onChangeMenuImage,
  onRemoveMenuImage,
  items,
  onChangeItems,
  onFieldFocus,
  onFieldBlur,
}, ref) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef(null);
  const priceRef = useRef(null);
  const descriptionRef = useRef(null);
  const descriptionFocusedRef = useRef(false);

  const liveErrors = useMemo(() => validateDealMenuItem(draft), [draft]);
  const canSaveItem = !hasFieldErrors(liveErrors);
  const atItemLimit = (items?.length ?? 0) >= DEAL_MENU_LIMITS.maxItems;
  const menuPreview = menuImageFile?.uri || menuImageUrl;

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFormOpen(false);
    setTouched(false);
  };

  const commitDraft = () => {
    const nextItem = mergeDraftIntoItem(
      items.find((item) => item.id === editingId) ?? createEmptyMenuItem(),
      draft,
    );
    const nextItems = editingId
      ? items.map((item) => (item.id === editingId ? nextItem : item))
      : [...items, nextItem];
    onChangeItems(nextItems);
    resetForm();
    return nextItems;
  };

  useImperativeHandle(ref, () => ({
    /** Empty drafts are ignored. Started items must pass item-field validation. */
    flushPending() {
      if (!formOpen || isBlankMenuDraft(draft)) {
        resetForm();
        return { ok: true, items };
      }
      if (hasFieldErrors(validateDealMenuItem(draft))) {
        setTouched(true);
        return { ok: false, items };
      }
      return { ok: true, items: commitDraft() };
    },
  }), [commitDraft, draft, formOpen, items]);

  useEffect(() => {
    if (!formOpen) return undefined;
    const timer = setTimeout(() => onFieldFocus?.(nameRef), 80);
    return () => clearTimeout(timer);
  }, [formOpen, onFieldFocus]);

  const openAddForm = () => {
    if (atItemLimit) return;
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFormOpen(true);
    setTouched(false);
  };

  const openEditForm = (item) => {
    setDraft(draftFromMenuItem(item));
    setEditingId(item.id);
    setFormOpen(true);
    setTouched(false);
  };

  const saveItem = () => {
    setTouched(true);
    if (!canSaveItem) return;
    commitDraft();
  };

  const pickMenuImage = (onPicked) => {
    pickImage(onPicked, {
      allowCamera: true,
      allowFile: true,
      documentPick: true,
      uploadBaseName: "deal-menu",
      promptTitle: t("deals.menuImage"),
      promptMessage: t("deals.uploadMenuImage"),
    });
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>{t("deals.menu")}</Text>
      <Text style={styles.helper}>{t("deals.menuHelper")}</Text>

      <Text style={[styles.label, styles.sectionTop]}>{t("deals.menuImage")}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.uploadBox}
        onPress={() =>
          pickMenuImage((file) => {
            onChangeMenuImage(file);
          })
        }
      >
        {menuPreview ? (
          <Image
            source={{ uri: menuPreview }}
            style={styles.uploadPreview}
            contentFit="contain"
          />
        ) : (
          <>
            <Image
              source={require("../../assets/images/download-image-icon.png")}
              style={{ width: 32, height: 32 }}
            />
            <Text style={styles.uploadText}>{t("deals.uploadMenuImage")}</Text>
          </>
        )}
      </TouchableOpacity>
      {menuPreview ? (
        <View style={styles.imageActions}>
          <TouchableOpacity
            onPress={() =>
              pickMenuImage((file) => {
                onChangeMenuImage(file);
              })
            }
          >
            <Text style={styles.linkAction}>{t("common.changePhoto")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemoveMenuImage}>
            <Text style={styles.removeAction}>{t("common.removeImage")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.label, styles.sectionTop]}>{t("deals.menuItems")}</Text>
      <Text style={styles.helper}>{t("deals.menuItemsHelper")}</Text>

      {(items ?? []).map((item) => {
        const preview = menuItemPreviewUri(item);
        return (
          <View key={item.id} style={styles.itemCard}>
            {preview ? (
              <CrispImage source={preview} style={styles.itemThumb} contentFit="cover" />
            ) : (
              <View style={styles.itemThumbEmpty}>
                <Ionicons name="restaurant-outline" size={16} color="#9CA3AF" />
              </View>
            )}
            <View style={styles.itemBody}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.price ? <Text style={styles.itemPrice}>{item.price}</Text> : null}
              {item.description ? (
                <Text style={styles.itemDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity hitSlop={8} onPress={() => openEditForm(item)}>
              <Ionicons name="create-outline" size={18} color="#1B4F8A" />
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => onChangeItems(items.filter((entry) => entry.id !== item.id))}
            >
              <Ionicons name="trash-outline" size={18} color="#F04438" />
            </TouchableOpacity>
          </View>
        );
      })}

      {formOpen ? (
        <View style={styles.itemForm}>
          <View ref={nameRef} collapsable={false}>
          <Text style={styles.label}>
            {t("deals.menuItemName")} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={draft.name}
            onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
            placeholder={t("deals.menuItemNamePlaceholder")}
            placeholderTextColor="rgba(153, 161, 175, 1)"
            maxLength={LIMITS.dealMenuItemName}
            style={[styles.field, marketplaceFieldInput, touched && liveErrors.name && styles.inputError]}
            onFocus={() => onFieldFocus?.(nameRef)}
            onBlur={onFieldBlur}
          />
          {touched && liveErrors.name ? <Text style={styles.errorText}>{liveErrors.name}</Text> : null}
          </View>

          <View ref={priceRef} collapsable={false}>
          <Text style={[styles.label, styles.sectionTop]}>{t("deals.menuItemPrice")}</Text>
          <LocaleTextInput
            value={draft.price}
            onChangeText={(price) => setDraft((prev) => ({ ...prev, price }))}
            placeholder={t("deals.menuItemPricePlaceholder")}
            placeholderTextColor="rgba(153, 161, 175, 1)"
            maxLength={LIMITS.dealMenuItemPrice}
            style={[styles.field, marketplaceFieldInput, touched && liveErrors.price && styles.inputError]}
            onFocus={() => onFieldFocus?.(priceRef)}
            onBlur={onFieldBlur}
          />
          {touched && liveErrors.price ? <Text style={styles.errorText}>{liveErrors.price}</Text> : null}
          </View>

          <View ref={descriptionRef} collapsable={false}>
          <Text style={[styles.label, styles.sectionTop]}>{t("deals.menuItemDescription")}</Text>
          <LocaleTextInput
            value={draft.description}
            onChangeText={(description) => setDraft((prev) => ({ ...prev, description }))}
            placeholder={t("deals.menuItemDescriptionPlaceholder")}
            placeholderTextColor="rgba(153, 161, 175, 1)"
            maxLength={LIMITS.dealMenuItemDescription}
            multiline
            scrollEnabled
            textAlignVertical="top"
            style={[
              styles.field,
              marketplaceTextArea,
              touched && liveErrors.description && styles.inputError,
            ]}
            onFocus={() => {
              descriptionFocusedRef.current = true;
              onFieldFocus?.(descriptionRef);
            }}
            onBlur={() => {
              descriptionFocusedRef.current = false;
              onFieldBlur?.();
            }}
            onContentSizeChange={() => {
              if (descriptionFocusedRef.current) onFieldFocus?.(descriptionRef);
            }}
          />
          {touched && liveErrors.description ? (
            <Text style={styles.errorText}>{liveErrors.description}</Text>
          ) : null}
          </View>

          <Text style={[styles.label, styles.sectionTop]}>{t("deals.menuItemImage")}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.itemUploadBox}
            onPress={() =>
              pickImage(
                (file) => setDraft((prev) => ({ ...prev, imageFile: file, imageUrl: null })),
                {
                  allowCamera: true,
                  allowFile: true,
                  documentPick: true,
                  uploadBaseName: "deal-menu-item",
                  promptTitle: t("deals.menuItemImage"),
                  promptMessage: t("deals.uploadItemImage"),
                },
              )
            }
          >
            {menuItemPreviewUri(draft) ? (
              <Image
                source={{ uri: menuItemPreviewUri(draft) }}
                style={styles.uploadPreview}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.uploadText}>{t("deals.uploadItemImage")}</Text>
            )}
          </TouchableOpacity>
          {menuItemPreviewUri(draft) ? (
            <TouchableOpacity
              onPress={() => setDraft((prev) => ({ ...prev, imageFile: null, imageUrl: null }))}
            >
              <Text style={styles.removeAction}>{t("common.removeImage")}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.secondaryChip} onPress={resetForm}>
              <Text style={styles.secondaryChipText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryChip, !canSaveItem && styles.primaryChipDisabled]}
              onPress={saveItem}
              disabled={!canSaveItem}
            >
              <Text style={styles.primaryChipText}>
                {editingId ? t("deals.saveMenuItem") : t("deals.addMenuItem")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addItemBtn, atItemLimit && styles.addItemBtnDisabled]}
          onPress={openAddForm}
          disabled={atItemLimit}
        >
          <Ionicons name="add" size={18} color={atItemLimit ? "#9CA3AF" : "#1B4F8A"} />
          <Text style={[styles.addItemText, atItemLimit && styles.addItemTextDisabled]}>
            {atItemLimit
              ? t("deals.menuItemsLimit", { max: DEAL_MENU_LIMITS.maxItems })
              : t("deals.addMenuItem")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default DealMenuEditor;

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#0F172A",
    fontWeight: "700",
  },
  helper: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#667085",
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  required: {
    color: "#F04438",
  },
  sectionTop: {
    marginTop: 14,
  },
  uploadBox: {
    marginTop: 12,
    height: 108,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(209, 213, 220, 1)",
    backgroundColor: "rgba(249, 250, 251, 1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  itemUploadBox: {
    marginTop: 8,
    height: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "rgba(249, 250, 251, 1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadPreview: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  uploadText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(106, 114, 130, 1)",
    fontWeight: "500",
  },
  imageActions: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkAction: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#1B4F8A",
  },
  removeAction: {
    marginTop: 8,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#F04438",
  },
  itemCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "rgba(249, 250, 251, 1)",
    padding: 10,
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  itemThumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#111827",
    fontWeight: "700",
  },
  itemPrice: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#0F766E",
  },
  itemDesc: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#6B7280",
  },
  addItemBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(27, 79, 138, 0.28)",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addItemBtnDisabled: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  addItemText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#1B4F8A",
  },
  addItemTextDisabled: {
    color: "#9CA3AF",
  },
  itemForm: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  field: {
    marginTop: 8,
  },
  inputError: {
    borderColor: "#F04438",
    backgroundColor: "#FFF5F5",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#F04438",
    lineHeight: 16,
  },
  formActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  secondaryChip: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryChipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#4B5563",
  },
  primaryChip: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(20, 184, 166, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryChipDisabled: {
    opacity: 0.45,
  },
  primaryChipText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
