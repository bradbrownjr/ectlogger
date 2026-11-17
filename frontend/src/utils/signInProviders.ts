// ========== SIGN-IN PROVIDERS: WORDING AND RULES ==========
// What the sign-in page, its landing page (pages/ProviderSignIn.tsx) and
// Profile > Security say about Google, Microsoft and other OpenID Connect
// sign-in. The backend sends a short code for each outcome
// (routers/sign_in_providers.py); Admin > Activity has its own wording for the
// same codes (services/sign_in_providers.py REASON_TEXT).

import { safeRedirectPath } from './redirectPath';

/** Where the sign-in page leaves the page to return to, across the trip to
 *  the provider and back. Per tab, and read once. */
export const SIGNIN_RETURN_KEY = 'ectlogger.signinReturn';

/** Why a provider sign-in didn't sign anyone in, keyed by the backend's code. */
export const SIGNIN_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  unavailable: "That sign-in option isn't available right now. Sign in with your email instead.",
  failed: "Sign-in with that account didn't work. Try again, or sign in with your email.",
  no_subject: "Sign-in with that account didn't work. Try again, or sign in with your email.",
  no_verified_email:
    "That account didn't confirm its email address, so we can't tell which ECTLogger account is yours. "
    + 'Sign in with your email, then link it from Profile > Security.',
  signup_off:
    "No ECTLogger account uses that email address, and this sign-in option doesn't create new accounts. "
    + 'Sign in with your email to create your account.',
  domain:
    "No ECTLogger account uses that email address, and this sign-in option doesn't create accounts for its "
    + 'email domain. Sign in with your email instead.',
  banned: 'Your account has been locked. Please contact an administrator for assistance.',
};

export const signinErrorText = (code: string | null): string =>
  (code && SIGNIN_ERRORS[code]) || SIGNIN_ERRORS.failed;

/** How linking a provider from Profile went, keyed by the backend's code. */
export const LINK_RESULTS: Record<string, { severity: 'success' | 'error' | 'info'; text: string }> = {
  linked: { severity: 'success', text: 'Linked. You can now sign in with it.' },
  cancelled: { severity: 'info', text: 'Linking was cancelled.' },
  expired: { severity: 'error', text: 'That request to link expired. Try again.' },
  unavailable: { severity: 'error', text: "That sign-in option isn't available right now." },
  linked_elsewhere: {
    severity: 'error',
    text: 'That account is already linked to a different ECTLogger account. Unlink it there first.',
  },
  failed: { severity: 'error', text: "Linking didn't work. Try again." },
};

export const linkResult = (code: string | null) =>
  code ? LINK_RESULTS[code] ?? LINK_RESULTS.failed : null;

/** Remember where to return after the provider sends the browser back. */
export function rememberSigninReturn(path: string | null): void {
  try {
    if (path) sessionStorage.setItem(SIGNIN_RETURN_KEY, path);
    else sessionStorage.removeItem(SIGNIN_RETURN_KEY);
  } catch {
    // Storage blocked: the person lands on the dashboard instead.
  }
}

/** The remembered return path, once. Only a path inside this app. */
export function takeSigninReturn(): string | null {
  try {
    const value = sessionStorage.getItem(SIGNIN_RETURN_KEY);
    sessionStorage.removeItem(SIGNIN_RETURN_KEY);
    return safeRedirectPath(value);
  } catch {
    return null;
  }
}
