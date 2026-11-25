import axios from "axios";
import { ApiError } from "@/lib/api/client";

const EXISTING_ACCOUNT_CODE = "ACCOUNT_EXISTS_USE_LOGIN";
const EXISTING_ACCOUNT_MESSAGE = /account already exists with this email address/i;

type AuthErrorPayload = {
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

function readAuthErrorPayload(err: unknown): AuthErrorPayload | null {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message };
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as AuthErrorPayload | undefined;
    if (!data) return null;
    return {
      code: typeof data.code === "string" ? data.code : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
      errors: data.errors,
    };
  }
  if (err && typeof err === "object") {
    const record = err as AuthErrorPayload & { code?: string; message?: string };
    if (record.code || record.message || record.errors) {
      return {
        code: typeof record.code === "string" ? record.code : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
        errors: record.errors,
      };
    }
  }
  return null;
}

export function isExistingAccountSignupError(err: unknown): boolean {
  const payload = readAuthErrorPayload(err);
  if (!payload) return false;
  if (payload.code === EXISTING_ACCOUNT_CODE) return true;
  const emailMsg = payload.errors?.email?.[0] ?? payload.message ?? "";
  return EXISTING_ACCOUNT_MESSAGE.test(emailMsg);
}
