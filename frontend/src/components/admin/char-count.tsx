export function CharCount({ value, max }: { value: string; max: number }) {
  if (!value) return null;
  return (
    <p className="mt-2 text-right text-[11px] tabular-nums text-slate-400">
      {value.length}/{max}
    </p>
  );
}
