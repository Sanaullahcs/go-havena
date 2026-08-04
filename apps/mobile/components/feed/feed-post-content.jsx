import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { parsePostDisplayContent } from "../../services/feed-api";
import { FEED_TEXT_COLLAPSED_LINES } from "../../constants/feed-layout";
import { sw, sf } from "../../utils/responsive";

function isLongText(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  if (value.length > 240) return true;
  return value.split("\n").length > FEED_TEXT_COLLAPSED_LINES;
}

export default function FeedPostContent({
  post,
  textStyle,
  collapsedLines = FEED_TEXT_COLLAPSED_LINES,
  allowExpand = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const display = useMemo(() => parsePostDisplayContent(post), [post]);

  const bodyText = useMemo(() => {
    if (display.mainText) return display.mainText;
    if (display.isPhotoOnly) return null;
    return post?.content ?? post?.body ?? null;
  }, [display, post]);

  const showToggle = allowExpand && isLongText(bodyText);

  if (!bodyText && !display.feeling && !display.location) {
    if (display.isPhotoOnly) {
      return (
        <View style={styles.photoOnlyRow}>
          <Text style={[styles.photoOnlyText, textStyle]}>Shared a photo</Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={styles.wrap}>
      {bodyText ? (
        <>
          <Text
            style={[styles.text, textStyle]}
            numberOfLines={expanded ? undefined : collapsedLines}
          >
            {bodyText}
          </Text>
          {showToggle ? (
            <Pressable onPress={() => setExpanded((prev) => !prev)} hitSlop={8}>
              <Text style={styles.toggle}>{expanded ? "See less" : "See more"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {(display.feeling || display.location) ? (
        <View style={styles.metaRow}>
          {display.feeling ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>
                {display.feeling.emoji} {display.feeling.label}
              </Text>
            </View>
          ) : null}
          {display.location ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText} numberOfLines={1}>
                📍 {display.location}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: sw(8),
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: T.navy,
  },
  toggle: {
    marginTop: sw(4),
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: T.teal,
    fontWeight: "600",
  },
  photoOnlyRow: {
    marginBottom: sw(4),
  },
  photoOnlyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(6),
    marginTop: sw(6),
  },
  metaChip: {
    backgroundColor: T.mint,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    maxWidth: "100%",
  },
  metaChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: T.navy,
  },
});
