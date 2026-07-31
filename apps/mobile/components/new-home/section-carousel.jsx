import React, { useCallback, useMemo } from "react";
import { FlatList, View, StyleSheet } from "react-native";

/**
 * Smooth horizontal carousel for home sections.
 * fullPageSnap: one full card per screen width (hero-style paging).
 */
export default function SectionCarousel({
  data,
  renderItem,
  keyExtractor,
  cardWidth,
  screenWidth,
  gap = 10,
  peek = 0,
  fullPageSnap = false,
  itemHeight,
  style,
}) {
  const stride = fullPageSnap ? cardWidth : cardWidth + gap;

  const itemWrapStyle = useMemo(
    () => ({
      width: cardWidth,
      minWidth: cardWidth,
      maxWidth: cardWidth,
      flexShrink: 0,
      ...(itemHeight != null
        ? {
            height: itemHeight,
            minHeight: itemHeight,
            maxHeight: itemHeight,
          }
        : null),
    }),
    [cardWidth, itemHeight],
  );

  const render = useCallback(
    ({ item, index }) => (
      <View style={itemWrapStyle}>
        {renderItem({ item, index, width: cardWidth })}
      </View>
    ),
    [cardWidth, itemWrapStyle, renderItem],
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: stride,
      offset: stride * index,
      index,
    }),
    [stride],
  );

  const separator = useCallback(() => <View style={{ width: gap }} />, [gap]);

  return (
    <FlatList
      data={data}
      horizontal
      style={[styles.list, style]}
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={stride}
      snapToAlignment="start"
      disableIntervalMomentum
      nestedScrollEnabled
      bounces
      overScrollMode="never"
      removeClippedSubviews={false}
      keyExtractor={keyExtractor}
      renderItem={render}
      getItemLayout={getItemLayout}
      ItemSeparatorComponent={fullPageSnap ? undefined : separator}
      contentContainerStyle={[
        styles.content,
        !fullPageSnap && peek > 0 ? { paddingRight: peek } : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 0, flexGrow: 0, alignSelf: "stretch" },
  content: { paddingVertical: 0, alignItems: "flex-start" },
});
