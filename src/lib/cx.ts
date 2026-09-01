/** Tiny classname join — replaces clsx/tailwind-merge for this codebase size. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
