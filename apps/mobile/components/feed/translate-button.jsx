import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";

export default function TranslateButton({ contentLanguage, currentLanguage, onTranslate }) {
  const { t } = useTranslation();
  const [translated, setTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState(null);
  const [loading, setLoading] = useState(false);

  const effectiveLang = contentLanguage || "en";
  if (effectiveLang === currentLanguage) return null;

  const langName = t(`languages.${effectiveLang}`, { defaultValue: effectiveLang });

  const handlePress = async () => {
    if (translated) {
      setTranslated(false);
      return;
    }
    if (onTranslate) {
      setLoading(true);
      try {
        const result = await onTranslate();
        setTranslatedText(result);
      } catch {}
      setLoading(false);
    }
    setTranslated(true);
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={handlePress} hitSlop={8}>
        <Text style={styles.button}>
          {loading ? (
            <ActivityIndicator size="small" color="#8E8E8E" />
          ) : translated ? (
            t("feed.hideTranslation")
          ) : (
            t("feed.seeTranslation")
          )}
        </Text>
      </Pressable>
      {translated && translatedText ? (
        <View style={styles.translatedWrap}>
          <Text style={styles.translatedFrom}>
            {t("feed.translatedFrom", { language: langName })}
          </Text>
          <Text style={styles.translatedText}>{translatedText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: sw(4),
    marginBottom: sw(4),
  },
  button: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#8E8E8E",
    fontWeight: "600",
  },
  translatedWrap: {
    marginTop: sw(8),
    paddingStart: sw(8),
    borderStartWidth: 2,
    borderStartColor: T.border,
  },
  translatedFrom: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#8E8E8E",
    marginBottom: sw(4),
    fontWeight: "500",
  },
  translatedText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: T.navy,
  },
});
