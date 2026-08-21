import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { PropertyType } from "../../../../../../../constants/property-management-type";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../../../../../constants/font";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import ScreenHeader from "../../../../../../../components/layout/screen-header";

export default function RuleDetails() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        titleAlign="center"
        title={t("propertyMgmt.ruleDetailsTitle")}
        iconOnly
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          style={{
            paddingVertical: 20,
            paddingHorizontal: 24,
            borderBottomWidth: 2,
            borderBottomColor: "#FEF3C6",
            backgroundColor: "#FFFBEB",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <Image
            source={require("../../../../../../../assets/images/warning-icon.svg")}
            style={{ width: 20, height: 20, marginTop: 2 }}
          />

          <View style={{ flexDirection: "column", gap: 4 }}>
            <Text
              style={{
                fontFamily: Fonts.bold,
                fontSize: PropertyType.body,
                lineHeight: PropertyType.headingLine,
                color: "#7B3306",
                fontWeight: 700,
              }}
            >
              {t("propertyMgmt.ackRequired")}
            </Text>
            <Text
              style={{
                fontFamily: Fonts.regular,
                fontSize: PropertyType.caption,
                lineHeight: 19,
                color: "#BB4D00",
                fontWeight: 400,
              }}
            >
              {t("propertyMgmt.ackRequiredDesc")}
            </Text>
          </View>
        </View>

        <View
          style={{
            paddingVertical: 20,
            paddingHorizontal: 24,
            borderBottomWidth: 8,
            borderBottomColor: "#F9FAFB",
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.bold,
              fontSize: PropertyType.heading,
              lineHeight: PropertyType.titleLine,
              color: "#000000",
              fontWeight: 700,
            }}
          >
            {t("propertyMgmt.demoRuleTitle")}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 12,
            }}
          >
            <View
              style={{
                backgroundColor: "#F3F4F6",
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 24,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.medium,
                  fontSize: PropertyType.caption,
                  lineHeight: PropertyType.captionLine,
                  fontWeight: 500,
                  color: "#6A7282",
                }}
              >
                {t("propertyMgmt.demoCategoryParking")}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Image
                source={require("../../../../../../../assets/images/clock-icon-icon.svg")}
                style={{ width: 14, height: 14 }}
              />
              <Text
                style={{
                  fontFamily: Fonts.regular,
                  fontSize: PropertyType.caption,
                  lineHeight: PropertyType.captionLine,
                  fontWeight: 400,
                  color: "#6A7282",
                }}
              >
                {t("propertyMgmt.demoUpdatedDate")}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#D1FAF5",
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 24,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.medium,
                  fontSize: PropertyType.caption,
                  lineHeight: PropertyType.captionLine,
                  fontWeight: 500,
                  color: "#1B4F8A",
                }}
              >
                {t("propertyMgmt.demoVersion")}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            paddingVertical: 20,
            paddingHorizontal: 24,
            backgroundColor: "#D1FAF5",
            borderBottomWidth: 8,
            borderBottomColor: "#F9FAFB",
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.bold,
              fontSize: PropertyType.body,
              lineHeight: PropertyType.headingLine,
              color: "#1C398E",
              fontWeight: 700,
            }}
          >
            {t("propertyMgmt.effectiveDate")}{" "}
            <Text
              style={{
                fontWeight: 400,
                fontFamily: Fonts.regular,
                color: "#1C398E",
              }}
            >
              {t("propertyMgmt.demoEffectiveDate")}
            </Text>
          </Text>
        </View>

        <View style={{ padding: 24 }}>
          <Text
            style={{
              fontFamily: Fonts.regular,
              fontSize: PropertyType.body,
              lineHeight: PropertyType.bodyMdLine,
              color: "#364153",
              fontWeight: 400,
            }}
          >
            {t("propertyMgmt.demoRuleBody")}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 20,
            borderTopWidth: 8,
            borderTopColor: "#F9FAFB",
          }}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsAcknowledged((prev) => !prev)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: isAcknowledged ? "#1B4F8A" : "#D0D5DD",
                backgroundColor: isAcknowledged ? "#1B4F8A" : "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isAcknowledged ? (
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: PropertyType.caption,
                    fontWeight: 700,
                    lineHeight: PropertyType.microLine,
                  }}
                >
                  ✓
                </Text>
              ) : null}
            </View>

            <Text
              style={{
                fontFamily: Fonts.medium,
                fontSize: PropertyType.body,
                lineHeight: PropertyType.bodyMdLine,
                fontWeight: 500,
                color: "#364153",
                flex: 1,
              }}
            >
              {t("propertyMgmt.ackAgree")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 24 }}>
          <TouchableOpacity
            disabled={!isAcknowledged}
            style={{
              backgroundColor: isAcknowledged ? "#1B4F8A" : "#F3F4F6",
              paddingVertical: 15,
              width: "100%",
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: isAcknowledged ? "#FFFFFF" : "#9CA3AF",
                fontSize: PropertyType.heading,
                fontFamily: Fonts.semiBold,
                lineHeight: PropertyType.stat,
                fontWeight: 600,
              }}
            >
              {t("propertyMgmt.ackConfirm")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  button: {
    marginTop: 12,
    paddingVertical: 15,
    width: "100%",
    backgroundColor: "#1B4F8A",
    boxShadow: "0px 4px 6px -4px #0000001A",
    boxShadow: "0px 10px 15px -3px #0000001A",
    borderRadius: 14,
  },
});
