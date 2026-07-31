import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../constants/font";
import { useRouter } from "expo-router";
import AppModal from "../layout/app-modal";

export default function NoticeDrawer({ visible, onClose, onBackToCreate }) {
  const router = useRouter();
  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose}>
            <View style={styles.handle} />
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                if (onBackToCreate) {
                  onBackToCreate();
                }
              }}
            >
              <Image
                source={require("../../assets/images/bb-icon.png")}
                style={styles.backIcon}
              />
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>Notice Options</Text>
              <Text style={styles.subtitle}>Choose notice type</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.option, { marginBottom: 10 }]}
            onPress={() => {
              onClose();
              router.push("/screens/create-notice");
            }}
          >
            <View style={styles.optionIconWrap}>
              <Image
                source={require("../../assets/images/notice-drawer.png")}
                style={styles.optionIcon}
              />
            </View>

            <View>
              <Text style={styles.optionTitle}>Notice</Text>
              <Text style={styles.optionSubtitle}>
                General community notice
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option]}
            onPress={() => {
              onClose();
              router.push("/screens/create-alert");
            }}
          >
            <View style={styles.optionIconWrap}>
              <Image
                source={require("../../assets/images/alert-notice.png")}
                style={styles.optionIcon}
              />
            </View>

            <View>
              <Text style={styles.optionTitle}>Alert</Text>
              <Text style={styles.optionSubtitle}>Urgent community alert</Text>
            </View>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  container: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },

  handle: {
    width: 44,
    height: 4,
    borderRadius: 16,
    backgroundColor: "rgba(229, 231, 235, 1)",
    alignSelf: "center",
    marginBottom: 18,
  },

  backIcon: {
    width: 16,
    height: 16,
  },

  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 1)",
    lineHeight: 22,
    fontFamily: Fonts.bold,
  },

  subtitle: {
    fontSize: 12,
    color: "rgba(106, 114, 130, 1)",
    fontFamily: Fonts.regular,
    lineHeight: 16,
    fontWeight: "400",
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderRadius: 14,
  },

  optionIconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  optionIcon: {
    width: 36,
    height: 36,
  },

  optionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 1)",
    lineHeight: 18,
  },

  optionSubtitle: {
    fontSize: 12,
    color: "rgba(74, 85, 101, 1)",
    lineHeight: 16,
    fontWeight: "400",
    fontFamily: Fonts.medium,
  },
});
