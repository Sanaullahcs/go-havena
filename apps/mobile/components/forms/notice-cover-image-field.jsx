import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { pickImage } from "../../utils/pickImage";
import { useApiAction } from "../../hooks/use-api-action";

export default function NoticeCoverImageField({
  value,
  onChange,
  uploading = false,
  label = "Cover image",
  hint = "Optional — shown on the notice board and home screen.",
}) {
  const { showFailure } = useApiAction();

  const handlePick = async () => {
    if (uploading) return;
    const asset = await pickImage(undefined, {
      showError: (title, message) => showFailure(title, { message }),
    });
    if (asset) onChange?.(asset);
  };

  const handleRemove = () => {
    if (uploading) return;
    onChange?.(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.box, value && styles.boxFilled]}
        onPress={handlePick}
        disabled={uploading}
      >
        {uploading ? (
          <View style={styles.uploadingWrap}>
            <ActivityIndicator color="#0052DF" />
            <Text style={styles.uploadingText}>Uploading image…</Text>
          </View>
        ) : value?.uri ? (
          <>
            <Image source={{ uri: value.uri }} style={styles.preview} contentFit="cover" />
            <View style={styles.previewOverlay}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
              <Text style={styles.changeText}>Change photo</Text>
            </View>
          </>
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.iconCircle}>
              <Ionicons name="image-outline" size={22} color="#0052DF" />
            </View>
            <Text style={styles.placeholderTitle}>Add cover image</Text>
            <Text style={styles.placeholderSub}>Tap to choose from your gallery</Text>
          </View>
        )}
      </TouchableOpacity>

      {value && !uploading ? (
        <TouchableOpacity activeOpacity={0.8} onPress={handleRemove} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={14} color="#B91C1C" />
          <Text style={styles.removeText}>Remove image</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "500",
  },
  hint: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
  },
  box: {
    marginTop: 10,
    minHeight: 140,
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  boxFilled: {
    minHeight: 180,
    padding: 0,
  },
  placeholder: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 82, 223, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  placeholderTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "rgba(0, 0, 0, 1)",
  },
  placeholderSub: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
  },
  preview: {
    width: "100%",
    height: 180,
  },
  previewOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  changeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#FFFFFF",
  },
  uploadingWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  uploadingText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#64748B",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 10,
    paddingVertical: 4,
  },
  removeText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#B91C1C",
  },
});
