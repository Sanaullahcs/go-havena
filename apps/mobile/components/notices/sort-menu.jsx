import React, { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";

const OPTIONS = [
  { id: "relevant", labelKey: "notices.sortSuggested" },
  { id: "newest", labelKey: "notices.sortNewestFirst" },
  { id: "oldest", labelKey: "notices.sortOldestFirst" },
  { id: "schedule", labelKey: "notices.sortByDateMenu" },
];

export default function NoticeSortMenu({ value, onChange }) {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const selected = OPTIONS.find((option) => option.id === value) ?? OPTIONS[0];

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const closeMenu = () => setOpen(false);

  const choose = (id) => {
    setOpen(false);
    if (id !== value) onChange(id);
  };

  const menuWidth = Math.min(sw(232), windowWidth - sw(32));
  const menuRight = Math.max(sw(12), windowWidth - (anchor.x + anchor.width));
  const belowTop = anchor.y + anchor.height + sw(6);
  const menuHeight = sw(188);
  const top =
    belowTop + menuHeight > windowHeight - sw(16) && anchor.y > menuHeight + sw(16)
      ? anchor.y - menuHeight - sw(6)
      : belowTop;

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={styles.triggerHost}>
        <Pressable
          onPress={open ? closeMenu : openMenu}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${t("notices.sortLabel")}: ${t(selected.labelKey)}`}
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        >
          <View style={styles.triggerRow}>
            <MaterialCommunityIcons name="swap-vertical" size={sf(15)} color="#475569" />
            <Text style={styles.triggerText} numberOfLines={1}>
              {t("notices.sortLabel")}:{" "}
            </Text>
            <Text style={styles.triggerValue} numberOfLines={1}>
              {t(selected.labelKey)}
            </Text>
            <Feather name="chevron-down" size={sf(15)} color="#64748B" />
          </View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMenu}
      >
        <View style={styles.layer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View
            style={[
              styles.menu,
              {
                top,
                right: menuRight,
                width: Math.max(menuWidth, anchor.width),
              },
            ]}
          >
            {OPTIONS.map((option) => {
              const active = option.id === selected.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => choose(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <View style={styles.optionRow}>
                    <View style={styles.checkSlot}>
                      {active ? <Feather name="check" size={sf(16)} color="#1B4F8A" /> : null}
                    </View>
                    <Text
                      style={[styles.optionLabel, active && styles.optionLabelActive]}
                      numberOfLines={1}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerHost: {
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  trigger: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D5DCE6",
    backgroundColor: "#FFFFFF",
  },
  triggerPressed: {
    backgroundColor: "#F8FAFC",
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    height: sw(36),
    paddingHorizontal: sw(12),
    gap: sw(4),
  },
  triggerText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#64748B",
  },
  triggerValue: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#1B4F8A",
  },
  layer: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingVertical: sw(6),
    paddingHorizontal: sw(6),
    ...rnShadow({
      color: "#0F172A",
      offset: { width: 0, height: 8 },
      opacity: 0.12,
      radius: 18,
      elevation: 10,
    }),
  },
  option: {
    borderRadius: sw(10),
  },
  optionPressed: {
    backgroundColor: "#F8FAFC",
  },
  optionRow: {
    minHeight: sw(42),
    paddingHorizontal: sw(10),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  checkSlot: {
    width: sw(18),
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#0F172A",
  },
  optionLabelActive: {
    fontFamily: Fonts.semiBold,
    color: "#1B4F8A",
  },
});
