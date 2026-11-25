import { Fonts } from "./font";

/** White default + mint active — schedule shortcuts, category pills, etc. */
export const selectionChipStyles = {
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(10, 42, 67, 0.12)",
  },
  chipActive: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.45)",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(74, 85, 101, 1)",
  },
  chipTextActive: {
    color: "#0D9488",
    fontFamily: Fonts.semiBold,
  },
};
