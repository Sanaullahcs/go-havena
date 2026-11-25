/** Letters, numbers, spaces, and punctuation common in event names and venues. */
export const NOTICE_PLAIN_TEXT_PATTERN = /^[\p{L}\p{N}\s.,'\-&()#/:]+$/u;

export const NOTICE_PLAIN_TEXT_HINT =
  "Use only letters, numbers, spaces, and . , ' - & ( ) # / :";

export function noticePlainTextError(
  value: string,
  label: string,
  opts: { required?: boolean } = {},
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return opts.required ? `${label} is required.` : undefined;
  }
  if (!NOTICE_PLAIN_TEXT_PATTERN.test(trimmed)) {
    return `${label}: ${NOTICE_PLAIN_TEXT_HINT}`;
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return `${label} must include at least one letter or number.`;
  }
  return undefined;
}
