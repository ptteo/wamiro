export const MIN_PASSWORD_LENGTH = 10;

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push(`At least ${MIN_PASSWORD_LENGTH} characters`);
  if (!/[A-Za-z]/.test(password)) issues.push("Include a letter");
  if (!/[0-9]/.test(password)) issues.push("Include a number");
  return issues;
}

export function passwordStrongEnough(password: string): boolean {
  return passwordIssues(password).length === 0;
}

export function passwordScore(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  let n = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) n++;
  if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) n++;
  if (password.length >= 14 || /[^A-Za-z0-9]/.test(password)) n++;
  return n as 0 | 1 | 2 | 3;
}
