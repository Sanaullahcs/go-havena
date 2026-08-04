import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import ProfilePhotoAvatar from "../profile/profile-photo-avatar";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

const STATUS_META = {
  head: { label: "Head", bg: "#D1FAF5", color: "#0A2A43", border: "rgba(20, 184, 166, 0.28)" },
  active: { label: "Active", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  pending: { label: "Pending", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  suspended: { label: "Suspended", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  blocked: { label: "Blocked", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
};

const TONE_COLOR = {
  default: "#475569",
  primary: "#0A2A43",
  success: "#059669",
  danger: "#DC2626",
};

function resolveStatus(member) {
  if (member.role === "head") return "head";
  return member.status ?? "active";
}

function MemberActionsDropdown({ actions, disabled = false }) {
  const triggerRef = useRef(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const itemWidth = sw(72);
  const menuWidth = Math.min(
    windowWidth - sw(24),
    Math.max(sw(280), actions.length * itemWidth + sw(16)),
  );
  const estimatedMenuHeight = sw(72);

  const closeMenu = () => setOpen(false);

  const toggleMenu = () => {
    if (disabled) return;
    if (open) {
      closeMenu();
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const runAction = (action) => {
    closeMenu();
    requestAnimationFrame(() => {
      action.onPress?.();
    });
  };

  const left = Math.min(
    Math.max(sw(12), anchor.x + anchor.width - menuWidth),
    windowWidth - menuWidth - sw(12),
  );
  const belowTop = anchor.y + anchor.height + sw(6);
  const aboveTop = anchor.y - estimatedMenuHeight - sw(6);
  const top =
    belowTop + estimatedMenuHeight > windowHeight - sw(24) && aboveTop > sw(24)
      ? aboveTop
      : belowTop;

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          style={[styles.menuTrigger, open && styles.menuTriggerOpen, disabled && styles.menuTriggerDisabled]}
          onPress={toggleMenu}
          disabled={disabled}
          hitSlop={8}
          accessibilityLabel="Member options"
        >
          <Feather name="more-horizontal" size={sf(16)} color={open ? "#0A2A43" : "#64748B"} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.menuLayer}>
          {/* Full-screen dismiss layer */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeMenu} />

          {/* Keep 3-dots tappable while open so it toggles closed */}
          <Pressable
            style={[
              styles.triggerHotspot,
              {
                top: anchor.y,
                left: anchor.x,
                width: Math.max(anchor.width, sw(32)),
                height: Math.max(anchor.height, sw(32)),
              },
            ]}
            onPress={closeMenu}
            accessibilityLabel="Close member options"
          />

          <View style={[styles.dropdown, { top, left, width: menuWidth }]}>
            <View style={styles.dropdownRow}>
              {actions.map((action) => {
                const color = TONE_COLOR[action.tone] ?? TONE_COLOR.default;
                return (
                  <Pressable
                    key={action.id ?? action.label}
                    style={styles.dropdownItem}
                    onPress={() => runAction(action)}
                  >
                    <View style={[styles.dropdownIconWrap, { backgroundColor: `${color}14` }]}>
                      <Feather name={action.icon} size={sf(15)} color={color} />
                    </View>
                    <Text style={[styles.dropdownItemText, { color }]} numberOfLines={1}>
                      {action.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function FamilyMemberCard({
  member,
  isHeadViewer = false,
  onSuspend,
  onUnsuspend,
  onRemove,
  onBlock,
  onViewProfile,
  busy = false,
}) {
  const user = member.user ?? {};
  const statusKey = resolveStatus(member);
  const status = STATUS_META[statusKey] ?? STATUS_META.active;
  const canManage =
    isHeadViewer && member.role !== "head" && statusKey !== "pending";

  const menuActions = useMemo(() => {
    if (!canManage) return [];

    return [
      statusKey === "suspended"
        ? {
            id: "restore",
            label: "Restore",
            icon: "play-circle",
            tone: "success",
            onPress: () => onUnsuspend?.(member),
          }
        : {
            id: "suspend",
            label: "Suspend",
            icon: "pause-circle",
            tone: "default",
            onPress: () => onSuspend?.(member),
          },
      {
        id: "profile",
        label: "Profile",
        icon: "user",
        tone: "primary",
        onPress: () => onViewProfile?.(member),
      },
      {
        id: "remove",
        label: "Remove",
        icon: "user-minus",
        tone: "danger",
        onPress: () => onRemove?.(member),
      },
      {
        id: "block",
        label: "Block",
        icon: "slash",
        tone: "danger",
        onPress: () => onBlock?.(member),
      },
    ];
  }, [canManage, statusKey, member, onSuspend, onUnsuspend, onRemove, onBlock, onViewProfile]);

  const metaParts = [
    user.unit_number ? `Unit ${user.unit_number}` : null,
    member.relationship || null,
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <ProfilePhotoAvatar avatarUrl={user.avatar_url} size={sw(36)} />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name ?? "Member"}
          </Text>
          {metaParts.length > 0 ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>
          <View style={[styles.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
          {canManage ? (
            <MemberActionsDropdown actions={menuActions} disabled={busy} />
          ) : onViewProfile ? (
            <Pressable
              style={styles.viewProfileIconBtn}
              onPress={() => onViewProfile(member)}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel="View profile"
            >
              <Feather name="user" size={sf(14)} color="#0A2A43" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function FamilyHeroCard({ familyNumber, onCopy, onShare }) {
  return (
    <View
      style={styles.hero}
    >
      <View style={styles.heroIcon}>
        <Feather name="users" size={sf(22)} color="#0A2A43" />
      </View>
      <Text style={styles.heroLabel}>Family Number</Text>
      <Text style={styles.heroNumber} selectable>
        {familyNumber}
      </Text>
      <Text style={styles.heroHint}>Share this code so neighbors can request to join your family.</Text>
      <View style={styles.heroActions}>
        <Pressable style={styles.heroBtn} onPress={onCopy}>
          <Feather name="copy" size={sf(14)} color="#0A2A43" />
          <Text style={styles.heroBtnText}>Copy</Text>
        </Pressable>
        <Pressable style={[styles.heroBtn, styles.heroBtnGhost]} onPress={onShare}>
          <Feather name="share-2" size={sf(14)} color="#FFFFFF" />
          <Text style={[styles.heroBtnText, styles.heroBtnTextGhost]}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(12),
    paddingVertical: sw(10),
    paddingHorizontal: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  copy: { flex: 1, minWidth: 0 },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 0,
  },
  name: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
    lineHeight: sf(18),
  },
  meta: {
    marginTop: sw(1),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
    lineHeight: sf(14),
  },
  badge: {
    paddingHorizontal: sw(8),
    paddingVertical: sw(2),
    borderRadius: sw(999),
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
  },
  menuTrigger: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  menuTriggerOpen: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  menuTriggerDisabled: {
    opacity: 0.5,
  },
  viewProfileIconBtn: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLayer: {
    flex: 1,
  },
  triggerHotspot: {
    position: "absolute",
    zIndex: 2,
  },
  dropdown: {
    position: "absolute",
    zIndex: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: sw(8),
    paddingHorizontal: sw(6),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  dropdownItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(8),
    paddingHorizontal: sw(4),
    minWidth: 0,
  },
  dropdownIconWrap: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownItemText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    textAlign: "center",
  },
  hero: {
    borderRadius: sw(20),
    padding: sw(20),
    marginBottom: sw(16),
  },
  heroIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  heroLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroNumber: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: sf(26),
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },
  heroHint: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "rgba(255,255,255,0.88)",
  },
  heroActions: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: sw(16),
  },
  heroBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
  },
  heroBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0A2A43",
  },
  heroBtnTextGhost: {
    color: "#FFFFFF",
  },
});
