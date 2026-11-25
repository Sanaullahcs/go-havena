import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import GuestInviteForm from "../../../components/guest/guest-invite-form";
import { propertyStyles } from "../../../constants/property-styles";
import { createResidentGuestInvitation } from "../../../services/guests-api";
import { sf } from "../../../utils/responsive";

export default function InviteGuestScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t('guests.inviteGuestTitle')}
        right={
          <Pressable
            onPress={() => router.push("/screens/guest-approvals")}
            hitSlop={8}
            accessibilityLabel={t('guests.guestApprovalsLabel')}
          >
            <Feather name="user-check" size={sf(20)} color="#1B4F8A" />
          </Pressable>
        }
      />
      <GuestInviteForm
        variant="resident"
        createInvitation={createResidentGuestInvitation}
        onDone={() => router.back()}
      />
    </SafeAreaView>
  );
}
