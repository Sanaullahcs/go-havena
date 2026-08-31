import Link from "next/link";

export function AuthLegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[12px] leading-5 text-slate-500 ${className}`}>
      By continuing you agree to our{" "}
      <Link href="/terms-of-service" className="font-semibold text-[#1B4F8A] underline underline-offset-2 hover:text-[#163A66]">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy-policy" className="font-semibold text-[#1B4F8A] underline underline-offset-2 hover:text-[#163A66]">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
