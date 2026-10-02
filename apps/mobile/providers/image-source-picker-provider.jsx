import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppModal from "../components/layout/app-modal";
import { Fonts } from "../constants/font";
import { Colors, Layout } from "../constants/tokens";
import { sf, sw } from "../utils/responsive";
import i18n from "../i18n";
import { rnShadow } from "../utils/shadow";


const SOURCE_OPTIONS = {
  view: {
    id: "view",
    labelKey: "profile.viewProfileAction",
    icon: "eye-outline",
  },
  camera: {
    id: "camera",
    labelKey: "imagePicker.camera",
    icon: "camera-outline",
  },
  library: {
    id: "library",
    labelKey: "imagePicker.gallery",
    icon: "images-outline",
  },
  file: {
    id: "file",
    labelKey: "imagePicker.files",
    icon: "document-text-outline",
  },
};

function ImageSourcePickerDialog({
  visible,
  title,
  message,
  allowView,
  allowCamera,
  allowFile,
  cameraFirst = false,
  onSelect,
  onDismiss,
}) {
  const camera = allowCamera ? SOURCE_OPTIONS.camera : null;
  const library = SOURCE_OPTIONS.library;
  const options = [
    allowView ? SOURCE_OPTIONS.view : null,
    ...(cameraFirst ? [camera, library] : [library, camera]),
    allowFile ? SOURCE_OPTIONS.file : null,
  ].filter(Boolean);

  return (
    <AppModal
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
        <View style={styles.card}>
          <View style={styles.iconRing}>
            <Ionicons name="image-outline" size={sf(32)} color={Colors.brandPrimaryDeep} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.optionBtn}
                activeOpacity={0.88}
                onPress={() => onSelect(option.id)}
              >
                <Ionicons name={option.icon} size={sf(18)} color={Colors.brandPrimaryDeep} />
                <Text style={optionLabelStyle}>
                  {i18n.t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.88}
              onPress={onDismiss}
            >
              <Text style={cancelLabelStyle}>
                {i18n.t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const showPickerRef = { current: null };
const dismissPickerRef = { current: null };

/** Force-close the picker and resolve any pending promise with null. */
export function dismissImageSourcePicker() {
  dismissPickerRef.current?.();
}

/**
 * Show themed camera / gallery / file picker.
 * @returns {Promise<"view"|"camera"|"library"|"file"|null>}
 */
export function promptImageSourceAsync({
  title = i18n.t("imagePicker.uploadPhoto"),
  message = i18n.t("imagePicker.chooseHowToAdd"),
  allowView = false,
  allowCamera = true,
  allowFile = false,
  cameraFirst = false,
} = {}) {
  if (!showPickerRef.current) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    showPickerRef.current({
      title,
      message,
      allowView,
      allowCamera,
      allowFile,
      cameraFirst,
      resolve,
    });
  });
}

export function ImageSourcePickerProvider({ children }) {
  const [config, setConfig] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((value) => {
    resolveRef.current?.(value ?? null);
    resolveRef.current = null;
    setConfig(null);
  }, []);

  useEffect(() => {
    dismissPickerRef.current = () => close(null);

    showPickerRef.current = (next) => {
      if (resolveRef.current) {
        resolveRef.current(null);
        resolveRef.current = null;
      }

      resolveRef.current = next.resolve;
      setConfig({
        title: next.title,
        message: next.message,
        allowView: next.allowView,
        allowCamera: next.allowCamera,
        allowFile: next.allowFile,
        cameraFirst: next.cameraFirst,
      });
    };

    return () => {
      showPickerRef.current = null;
      dismissPickerRef.current = null;
    };
  }, [close]);

  return (
    <>
      {children}
      {config ? (
        <ImageSourcePickerDialog
          visible
          title={config.title}
          message={config.message}
          allowView={config.allowView ?? false}
          allowCamera={config.allowCamera ?? true}
          allowFile={config.allowFile ?? false}
          cameraFirst={config.cameraFirst ?? false}
          onSelect={(source) => close(source)}
          onDismiss={() => close(null)}
        />
      ) : null}
    </>
  );
}

const optionLabelStyle = {
  flexShrink: 1,
  fontFamily: Fonts.semiBold,
  fontSize: sf(15),
  lineHeight: sf(22),
  color: Colors.brandPrimaryDeep,
  fontWeight: "600",
  textAlign: "center",
  includeFontPadding: true,
};

const cancelLabelStyle = {
  flexShrink: 1,
  fontFamily: Fonts.semiBold,
  fontSize: sf(15),
  lineHeight: sf(22),
  color: Colors.textSecondary,
  fontWeight: "600",
  textAlign: "center",
  includeFontPadding: true,
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "center",
    alignItems: "center",
    padding: sw(24),
  },
  card: {
    width: "100%",
    maxWidth: sw(340),
    backgroundColor: Colors.surface,
    borderRadius: sw(20),
    paddingHorizontal: sw(24),
    paddingTop: sw(24),
    paddingBottom: sw(20),
    alignItems: "center",
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 12 }, opacity: 0.12, radius: 24 }),
    elevation: 8,
  },
  iconRing: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(16),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    color: Colors.textPrimary,
    textAlign: "center",
    fontWeight: "700",
  },
  message: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    marginTop: sw(20),
    width: "100%",
    gap: sw(10),
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    minHeight: sw(48),
    borderRadius: Layout.buttonRadius,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.18)",
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
    overflow: "visible",
  },
  cancelBtn: {
    minHeight: sw(48),
    borderRadius: Layout.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
    overflow: "visible",
  },
});

export default ImageSourcePickerProvider;
