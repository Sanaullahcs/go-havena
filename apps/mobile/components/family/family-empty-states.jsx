import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AccountRestrictedState } from "../guest/guest-permission-denied-state";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export function FamilySuspendedState({ familyName }) {
  const { t } = useTranslation();
  return (
    <AccountRestrictedState
      featureLabel={t("family.myFamily")}
      featureIcon="users"
      title={t("family.suspended.title")}
      message={t("family.suspended.message")}
      statusLabel={t("family.suspended.statusLabel")}
      featureDescription={t("family.suspended.featureDescription")}
      meta={familyName ? [{ label: t("family.familyLabel"), value: familyName }] : []}
    />
  );
}

export function FamilyBlockedState({ familyNumber, communityName }) {
  const { t } = useTranslation();
  return (
    <AccountRestrictedState
      featureLabel={t("family.myFamily")}
      featureIcon="users"
      title={t("family.blocked.title")}
      message={t("family.blocked.message")}
      statusLabel={t("family.blocked.statusLabel")}
      featureDescription={t("family.blocked.featureDescription")}
      meta={[
        ...(familyNumber ? [{ label: t("family.familyNumberLabel"), value: familyNumber }] : []),
        ...(communityName ? [{ label: t("family.communityLabel"), value: communityName }] : []),
      ]}
    />
  );
}

export function FamilyEmptyState({ onCreate, onJoin, canCreate = true, canJoin = true }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Feather name="users" size={sf(32)} color="#0A2A43" />
      </View>
      <Text style={styles.title}>{t("family.empty.title")}</Text>
      <Text style={styles.text}>
        {t("family.empty.message")}
      </Text>
      <View style={styles.actions}>
        {canCreate ? (
          <Pressable style={styles.primaryBtn} onPress={onCreate}>
            <Feather name="plus-circle" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryText}>{t("family.createMyFamily")}</Text>
          </Pressable>
        ) : null}
        {canJoin ? (
          <Pressable style={styles.secondaryBtn} onPress={onJoin}>
            <Feather name="log-in" size={sf(16)} color="#0A2A43" />
            <Text style={styles.secondaryText}>{t("family.empty.joinWithId")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function FamilyPendingState({
  request,
  onRefresh,
  onCancel,
  cancelling = false,
  awaitingAdmin = false,
}) {
  const { t } = useTranslation();
  const familyNumber = request?.family?.family_number;
  const communityName = request?.family?.community_name;

  return (
    <AccountRestrictedState
      variant="amber"
      featureLabel={t("family.myFamily")}
      featureIcon="users"
      statusLabel={awaitingAdmin ? t("family.pending.underReview") : t("family.pending.pendingLabel")}
      statusIcon="clock"
      lockIcon="clock"
      subtitle={
        awaitingAdmin
          ? t("family.pending.waitingCommunityAdmin")
          : t("family.pending.waitingFamilyHead")
      }
      title={awaitingAdmin ? t("family.pending.awaitingCommunityTitle") : t("family.pending.joinRequestPending")}
      message={
        awaitingAdmin
          ? familyNumber
            ? t("family.pending.headApprovedWithNumber", { number: familyNumber })
            : t("family.pending.headApproved")
          : familyNumber
            ? t("family.pending.requestSentWithNumber", { number: familyNumber })
            : t("family.pending.requestSent")
      }
      featureDescription={t("family.pending.featureDescription")}
      meta={[
        ...(familyNumber ? [{ label: t("family.familyNumberLabel"), value: familyNumber }] : []),
        ...(communityName ? [{ label: t("family.communityLabel"), value: communityName }] : []),
      ]}
      stepsTitle={t("family.pending.whatHappensNext")}
      steps={
        awaitingAdmin
          ? [
              t("family.pending.adminReviewsStep"),
              t("family.pending.onceApprovedStep"),
              t("family.pending.pullToRefreshStep"),
            ]
          : [
              t("family.pending.headReviewsStep"),
              t("family.pending.onceApprovedAdminStep"),
              t("family.pending.cancelAnytimeStep"),
            ]
      }
      actions={
        <View style={styles.pendingActions}>
          {onRefresh ? (
            <Pressable style={styles.secondaryBtn} onPress={onRefresh} disabled={cancelling}>
              <Feather name="refresh-cw" size={sf(14)} color="#0A2A43" />
              <Text style={styles.secondaryText}>{t("family.pending.refreshStatus")}</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
              {cancelling ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Feather name="x-circle" size={sf(14)} color="#DC2626" />
                  <Text style={styles.cancelText}>{t("family.pending.cancelRequest")}</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

export function FamilyRejectedState({
  request,
  onSignOut,
  onCreateFamily,
  rejectionReason,
}) {
  const { t } = useTranslation();
  const familyNumber = request?.family?.family_number;
  const communityName = request?.family?.community_name;
  const reason = rejectionReason ?? request?.rejection_reason;

  return (
    <AccountRestrictedState
      variant="red"
      featureLabel={t("family.myFamily")}
      featureIcon="users"
      statusLabel={t("family.rejected.statusLabel")}
      statusIcon="x-circle"
      lockIcon="x-circle"
      subtitle={t("family.rejected.subtitle")}
      title={t("family.rejected.title")}
      message={
        familyNumber
          ? t("family.rejected.messageWithNumber", { number: familyNumber })
          : t("family.rejected.message")
      }
      featureDescription={t("family.rejected.featureDescription")}
      meta={[
        ...(familyNumber ? [{ label: t("family.familyNumberLabel"), value: familyNumber }] : []),
        ...(communityName ? [{ label: t("family.communityLabel"), value: communityName }] : []),
        ...(reason ? [{ label: t("family.rejected.reasonLabel"), value: reason }] : []),
      ]}
      stepsTitle={t("family.rejected.stepsTitle")}
      steps={[
        t("family.rejected.step1"),
        t("family.rejected.step2"),
      ]}
      actions={
        <View style={styles.pendingActions}>
          {onCreateFamily ? (
            <Pressable style={styles.primaryBtn} onPress={onCreateFamily}>
              <Feather name="plus-circle" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.primaryText}>{t("family.createMyFamily")}</Text>
            </Pressable>
          ) : null}
          {onSignOut ? (
            <Pressable style={styles.secondaryBtn} onPress={onSignOut}>
              <Feather name="log-out" size={sf(14)} color="#0A2A43" />
              <Text style={styles.secondaryText}>{t("family.rejected.signOut")}</Text>
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: sw(24),
    paddingTop: sw(48),
    paddingBottom: sw(32),
    gap: sw(10),
  },
  icon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(20),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: "#0F172A",
    textAlign: "center",
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(21),
    color: "#64748B",
    textAlign: "center",
  },
  actions: {
    marginTop: sw(12),
    width: "100%",
    gap: sw(10),
  },
  pendingActions: {
    gap: sw(10),
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(14),
    borderRadius: 999,
    backgroundColor: "#0A2A43",
  },
  primaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(13),
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignSelf: "stretch",
  },
  secondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0A2A43",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(13),
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignSelf: "stretch",
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#DC2626",
  },
});
