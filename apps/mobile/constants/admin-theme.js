import { StyleSheet } from "react-native";
import { Colors } from "./tokens";
import { Fonts } from "./font";
import { sf, sw } from "../utils/responsive";

/** Bottom space so scroll content clears the floating nav FAB on tab screens. */
export const ADMIN_FAB_CLEARANCE = sw(88);

/** Community admin hub — Ocean Breeze solid fills. */
export const AdminTheme = {
  screenBg: "#F4F8FD",
  surface: "#FFFFFF",
  heroBg: "#1B4F8A",
  heroBgSoft: "#F4F8FD",
  heroGlow: "rgba(20, 184, 166, 0.35)",
  accent: Colors.brandPrimaryDeep,
  accentSoft: "#D1FAF5",
  accentBorder: "rgba(20, 184, 166, 0.35)",
  text: "#1B4F8A",
  textMuted: "#64748B",
  textSecondary: "#334155",
  border: "#E2E8F0",
  borderSubtle: "#EEF2F7",
  amber: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", accent: "#F59E0B" },
  emerald: { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857", accent: "#10B981" },
  violet: { bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6", accent: "#7C3AED" },
  rose: { bg: "#FFF1F2", border: "#FECDD3", text: "#BE123C", accent: "#F43F5E" },
};

export const adminSharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AdminTheme.screenBg,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: sw(20),
    paddingTop: sw(16),
    paddingBottom: ADMIN_FAB_CLEARANCE,
    gap: sw(14),
  },
  listContent: {
    paddingHorizontal: sw(20),
    paddingTop: sw(8),
    paddingBottom: ADMIN_FAB_CLEARANCE,
  },
  toolbar: {
    paddingHorizontal: sw(20),
    paddingTop: sw(12),
    paddingBottom: sw(4),
    gap: sw(10),
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingEnd: sw(20),
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(2),
  },
  sectionAccent: {
    width: sw(3),
    height: sw(16),
    borderRadius: sw(2),
    backgroundColor: AdminTheme.accent,
  },
  card: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    padding: sw(14),
    marginBottom: sw(10),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterChip: {
    height: sw(28),
    minWidth: sw(28),
    paddingHorizontal: sw(10),
    borderRadius: 999,
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: AdminTheme.accentSoft,
    borderColor: AdminTheme.accentBorder,
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(11),
    color: AdminTheme.textMuted,
  },
  filterChipTextActive: {
    color: AdminTheme.accent,
    fontFamily: Fonts.semiBold,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    borderRadius: sw(12),
    backgroundColor: AdminTheme.surface,
    borderWidth: 1,
    borderColor: AdminTheme.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  emptyText: {
    textAlign: "center",
    marginTop: sw(40),
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: AdminTheme.textMuted,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: AdminTheme.text,
  },
});
