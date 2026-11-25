import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";

const METHODS = [
  { value: "single", titleKey: "feed.createPost.votingSingle", hintKey: "feed.createPost.votingSingleHint" },
  { value: "multiple", titleKey: "feed.createPost.votingMultiple", hintKey: "feed.createPost.votingMultipleHint" },
];

export default function PollVotingMethodPicker({ value = "single", onChange, disabled = false, required = false }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        {t("feed.createPost.votingMethod")}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <View style={styles.list} accessibilityRole="radiogroup">
        {METHODS.map((method) => {
          const selected = value === method.value;
          return (
            <Pressable
              key={method.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange?.(method.value)}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.copy}>
                <Text style={styles.copyTitle}>{t(method.titleKey)}</Text>
                <Text style={styles.copyHint}> {t(method.hintKey)}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: sw(14) },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
    marginBottom: sw(10),
  },
  requiredMark: {
    color: "#DC2626",
    fontFamily: Fonts.semiBold,
  },
  list: { gap: sw(10) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderWidth: 1,
    borderColor: "#D7E3EC",
    borderRadius: 16,
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    backgroundColor: "#FFFFFF",
  },
  rowSelected: {
    borderColor: T.teal,
    backgroundColor: "#F8FBFD",
  },
  radio: {
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: T.teal,
  },
  radioDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    backgroundColor: T.teal,
  },
  copy: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.navy,
  },
  copyTitle: {
    fontFamily: Fonts.semiBold,
    color: T.navy,
  },
  copyHint: {
    fontFamily: Fonts.regular,
    color: T.gray,
  },
});
