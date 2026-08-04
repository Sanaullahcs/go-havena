import React, { useCallback, useEffect, useMemo, useState } from "react";

import {

  View,

  Text,

  StyleSheet,

  TouchableOpacity,

  TextInput,

  ScrollView,

  ActivityIndicator,

} from "react-native";

import { useRouter, useLocalSearchParams } from "expo-router";

import { Fonts } from "../../../constants/font";

import { Ionicons } from "@expo/vector-icons";

import { SafeAreaView } from "react-native-safe-area-context";

import BackButton from "../../../components/ui/back-button";

import RegionPicker from "../../../components/ui/region-picker";

import { requestCommunity } from "../../../services/auth-api";

import { fetchRegionsOnly } from "../../../services/regions-api";

import { showApiFailure } from "../../../utils/auth-errors";

import { useAppDialog } from "../../../providers/app-dialog-provider";

import { goToCompleteProfile } from "../../../constants/onboarding-routes";

import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { validateCommunityRequestForm, hasFieldErrors, LIMITS } from "../../../utils/form-validation";

export default function RequestForCommunityScreen() {
  const router = useRouter();

  const dialog = useAppDialog();

  const {

    role = "resident",

    regionId: regionIdParam,

    regionTitle: regionTitleParam,

    rejected,

  } = useLocalSearchParams();



  const [communityName, setCommunityName] = useState("");

  const [address, setAddress] = useState("");

  const [regions, setRegions] = useState([]);

  const [selectedRegionId, setSelectedRegionId] = useState(

    regionIdParam ? Number(regionIdParam) : null,

  );

  const [pickerVisible, setPickerVisible] = useState(false);

  const [loadingRegions, setLoadingRegions] = useState(true);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const { submitting, run } = useSubmitLock();

  const liveErrors = useMemo(
    () =>
      validateCommunityRequestForm({
        communityName,
        address,
        regionId: selectedRegionId,
      }),
    [communityName, address, selectedRegionId],
  );



  const loadRegions = useCallback(async () => {

    setLoadingRegions(true);

    try {

      const list = await fetchRegionsOnly({});

      setRegions(list);

      if (!selectedRegionId && list.length === 1) {

        setSelectedRegionId(list[0].id);

      }

    } catch {

      setRegions([]);

    } finally {

      setLoadingRegions(false);

    }

  }, [selectedRegionId]);



  useEffect(() => {

    loadRegions();

  }, [loadRegions]);



  const selectedRegion = regions.find((r) => r.id === selectedRegionId);

  const selectedRegionLabel =

    selectedRegion?.title ||

    (regionTitleParam ? String(regionTitleParam) : "");



  const isAdminRequest = role === "admin";

  const isValid = !hasFieldErrors(liveErrors);

  const handleContinue = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;

    run(async () => {
      try {
        const data = await requestCommunity({
          communityName: communityName.trim(),
          address: address.trim(),
          regionId: selectedRegionId,
        });
        await dialog.showSuccess(
          "Request sent",
          isAdminRequest
            ? "Your community admin application and community details were sent to the system administrator for review."
            : "Your request has been sent to the admin. You will be notified once your community is approved.",
        );
        if (isAdminRequest) {
          goToCompleteProfile(router, {
            role: "admin",
            communityId: String(data.community.id),
            communityName: data.community.name,
            regionId: String(selectedRegionId),
            communityRequest: "1",
          });
          return;
        }
        goToCompleteProfile(router, {
          role,
          communityId: String(data.community.id),
          communityName: data.community.name,
          regionId: String(selectedRegionId),
          communityRequest: "1",
        });
      } catch (err) {
        await showApiFailure(dialog, "Request failed", err);
      }
    });
  };



  return (

    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>

      <View style={styles.headerBar}>

        <BackButton />

      </View>

      <ScrollView

        contentContainerStyle={styles.scrollContent}

        showsVerticalScrollIndicator={false}

      >

        {rejected === "1" ? (

          <View style={styles.rejectedBanner}>

            <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />

            <View style={styles.rejectedTextWrap}>

              <Text style={styles.rejectedTitle}>Previous request declined</Text>

              <Text style={styles.rejectedText}>

                Submit updated community details below for another review.

              </Text>

            </View>

          </View>

        ) : null}



        <View style={styles.headerWrap}>

       
          <Text style={styles.title}>Request to Add Community</Text>

          <Text style={styles.subtitle}>

            {isAdminRequest
              ? "Tell us about the community you will manage. A system administrator will review your application and community details."
              : "Select your region and tell us about your community. Our admin team will review and activate it."}

          </Text>

        </View>



        <View style={styles.formWrap}>

          <Text style={styles.label}>

            Region <Text style={styles.required}>*</Text>

          </Text>

          <TouchableOpacity

            style={[styles.selectField, !selectedRegionId && styles.selectFieldEmpty, showError("regionId", liveErrors) && styles.inputError]}

            activeOpacity={0.85}

            onPress={() => {
              setPickerVisible(true);
              clearError("regionId");
            }}

          >

            <View style={styles.selectIconWrap}>

              <Ionicons name="map-outline" size={18} color="#14B8A6" />

            </View>

            <View style={styles.selectTextWrap}>

              {selectedRegionId ? (

                <>

                  <Text style={styles.selectValue}>{selectedRegionLabel}</Text>

                  {selectedRegion ? (

                    <Text style={styles.selectHint}>

                      {[selectedRegion.area, selectedRegion.state].filter(Boolean).join(" · ")}

                    </Text>

                  ) : null}

                </>

              ) : (

                <Text style={styles.selectPlaceholder}>Select your region</Text>

              )}

            </View>

            <Ionicons name="chevron-down" size={18} color="#98A2B3" />

          </TouchableOpacity>

          {showError("regionId", liveErrors) ? (
            <Text style={styles.errorText}>{showError("regionId", liveErrors)}</Text>
          ) : null}

          {loadingRegions ? (

            <Text style={styles.fieldHint}>Loading regions…</Text>

          ) : (

            <Text style={styles.fieldHint}>

              Your community will appear under this region once approved.

            </Text>

          )}



          <Text style={[styles.label, styles.labelSpacing]}>

            Community Name <Text style={styles.required}>*</Text>

          </Text>

          <TextInput

            value={communityName}

            onChangeText={(t) => {
              setCommunityName(t);
              clearError("communityName");
            }}
            onBlur={() => touch("communityName")}

            placeholder="e.g. Maple Grove Apartments"

            placeholderTextColor="#9CA3AF"

            style={[styles.input, showError("communityName", liveErrors) && styles.inputError]}

            maxLength={LIMITS.communityName}

          />

          {showError("communityName", liveErrors) ? (
            <Text style={styles.errorText}>{showError("communityName", liveErrors)}</Text>
          ) : null}



          <Text style={[styles.label, styles.labelSpacing]}>

            Address <Text style={styles.required}>*</Text>

          </Text>



          <View style={[styles.addressInputWrap, showError("address", liveErrors) && styles.inputError]}>

            <Ionicons name="location-outline" size={18} color="#98A2B3" />

            <TextInput

              value={address}

              onChangeText={(t) => {
                setAddress(t);
                clearError("address");
              }}
              onBlur={() => touch("address")}

              placeholder="123 Main Street, City, State ZIP"

              placeholderTextColor="#9CA3AF"

              style={styles.addressInput}

              maxLength={LIMITS.communityAddress}

            />

          </View>

          {showError("address", liveErrors) ? (
            <Text style={styles.errorText}>{showError("address", liveErrors)}</Text>
          ) : null}



          <View style={styles.stepsCard}>

            <Text style={styles.stepsTitle}>What happens next</Text>

            <View style={styles.stepRow}>

              <View style={styles.stepDot}><Text style={styles.stepNum}>1</Text></View>

              <Text style={styles.stepText}>
                {isAdminRequest
                  ? "System admin reviews your admin application and community request"
                  : "Admin reviews your community request"}
              </Text>

            </View>

            <View style={styles.stepRow}>

              <View style={styles.stepDot}><Text style={styles.stepNum}>2</Text></View>

              <Text style={styles.stepText}>You complete your profile while waiting</Text>

            </View>

            <View style={styles.stepRow}>

              <View style={styles.stepDot}><Text style={styles.stepNum}>3</Text></View>

              <Text style={styles.stepText}>Once approved, others can find and join your community</Text>

            </View>

          </View>



          <TouchableOpacity

            style={[styles.ctaButton, !isValid && styles.ctaButtonDisabled]}

            activeOpacity={0.85}

            disabled={!isValid || submitting}

            onPress={handleContinue}

          >

            {submitting ? (

              <ActivityIndicator color="#FFFFFF" />

            ) : (

              <Text style={styles.ctaText}>Submit request</Text>

            )}

          </TouchableOpacity>



          <Text style={styles.bottomHint}>

            You'll complete your profile next while your request is reviewed

          </Text>

        </View>

      </ScrollView>



      <RegionPicker

        visible={pickerVisible}

        regions={regions}

        selectedId={selectedRegionId}

        loading={loadingRegions}

        onClose={() => setPickerVisible(false)}

        onSelect={(region) => {

          setSelectedRegionId(region.id);

          touch("regionId");
          clearError("regionId");

          setPickerVisible(false);

        }}

      />

    </SafeAreaView>

  );

}



const styles = StyleSheet.create({

  container: {

    flex: 1,

    backgroundColor: "#ffffff",

  },

  headerBar: {

    paddingHorizontal: 24,

    paddingVertical: 8,

  },

  scrollContent: {

    paddingHorizontal: 24,

    paddingBottom: 32,

  },

  rejectedBanner: {

    marginBottom: 16,

    padding: 14,

    borderRadius: 14,

    backgroundColor: "#FEF2F2",

    borderWidth: 1,

    borderColor: "#FECACA",

    flexDirection: "row",

    gap: 12,

    alignItems: "flex-start",

  },

  rejectedTextWrap: {

    flex: 1,

  },

  rejectedTitle: {

    fontFamily: Fonts.semiBold,

    fontSize: 13,

    color: "#991B1B",

  },

  rejectedText: {

    marginTop: 4,

    fontFamily: Fonts.regular,

    fontSize: 12,

    color: "#B91C1C",

    lineHeight: 17,

  },

  headerWrap: {

    marginBottom: 24,

  },

  headerIconWrap: {

    width: 48,

    height: 48,

    borderRadius: 14,

    backgroundColor: "#D1FAF5",

    alignItems: "center",

    justifyContent: "center",

    marginBottom: 14,

  },

  title: {

    fontFamily: Fonts.bold,

    fontSize: 20,

    lineHeight: 26,

    color: "#000000",

    fontWeight: "700",

  },

  subtitle: {

    marginTop: 8,

    fontFamily: Fonts.regular,

    fontSize: 13,

    lineHeight: 18,

    color: "#6A7282",

  },

  formWrap: {

    borderTopWidth: 1,

    borderTopColor: "#F3F4F6",

    paddingTop: 20,

  },

  label: {

    fontFamily: Fonts.medium,

    fontSize: 13,

    lineHeight: 18,

    color: "#000000",

    fontWeight: "500",

  },

  required: {

    color: "#FF3B30",

  },

  selectField: {

    marginTop: 8,

    minHeight: 60,

    borderWidth: 2,

    borderColor: "#E5E7EB",

    borderRadius: 14,

    paddingHorizontal: 14,

    paddingVertical: 12,

    backgroundColor: "#FFFFFF",

    flexDirection: "row",

    alignItems: "center",

    gap: 12,

  },

  selectFieldEmpty: {

    borderColor: "#E5E7EB",

  },

  selectIconWrap: {

    width: 36,

    height: 36,

    borderRadius: 10,

    backgroundColor: "#D1FAF5",

    alignItems: "center",

    justifyContent: "center",

  },

  selectTextWrap: {

    flex: 1,

  },

  selectValue: {

    fontFamily: Fonts.semiBold,

    fontSize: 14,

    color: "#101828",

  },

  selectHint: {

    marginTop: 2,

    fontFamily: Fonts.regular,

    fontSize: 12,

    color: "#667085",

  },

  selectPlaceholder: {

    fontFamily: Fonts.regular,

    fontSize: 14,

    color: "#98A2B3",

  },

  fieldHint: {

    marginTop: 8,

    fontFamily: Fonts.regular,

    fontSize: 12,

    color: "#667085",

    lineHeight: 17,

  },

  input: {

    marginTop: 8,

    height: 60,

    borderWidth: 2,

    borderColor: "#E5E7EB",

    borderRadius: 14,

    paddingHorizontal: 14,

    fontFamily: Fonts.regular,

    fontSize: 14,

    color: "#101828",

    backgroundColor: "#FFFFFF",

  },

  labelSpacing: {

    marginTop: 24,

  },

  addressInputWrap: {

    marginTop: 8,

    height: 60,

    borderWidth: 2,

    borderColor: "#E5E7EB",

    borderRadius: 14,

    paddingHorizontal: 14,

    backgroundColor: "#FFFFFF",

    flexDirection: "row",

    alignItems: "center",

    gap: 8,

  },

  addressInput: {

    flex: 1,

    fontFamily: Fonts.regular,

    fontSize: 14,

    color: "#101828",

  },

  stepsCard: {

    marginTop: 24,

    borderWidth: 1,

    borderColor: "rgba(20, 184, 166, 0.28)",

    borderRadius: 14,

    backgroundColor: "#D1FAF5",

    paddingHorizontal: 16,

    paddingVertical: 16,

    gap: 12,

  },

  stepsTitle: {

    fontFamily: Fonts.semiBold,

    fontSize: 13,

    color: "#101828",

  },

  stepRow: {

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 10,

  },

  stepDot: {

    width: 22,

    height: 22,

    borderRadius: 999,

    backgroundColor: "#14B8A6",

    alignItems: "center",

    justifyContent: "center",

  },

  stepNum: {

    fontFamily: Fonts.bold,

    fontSize: 11,

    color: "#FFFFFF",

  },

  stepText: {

    flex: 1,

    fontFamily: Fonts.regular,

    fontSize: 12,

    lineHeight: 17,

    color: "#364155",

    paddingTop: 2,

  },

  ctaButton: {

    marginTop: 24,

    height: 56,

    borderRadius: 14,

    backgroundColor: "#14B8A6",

    alignItems: "center",

    justifyContent: "center",

  },

  ctaButtonDisabled: {

    backgroundColor: "#CCCCCC",

  },

  ctaText: {

    fontFamily: Fonts.semiBold,

    fontSize: 14,

    lineHeight: 20,

    color: "#FFFFFF",

    fontWeight: "600",

  },

  bottomHint: {

    marginTop: 16,

    textAlign: "center",

    fontFamily: Fonts.regular,

    fontSize: 11,

    lineHeight: 18,

    color: "#6A7282",

  },

  inputError: {
    borderColor: "#DC2626",
  },

  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
  },

});

