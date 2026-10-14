/**
 * Android Create Post feeling sheet.
 * Height follows the window, the grid scrolls once it no longer fits,
 * and bottom padding keeps the last row above the navigation bar.
 */
export function androidFeelingSheetMetrics({
  windowHeight,
  windowWidth,
  topInset = 0,
  bottomInset = 0,
  headerHeight,
  paddingTop,
  contentPadding,
  topGap,
  horizontalPadding,
  columnGap,
  columns = 4,
}) {
  const safeTop = Math.max(0, topInset);
  const safeBottom = Math.max(0, bottomInset);
  const maxHeight = Math.max(0, windowHeight - safeTop - topGap);
  const paddingBottom = safeBottom + contentPadding;
  const gridMaxHeight = Math.max(0, maxHeight - paddingTop - headerHeight - paddingBottom);
  const gridWidth = Math.max(0, windowWidth - horizontalPadding * 2);
  const rawCardWidth = columns > 0 ? (gridWidth - columnGap * (columns - 1)) / columns : gridWidth;
  const cardWidth = Math.floor(rawCardWidth);

  return {
    maxHeight,
    paddingBottom,
    gridMaxHeight,
    cardWidth,
  };
}
