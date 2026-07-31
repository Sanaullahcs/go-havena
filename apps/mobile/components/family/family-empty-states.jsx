import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AccountRestrictedState } from "../guest/guest-permission-denied-state";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export function FamilySuspendedState({ familyName }) {
  return (
    <AccountRestrictedState
      featureLabel="My Family"
      featureIcon="users"
      title="Family access suspended"
      message="Your family head suspended your access to family features. Contact them to restore access."
      statusLabel="Suspended"
      featureDescription="Family profile, member list, and family tree are unavailable while suspended."
      meta={familyName ? [{ label: "Family", value: familyName }] : []}
    />
  );
}

export function FamilyBlockedState({ familyNumber, communityName }) {
  return (
    <AccountRestrictedState
      featureLabel="My Family"
      featureIcon="users"
      title="Blocked from family"
      message="You were removed and blocked from this family. You cannot send new join requests with this family number."
      statusLabel="Blocked"
      featureDescription="Family features are no longer available for this household."
      meta={[
        ...(familyNumber ? [{ label: "Family number", value: familyNumber }] : []),
        ...(communityName ? [{ label: "Community", value: communityName }] : []),
      ]}
    />
  );
}

export function FamilyEmptyState({ onCreate, onJoin, canCreate = true, canJoin = true }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Feather name="users" size={sf(32)} color="#0052DF" />
      </View>
      <Text style={styles.title}>You&apos;re not part of a family yet</Text>
      <Text style={styles.text}>
        Create your own family or join an existing family whenever you&apos;re ready.
      </Text>
      <View style={styles.actions}>
        {canCreate ? (
          <Pressable style={styles.primaryBtn} onPress={onCreate}>
            <Feather name="plus-circle" size={sf(16)} color="#FFFFFF" />
            <Text style={styles.primaryText}>Create My Family</Text>
          </Pressable>
        ) : null}
        {canJoin ? (
          <Pressable style={styles.secondaryBtn} onPress={onJoin}>
            <Feather name="log-in" size={sf(16)} color="#0052DF" />
            <Text style={styles.secondaryText}>Join with family id</Text>
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
  const familyNumber = request?.family?.family_number;
  const communityName = request?.family?.community_name;

  return (
    <AccountRestrictedState
      variant="amber"
      featureLabel="My Family"
      featureIcon="users"
      statusLabel={awaitingAdmin ? "Under review" : "Pending"}
      statusIcon="clock"
      lockIcon="clock"
      subtitle={
        awaitingAdmin
          ? "Waiting for community admin approval"
          : "Waiting for your family head to approve"
      }
      title={awaitingAdmin ? "Awaiting community approval" : "Join request pending"}
      message={
        awaitingAdmin
          ? familyNumber
            ? `Your Family Head approved joining ${familyNumber}. Family features unlock after your community admin approves your membership.`
            : "Your Family Head approved your request. Family features unlock after your community admin approves your membership."
          : familyNumber
            ? `Your request to join family ${familyNumber} was sent to the family head. Family features unlock after they approve you.`
            : "Your request was sent to the family head. Family features unlock after they approve you."
      }
      featureDescription="Family profile, member list, and family tree stay unavailable until approval is complete."
      meta={[
        ...(familyNumber ? [{ label: "Family number", value: familyNumber }] : []),
        ...(communityName ? [{ label: "Community", value: communityName }] : []),
      ]}
      stepsTitle="What happens next?"
      steps={
        awaitingAdmin
          ? [
              "Your community admin reviews your membership request.",
              "Once approved, you become an active community resident and family member.",
              "Pull to refresh this screen after you are approved.",
            ]
          : [
              "The family head reviews your join request in My Family → Family requests.",
              "Once approved, your request goes to the community admin if needed.",
              "You can cancel this request anytime if you joined the wrong family.",
            ]
      }
      actions={
        <View style={styles.pendingActions}>
          {onRefresh ? (
            <Pressable style={styles.secondaryBtn} onPress={onRefresh} disabled={cancelling}>
              <Feather name="refresh-cw" size={sf(14)} color="#0052DF" />
              <Text style={styles.secondaryText}>Refresh status</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
              {cancelling ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Feather name="x-circle" size={sf(14)} color="#DC2626" />
                  <Text style={styles.cancelText}>Cancel request</Text>
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
  const familyNumber = request?.family?.family_number;
  const communityName = request?.family?.community_name;
  const reason = rejectionReason ?? request?.rejection_reason;

  return (
    <AccountRestrictedState
      variant="red"
      featureLabel="My Family"
      featureIcon="users"
      statusLabel="Declined"
      statusIcon="x-circle"
      lockIcon="x-circle"
      subtitle="Your family head declined this request"
      title="Family join declined"
      message={
        familyNumber
          ? `Your request to join family ${familyNumber} was declined. You can create your own family or sign out.`
          : "Your request to join this family was declined. You can create your own family or sign out."
      }
      featureDescription="Family features stay unavailable until you create a family or join another one."
      meta={[
        ...(familyNumber ? [{ label: "Family number", value: familyNumber }] : []),
        ...(communityName ? [{ label: "Community", value: communityName }] : []),
        ...(reason ? [{ label: "Reason", value: reason }] : []),
      ]}
      stepsTitle="What you can do"
      steps={[
        "Create My Family to become a Family Head with a new Family Number.",
        "Your community admin will still need to approve your membership after you create a family.",
      ]}
      actions={
        <View style={styles.pendingActions}>
          {onCreateFamily ? (
            <Pressable style={styles.primaryBtn} onPress={onCreateFamily}>
              <Feather name="plus-circle" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.primaryText}>Create My Family</Text>
            </Pressable>
          ) : null}
          {onSignOut ? (
            <Pressable style={styles.secondaryBtn} onPress={onSignOut}>
              <Feather name="log-out" size={sf(14)} color="#0052DF" />
              <Text style={styles.secondaryText}>Sign Out</Text>
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
    backgroundColor: "#EFF6FF",
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
    backgroundColor: "#0052DF",
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
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignSelf: "stretch",
  },
  secondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0052DF",
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
