import { useCallback, useState } from "react";
import { hasFieldErrors } from "../utils/form-validation";

/**
 * Show inline field errors only after a field is touched or submit was attempted.
 */
export function useTouchedFieldErrors() {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const touch = useCallback((field) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const clearError = useCallback((field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const showError = useCallback(
    (field, liveErrors = {}) => {
      if (!(submitAttempted || touched[field])) return null;
      return errors[field] || liveErrors[field] || null;
    },
    [errors, submitAttempted, touched],
  );

  const validateOnSubmit = useCallback((fieldErrors) => {
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
  };
}
