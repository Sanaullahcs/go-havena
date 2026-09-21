import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import GuestInviteForm from "../../../components/guest/guest-invite-form";
import { propertyStyles } from "../../../constants/property-styles";
import { inviteAdminGuest } from "../../../services/guests-api";

export default function InviteGuestAdminScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title={t('guests.inviteGuestUserTitle')} />
      <GuestInviteForm
        variant="admin"
        createInvitation={inviteAdminGuest}
        onDone={() => router.back()}
      />
    </SafeAreaView>
  );
}
