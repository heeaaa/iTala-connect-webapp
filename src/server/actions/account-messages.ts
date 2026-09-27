/** Messages for the account actions; kept out of the 'use server' file, which may only export async functions. */
export const LINK_FAILED = 'This link has expired or has already been used. Ask a superadmin for a new set-up link.';
export const PASSWORD_SAVED = 'Password saved. Next time, sign in with your email and this password.';

/** Why Auth refused a new password, in plain words. Never echoes Auth's own text. */
export function passwordProblem(code: string | undefined): string {
  if (code === 'same_password') return 'Choose a password different from your current one.';
  if (code === 'weak_password') return 'Choose a longer or less common password.';
  if (code === 'reauthentication_needed') return 'For your security, sign out and in again, then choose your password.';
  return 'Could not save the password. Please try again.';
}
