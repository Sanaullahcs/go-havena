import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import GuestInviteForm from "../../../components/guest/guest-invite-form";
import { propertyStyles } from "../../../constants/property-styles";
import { createResidentGuestInvitation } from "../../../services/guests-api";
import { sf } from "../../../utils/responsive";

export default function InviteGuestScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Invite Guest"
        right={
          <Pressable
            onPress={() => router.push("/screens/guest-approvals")}
            hitSlop={8}
            accessibilityLabel="Guest approvals"
          >
            <Feather name="user-check" size={sf(20)} color="#0052DF" />
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
