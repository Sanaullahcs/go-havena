import { Suspense } from "react";
import { cookies } from "next/headers";
import { RegisterPageClient } from "./register-client";
import {
  REGISTER_OTP_COOKIE_NAME,
  parseRegisterOtpChallengeCookie,
} from "@/lib/auth/register-otp-challenge";

export default async function RegisterPage() {
  const jar = await cookies();
  const initialChallenge = parseRegisterOtpChallengeCookie(
    jar.get(REGISTER_OTP_COOKIE_NAME)?.value,
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}>
      <RegisterPageClient initialChallenge={initialChallenge} />
    </Suspense>
  );
}
