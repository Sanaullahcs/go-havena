import { getApiErrorCode, getApiErrorMessage } from "./api-error-core";

const EXISTING_ACCOUNT_CODE = "ACCOUNT_EXISTS_USE_LOGIN";
const EXISTING_ACCOUNT_MESSAGE = /account already exists with this email address/i;

export function isExistingAccountSignupError(error) {
  const code = getApiErrorCode(error);
  if (code === EXISTING_ACCOUNT_CODE) return true;

  const message = getApiErrorMessage(error);
  if (EXISTING_ACCOUNT_MESSAGE.test(message ?? "")) return true;

  const emailMsg = error?.errors?.email?.[0];
  return EXISTING_ACCOUNT_MESSAGE.test(emailMsg ?? "");
}
