import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import PropertyQuickTile from "./property-quick-tile";
import { sw } from "../../utils/responsive";

const SCREEN_GUTTER = sw(18);
const CARD_BORDER = 2;
const MIN_COL_WIDTH = sw(72);
const CARD_PAD_TOP = sw(8);
const CARD_PAD_BOTTOM = sw(2);

/** Four equal shortcuts — fixed icon row, responsive column widths. */
export default function PropertyQuickStrip({ actions, onAction }) {
  const { width: screenWidth } = useWindowDimensions();

  const layout = useMemo(() => {
    const cardWidth = screenWidth - SCREEN_GUTTER * 2 - CARD_BORDER;
    const evenCol = Math.floor(cardWidth / actions.length);
    const needsScroll = evenCol < MIN_COL_WIDTH;
    const colWidth = needsScroll ? MIN_COL_WIDTH : evenCol;

    return { needsScroll, colWidth };
  }, [screenWidth, actions.length]);

  const tiles = actions.map((item, index) => (
    <React.Fragment key={item.id}>
      {index > 0 ? <View style={styles.divider} /> : null}
      <View
        style={
          layout.needsScroll
            ? { width: layout.colWidth, minWidth: layout.colWidth, maxWidth: layout.colWidth }
            : styles.col
        }
      >
        <PropertyQuickTile
          serviceKey={item.key}
          title={item.title}
          width={layout.needsScroll ? layout.colWidth : undefined}
          onPress={() => onAction(item.routeKey)}
        />
      </View>
    </React.Fragment>
  ));

  if (layout.needsScroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tiles}
      </ScrollView>
    );
  }

  return (
    <View style={styles.row}>
      {tiles}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    paddingTop: CARD_PAD_TOP,
    paddingBottom: CARD_PAD_BOTTOM,
  },
  col: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: CARD_PAD_TOP,
    paddingBottom: CARD_PAD_BOTTOM,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#F1F5F9",
    alignSelf: "stretch",
  },
});
