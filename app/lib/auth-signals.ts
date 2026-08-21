/**
 * Sign-in outcomes the login screen has to tell apart, as plain strings with no
 * server dependencies — `lib/auth.ts` throws them from `authorize()`, and the
 * login form reads them back off `signIn(...).error`. The credentials provider
 * has no other channel for "the password was right, now give me a code".
 */
export const TWO_FACTOR_REQUIRED = "2FA_REQUIRED";
export const TWO_FACTOR_INVALID = "2FA_INVALID";
