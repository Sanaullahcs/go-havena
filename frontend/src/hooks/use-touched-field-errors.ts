"use client";

import { useCallback, useState } from "react";
import { hasFieldErrors, type FieldErrors } from "@/lib/admin/form-validation-utils";

/** Show inline field errors only after touch or submit attempt. */
export function useTouchedFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const touch = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const showError = useCallback(
    (field: string, liveErrors: FieldErrors = {}) => {
      if (!(submitAttempted || touched[field])) return undefined;
      return errors[field] || liveErrors[field];
    },
    [errors, submitAttempted, touched],
  );

  const validateOnSubmit = useCallback((fieldErrors: FieldErrors) => {
    setSubmitAttempted(true);
    if (hasFieldErrors(fieldErrors)) {
      setErrors(fieldErrors);
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(fieldErrors)) {
          if (fieldErrors[key]) next[key] = true;
        }
        return next;
      });
      return false;
    }
    setErrors({});
    return true;
  }, []);

  const resetTouched = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
  }, []);

  return {
    errors,
    setErrors,
    touch,
    clearError,
    showError,
    validateOnSubmit,
    resetTouched,
    submitAttempted,
  };
}
