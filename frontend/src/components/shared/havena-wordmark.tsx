type Props = {
  className?: string;
};

/** Standalone “Havena” wordmark — Quicksand Bold matches the brand lockup. */
export function HavenaWordmark({ className = "" }: Props) {
  return (
    <span
      className={`font-[family-name:var(--font-wordmark)] text-[2.125rem] font-bold leading-none tracking-[-0.02em] text-[#0b1f3a] ${className}`}
    >
      Havena
    </span>
  );
}
