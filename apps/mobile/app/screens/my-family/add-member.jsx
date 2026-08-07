import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { FormPhoneInput } from "../../../components/ui/phone-input";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { sf, sw } from "../../../utils/responsive";
import { toE164 } from "../../../utils/phone";
import { submitAddFamilyMemberRequest } from "../../../services/family-api";
import { useApiAction } from "../../../hooks/use-api-action";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  age: "",
  unit_number: "",
};

function validateForm(form, phoneCountry, t) {
  const errors = {};
  if (!form.first_name.trim()) errors.first_name = t("family.addMemberForm.firstNameRequired");
  if (!form.last_name.trim()) errors.last_name = t("family.addMemberForm.lastNameRequired");
  if (!form.phone.trim()) {
    errors.phone = t("family.addMemberForm.phoneRequired");
  } else if (!toE164(form.phone, phoneCountry)) {
    errors.phone = t("family.addMemberForm.invalidPhone");
  }
  if (!form.email.trim()) {
    errors.email = t("family.addMemberForm.emailRequired");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = t("family.addMemberForm.invalidEmail");
  }
  const age = Number(form.age);
  if (!form.age.trim()) {
    errors.age = t("family.addMemberForm.ageRequired");
  } else if (!Number.isInteger(age) || age < 1 || age > 120) {
    errors.age = t("family.addMemberForm.invalidAge");
  }
  if (!form.unit_number.trim()) {
    errors.unit_number = t("family.addMemberForm.unitNumberRequired");
  }
  return errors;
}

function Field({ label, error, children, onLayout }) {
  return (
    <View style={styles.field} onLayout={onLayout}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default function AddFamilyMemberScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { showFailure, showSuccess } = useApiAction();
  const scrollRef = useRef(null);
  const fieldOffsets = useRef({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const rememberFieldOffset = (key) => (event) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };

  const focusField = (key) => {
    const y = fieldOffsets.current[key];
    if (y == null || !scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - sw(12)), animated: true });
    });
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const nextErrors = validateForm(form, phoneCountry, t);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusField(Object.keys(nextErrors)[0]);
      return;
    }

    const phone = toE164(form.phone, phoneCountry);
    if (!phone) {
      setErrors((prev) => ({ ...prev, phone: t("family.addMemberForm.invalidPhone") }));
      focusField("phone");
      return;
    }

    setSubmitting(true);
    try {
      await submitAddFamilyMemberRequest({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone,
        age: Number(form.age),
        unit_number: form.unit_number.trim(),
      });
      await showSuccess(
        t("family.addMemberForm.requestSubmitted"),
        t("family.addMemberForm.requestSubmittedMessage"),
      );
      router.replace("/screens/my-family");
    } catch (err) {
      await showFailure(t("family.addMemberForm.couldNotSubmit"), err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("family.addMemberForm.title")}
        subtitle={t("family.addMemberForm.subtitle")}
        onBack={() => {
          if (!submitting) router.back();
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.content}
        >
          <View style={styles.infoBanner}>
            <Feather name="info" size={sf(14)} color="#0A2A43" />
            <Text style={styles.infoText}>
              {t("family.addMemberForm.infoBanner")}
            </Text>
          </View>

          <Field
            label={t("family.addMemberForm.firstName")}
            error={errors.first_name}
            onLayout={rememberFieldOffset("first_name")}
          >
            <TextInput
              value={form.first_name}
              onChangeText={(value) => update("first_name", value)}
              onFocus={() => focusField("first_name")}
              placeholder={t("family.addMemberForm.firstName")}
              placeholderTextColor="#94A3B8"
              style={[styles.input, errors.first_name && styles.inputError]}
              editable={!submitting}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              textContentType="givenName"
            />
          </Field>

          <Field
            label={t("family.addMemberForm.lastName")}
            error={errors.last_name}
            onLayout={rememberFieldOffset("last_name")}
          >
            <TextInput
              value={form.last_name}
              onChangeText={(value) => update("last_name", value)}
              onFocus={() => focusField("last_name")}
              placeholder={t("family.addMemberForm.lastName")}
              placeholderTextColor="#94A3B8"
              style={[styles.input, errors.last_name && styles.inputError]}
              editable={!submitting}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              textContentType="familyName"
            />
          </Field>

          <Field label={t("family.addMemberForm.phoneNumber")} error={errors.phone} onLayout={rememberFieldOffset("phone")}>
            <FormPhoneInput
              digits={form.phone}
              onChangeDigits={(value) => update("phone", value)}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              showError={Boolean(errors.phone)}
              onFocus={() => focusField("phone")}
            />
          </Field>

          <Field label={t("family.addMemberForm.email")} error={errors.email} onLayout={rememberFieldOffset("email")}>
            <TextInput
              value={form.email}
              onChangeText={(value) => update("email", value)}
              onFocus={() => focusField("email")}
              placeholder={t("family.addMemberForm.emailPlaceholder")}
              placeholderTextColor="#94A3B8"
              style={[styles.input, errors.email && styles.inputError]}
              editable={!submitting}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              textContentType="emailAddress"
            />
          </Field>

          <Field label={t("family.addMemberForm.age")} error={errors.age} onLayout={rememberFieldOffset("age")}>
            <TextInput
              value={form.age}
              onChangeText={(value) => update("age", value.replace(/[^0-9]/g, ""))}
              onFocus={() => focusField("age")}
              placeholder={t("family.addMemberForm.agePlaceholder")}
              placeholderTextColor="#94A3B8"
              style={[styles.input, errors.age && styles.inputError]}
              editable={!submitting}
              keyboardType="number-pad"
              maxLength={3}
              returnKeyType="next"
            />
          </Field>

          <Field
            label={t("family.addMemberForm.unitNumber")}
            error={errors.unit_number}
            onLayout={rememberFieldOffset("unit_number")}
          >
            <TextInput
              value={form.unit_number}
              onChangeText={(value) => update("unit_number", value)}
              onFocus={() => focusField("unit_number")}
              placeholder={t("family.addMemberForm.unitPlaceholder")}
              placeholderTextColor="#94A3B8"
              style={[styles.input, errors.unit_number && styles.inputError]}
              editable={!submitting}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </Field>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelBtn}
            disabled={submitting}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelText}>{t("family.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.submitBtn} disabled={submitting} onPress={handleSubmit}>
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="send" size={sf(15)} color="#FFFFFF" />
                <Text style={styles.submitText}>{t("family.addMemberForm.submitRequest")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(24),
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginBottom: sw(18),
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#1E40AF",
  },
  field: {
    marginBottom: sw(16),
  },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#334155",
    marginBottom: sw(8),
  },
  input: {
    minHeight: sw(48),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(15),
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  error: {
    marginTop: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#DC2626",
  },
  footer: {
    flexDirection: "row",
    gap: sw(10),
    paddingHorizontal: sw(16),
    paddingTop: sw(10),
    paddingBottom: sw(16),
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: sw(50),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#475569",
  },
  submitBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    minHeight: sw(50),
    borderRadius: sw(12),
    backgroundColor: "#0A2A43",
  },
  submitText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});
