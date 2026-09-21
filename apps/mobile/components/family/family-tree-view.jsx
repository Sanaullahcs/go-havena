import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import ProfilePhotoAvatar from "../profile/profile-photo-avatar";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

const STATUS_META = {
  head: { label: "Family Head", bg: "#D1FAF5", color: "#0A2A43", border: "rgba(20, 184, 166, 0.28)" },
  active: { label: "Member", bg: "#F8FAFC", color: "#475569", border: "#E2E8F0" },
  pending: { label: "Pending", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  suspended: { label: "Suspended", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  blocked: { label: "Blocked", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
};

function resolveStatus(member) {
  if (member.role === "head") return "head";
  return member.status ?? "active";
}

function StatusBadge({ member }) {
  const { t } = useTranslation();
  const key = resolveStatus(member);
  const meta = STATUS_META[key] ?? STATUS_META.active;
  const statusLabels = {
    head: t("family.tree.statusHead"),
    active: t("family.tree.statusMember"),
    pending: t("family.tree.statusPending"),
    suspended: t("family.tree.statusSuspended"),
    blocked: t("family.tree.statusBlocked"),
  };

  return (
    <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{statusLabels[key] ?? meta.label}</Text>
    </View>
  );
}

function TreeHero({ family, memberCount }) {
  const { t } = useTranslation();
  const community = family?.community_name ?? t("family.tree.yourCommunity");
  const familyNumber = family?.family_number ?? "—";

  return (
    <View
      style={styles.hero}
    >
      <View style={styles.heroTop}>
        <View style={styles.heroIconWrap}>
          <Feather name="git-branch" size={sf(20)} color="#0A2A43" />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>{t("family.tree.familyTreeLabel")}</Text>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {community}
          </Text>
        </View>
      </View>

      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue}>{memberCount}</Text>
          <Text style={styles.heroStatLabel}>
            {memberCount === 1 ? t("family.tree.memberSingular") : t("family.tree.membersPlural")}
          </Text>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={[styles.heroStat, styles.heroStatWide]}>
          <Text style={styles.heroStatValueSmall} numberOfLines={1}>
            {familyNumber}
          </Text>
          <Text style={styles.heroStatLabel}>{t("family.tree.familyId")}</Text>
        </View>
      </View>
    </View>
  );
}

function HeadNode({ member, index = 0 }) {
  const { t } = useTranslation();
  const user = member.user ?? {};

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.headWrap}>
      <View style={styles.headRingOuter}>
        <View
          style={styles.headRingGradient}
        >
          <View style={styles.headRingInner}>
            <ProfilePhotoAvatar avatarUrl={user.avatar_url} size={sw(72)} />
          </View>
        </View>
        <View style={styles.crownBadge}>
          <Feather name="award" size={sf(12)} color="#FFFFFF" />
        </View>
      </View>

      <Text style={styles.headName} numberOfLines={2}>
        {user.name ?? t("family.familyHead")}
      </Text>
      {user.unit_number ? (
        <Text style={styles.headMeta} numberOfLines={1}>
          {t("family.tree.unit", { number: user.unit_number })}
        </Text>
      ) : null}
      <StatusBadge member={member} />
    </Animated.View>
  );
}

function MemberNode({ member, index = 0, width }) {
  const { t } = useTranslation();
  const user = member.user ?? {};

  return (
    <Animated.View
      entering={FadeInDown.delay(80 + index * 50).springify()}
      style={[styles.memberNode, { width }]}
    >
      <View style={styles.memberAvatarWrap}>
        <ProfilePhotoAvatar avatarUrl={user.avatar_url} size={sw(52)} />
      </View>
      <Text style={styles.memberName} numberOfLines={2}>
        {user.name ?? t("family.member")}
      </Text>
      {user.unit_number ? (
        <Text style={styles.memberMeta} numberOfLines={1}>
          {t("family.tree.unit", { number: user.unit_number })}
        </Text>
      ) : null}
      {member.relationship ? (
        <Text style={styles.memberRelation} numberOfLines={1}>
          {member.relationship}
        </Text>
      ) : null}
      <StatusBadge member={member} />
    </Animated.View>
  );
}

function TreeConnector({ childCount, canvasWidth, nodeWidth, gap }) {
  const height = sw(42);
  const midY = sw(18);
  const centerX = canvasWidth / 2;

  if (childCount <= 0) return null;

  if (childCount === 1) {
    return (
      <Svg width={canvasWidth} height={height}>
        <Line
          x1={centerX}
          y1={0}
          x2={centerX}
          y2={height}
          stroke="#93C5FD"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  const rowWidth = childCount * nodeWidth + (childCount - 1) * gap;
  const rowStart = (canvasWidth - rowWidth) / 2;
  const firstCenter = rowStart + nodeWidth / 2;
  const lastCenter = firstCenter + (childCount - 1) * (nodeWidth + gap);

  return (
    <Svg width={canvasWidth} height={height}>
      <Line
        x1={centerX}
        y1={0}
        x2={centerX}
        y2={midY}
        stroke="#93C5FD"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Line
        x1={firstCenter}
        y1={midY}
        x2={lastCenter}
        y2={midY}
        stroke="#93C5FD"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {Array.from({ length: childCount }).map((_, index) => {
        const x = firstCenter + index * (nodeWidth + gap);
        return (
          <Line
            key={`drop-${index}`}
            x1={x}
            y1={midY}
            x2={x}
            y2={height}
            stroke="#93C5FD"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

function MemberRoster({ members }) {
  const { t } = useTranslation();
  if (members.length === 0) return null;

  return (
    <View style={styles.rosterCard}>
      <View style={styles.rosterHeader}>
        <Feather name="list" size={sf(14)} color="#0A2A43" />
        <Text style={styles.rosterTitle}>{t("family.tree.allMembers")}</Text>
        <Text style={styles.rosterCount}>{members.length}</Text>
      </View>
      <View style={styles.rosterList}>
        {members.map((member, index) => {
          const user = member.user ?? {};
          const isHead = member.role === "head";
          return (
            <View
              key={member.id ?? member.user_id ?? index}
              style={[styles.rosterRow, index < members.length - 1 && styles.rosterRowBorder]}
            >
              <ProfilePhotoAvatar avatarUrl={user.avatar_url} size={sw(40)} />
              <View style={styles.rosterCopy}>
                <Text style={styles.rosterName} numberOfLines={1}>
                  {user.name ?? t("family.member")}
                </Text>
                <Text style={styles.rosterMeta} numberOfLines={1}>
                  {[user.unit_number ? t("family.tree.unit", { number: user.unit_number }) : null, member.relationship]
                    .filter(Boolean)
                    .join(" · ") || t("family.tree.householdMember")}
                </Text>
              </View>
              {isHead ? (
                <View style={styles.rosterHeadIcon}>
                  <Feather name="award" size={sf(14)} color="#0A2A43" />
                </View>
              ) : (
                <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function FamilyTreeView({ members = [], family = null }) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(windowWidth - sw(32), sw(280));

  const { head, others, sortedMembers } = useMemo(() => {
    const headMember = members.find((m) => m.role === "head") ?? members[0] ?? null;
    const rest = members.filter((m) => m.id !== headMember?.id && m.user_id !== headMember?.user_id);
    const sorted = headMember ? [headMember, ...rest] : rest;
    return { head: headMember, others: rest, sortedMembers: sorted };
  }, [members]);

  const nodeWidth = sw(118);
  const nodeGap = sw(12);
  const rowWidth =
    others.length > 0
      ? others.length * nodeWidth + Math.max(0, others.length - 1) * nodeGap
      : contentWidth;
  const canvasWidth = Math.max(contentWidth, rowWidth + sw(24));
  const useHorizontalScroll = rowWidth > contentWidth - sw(8);

  if (!head) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Feather name="git-branch" size={sf(28)} color="#0A2A43" />
        </View>
        <Text style={styles.emptyTitle}>{t("family.tree.noTreeYet")}</Text>
        <Text style={styles.emptyText}>{t("family.tree.addMembersHint")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <TreeHero family={family} memberCount={members.length} t={t} />

      <View style={styles.treeCard}>
        <View style={styles.treeCardHeader}>
          <Text style={styles.treeCardTitle}>{t("family.tree.household")}</Text>
          <View style={styles.treeCardPill}>
            <Feather name="users" size={sf(12)} color="#0A2A43" />
            <Text style={styles.treeCardPillText}>{t("family.tree.total", { count: members.length })}</Text>
          </View>
        </View>

        <View style={[styles.treeCanvas, { width: contentWidth }]}>
          <HeadNode member={head} />

          {others.length > 0 ? (
            <>
              <TreeConnector
                childCount={others.length}
                canvasWidth={useHorizontalScroll ? rowWidth : contentWidth}
                nodeWidth={nodeWidth}
                gap={nodeGap}
              />

              {useHorizontalScroll ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.memberRowScroll,
                    { width: rowWidth, paddingHorizontal: sw(4) },
                  ]}
                >
                  {others.map((member, index) => (
                    <MemberNode
                      key={member.id ?? member.user_id ?? index}
                      member={member}
                      index={index}
                      width={nodeWidth}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={[styles.memberRow, { width: contentWidth }]}>
                  {others.map((member, index) => (
                    <MemberNode
                      key={member.id ?? member.user_id ?? index}
                      member={member}
                      index={index}
                      width={nodeWidth}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.soloWrap}>
              <Feather name="user-plus" size={sf(16)} color="#94A3B8" />
              <Text style={styles.soloHint}>
                {t("family.tree.soloHint")}
              </Text>
            </View>
          )}
        </View>
      </View>

      <MemberRoster members={sortedMembers} t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: sw(16),
    gap: sw(14),
    paddingBottom: sw(8),
  },
  hero: {
    borderRadius: sw(20),
    padding: sw(18),
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
  },
  heroIconWrap: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "rgba(255,255,255,0.82)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTitle: {
    marginTop: sw(2),
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#FFFFFF",
  },
  heroStats: {
    marginTop: sw(16),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
  },
  heroStat: {
    alignItems: "center",
    minWidth: sw(72),
  },
  heroStatWide: {
    flex: 1,
    minWidth: 0,
  },
  heroStatDivider: {
    width: 1,
    height: sw(32),
    backgroundColor: "rgba(255,255,255,0.22)",
    marginHorizontal: sw(12),
  },
  heroStatValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    color: "#FFFFFF",
  },
  heroStatValueSmall: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  heroStatLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "rgba(255,255,255,0.78)",
  },
  treeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(20),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingTop: sw(16),
    paddingBottom: sw(18),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  treeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(16),
    marginBottom: sw(8),
  },
  treeCardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  treeCardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#D1FAF5",
  },
  treeCardPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#0A2A43",
  },
  treeCanvas: {
    alignSelf: "center",
    alignItems: "center",
    paddingTop: sw(8),
  },
  headWrap: {
    alignItems: "center",
    maxWidth: sw(220),
    paddingHorizontal: sw(8),
  },
  headRingOuter: {
    position: "relative",
  },
  headRingGradient: {
    width: sw(84),
    height: sw(84),
    borderRadius: sw(42),
    alignItems: "center",
    justifyContent: "center",
  },
  headRingInner: {
    width: sw(78),
    height: sw(78),
    borderRadius: sw(39),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  crownBadge: {
    position: "absolute",
    end: -sw(2),
    bottom: -sw(2),
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#0A2A43",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headName: {
    marginTop: sw(12),
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
    textAlign: "center",
  },
  headMeta: {
    marginTop: sw(3),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    textAlign: "center",
  },
  memberRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: sw(12),
    paddingHorizontal: sw(8),
  },
  memberRowScroll: {
    flexDirection: "row",
    gap: sw(12),
  },
  memberNode: {
    alignItems: "center",
    paddingVertical: sw(12),
    paddingHorizontal: sw(8),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  memberAvatarWrap: {
    padding: sw(2),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  memberName: {
    marginTop: sw(8),
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#0F172A",
    textAlign: "center",
    minHeight: sf(32),
  },
  memberMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
    textAlign: "center",
  },
  memberRelation: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#0A2A43",
    textAlign: "center",
  },
  badge: {
    marginTop: sw(8),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(9),
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  soloWrap: {
    marginTop: sw(12),
    marginHorizontal: sw(16),
    padding: sw(14),
    borderRadius: sw(14),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  soloHint: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  rosterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  rosterHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rosterTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
  },
  rosterCount: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#64748B",
  },
  rosterList: {
    paddingHorizontal: sw(14),
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
  },
  rosterRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rosterCopy: {
    flex: 1,
    minWidth: 0,
  },
  rosterName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0F172A",
  },
  rosterMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  rosterHeadIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: sw(24),
    paddingVertical: sw(48),
    gap: sw(8),
  },
  emptyIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(20),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
    textAlign: "center",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(21),
    color: "#64748B",
    textAlign: "center",
  },
});
