"use client";

import { useCallback, useState } from "react";
import { apiError } from "@/lib/api/client";
import { lookupResidentForInvite, type ResidentInviteLookup } from "@/lib/api/members";
import { validateEmailField } from "@/lib/admin/form-validation-utils";
import { phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";

export type ResidentInviteStep = "email" | "details";

export function useResidentInviteEmailStep(communityId?: number | null) {
  const [step, setStep] = useState<ResidentInviteStep>("email");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [profileLocked, setProfileLocked] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);

  const resetInviteSteps = useCallback(() => {
    setStep("email");
    setLookupLoading(false);
    setProfileLocked(false);
    setLookupNotice(null);
  }, []);

  const continueWithEmail = useCallback(
    async (
      email: string,
    ): Promise<
      | { ok: true; data: ResidentInviteLookup; name: string; phone: PhoneFieldState }
      | { ok: false; error: string }
    > => {
      const emailError = validateEmailField(email);
      if (emailError) {
        return { ok: false, error: emailError };
      }

      setLookupLoading(true);
      try {
        const data = await lookupResidentForInvite(email, communityId ?? undefined);
        if (data.invitable === false && data.message) {
          return { ok: false, error: data.message };
        }

        const autoFill = Boolean(data.auto_fill && data.name && data.phone);
        setStep("details");
        setProfileLocked(autoFill);
        setLookupNotice(
          autoFill
            ? "This resident is already in another community. Name and phone are filled from their existing profile."
            : data.found && data.message
              ? data.message
              : null,
        );

        const phone = autoFill && data.phone ? phoneFieldFromE164(data.phone) : phoneFieldFromE164("");
        const name = autoFill && data.name ? data.name : "";

        return { ok: true, data, name, phone };
      } catch (err) {
        return { ok: false, error: apiError(err) };
      } finally {
        setLookupLoading(false);
      }
    },
    [communityId],
  );

  return {
    step,
    setStep,
    lookupLoading,
    profileLocked,
    lookupNotice,
    resetInviteSteps,
    continueWithEmail,
  };
}
