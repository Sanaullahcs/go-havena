import { HavenaMark } from "@/components/shared/havena-mark";
import { HavenaWordmark } from "@/components/shared/havena-wordmark";

type Variant = "full" | "mark" | "wordmark";
type Tone = "light" | "brand" | "dark";

type Props = {
  variant?: Variant;
  className?: string;
  withWordmarkText?: boolean;
  tone?: Tone;
};

const toneTextClass: Record<Tone, string> = {
  light: "text-white",
  brand: "text-[#1B4F8A]",
  dark: "text-[#1B4F8A]",
};

export function Logo({
  variant = "full",
  className = "",
  withWordmarkText = true,
  tone = "dark",
}: Props) {
  if (variant === "mark") {
    return (
      <span className={`inline-flex shrink-0 ${className}`} aria-label="Havena">
        <HavenaMark size={34} tone={tone === "light" ? "light" : "brand"} />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${toneTextClass[tone]} ${className}`}>
        <HavenaMark size={28} tone={tone === "light" ? "light" : "brand"} />
        <HavenaWordmark className="text-[1.05rem]" />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Havena">
      <HavenaMark size={32} className="shrink-0" tone={tone === "light" ? "light" : "brand"} />
      {withWordmarkText ? (
        <HavenaWordmark
          className={`text-[1.15rem] transition-colors duration-300 ease-out ${toneTextClass[tone]}`}
        />
      ) : null}
    </span>
  );
}

export default Logo;
