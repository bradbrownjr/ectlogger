import { describe, it, expect, beforeEach } from 'vitest';
import {
  LINK_RESULTS,
  SIGNIN_ERRORS,
  linkResult,
  rememberSigninReturn,
  signinErrorText,
  takeSigninReturn,
} from './signInProviders';

// The codes routers/sign_in_providers.py sends back to the app.
const BACKEND_SIGNIN_CODES = ['cancelled', 'unavailable', 'failed', 'no_subject', 'no_verified_email',
  'signup_off', 'domain', 'banned'];
const BACKEND_LINK_CODES = ['linked', 'cancelled', 'expired', 'unavailable', 'linked_elsewhere', 'failed'];

describe('sign-in wording', () => {
  it('has words for every code the backend sends', () => {
    for (const code of BACKEND_SIGNIN_CODES) expect(SIGNIN_ERRORS[code]).toBeTruthy();
    for (const code of BACKEND_LINK_CODES) expect(LINK_RESULTS[code]).toBeTruthy();
  });

  it('falls back to a general message for anything else', () => {
    expect(signinErrorText('something_new')).toBe(SIGNIN_ERRORS.failed);
    expect(signinErrorText(null)).toBe(SIGNIN_ERRORS.failed);
    expect(linkResult('something_new')).toBe(LINK_RESULTS.failed);
    expect(linkResult(null)).toBeNull();
  });
});

describe('return path across the trip to the provider', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('is read once', () => {
    rememberSigninReturn('/scheduler/12?subscribe=1');
    expect(takeSigninReturn()).toBe('/scheduler/12?subscribe=1');
    expect(takeSigninReturn()).toBeNull();
  });

  it('never sends anyone to another site', () => {
    store.set('ectlogger.signinReturn', '//evil.example');
    expect(takeSigninReturn()).toBeNull();
    store.set('ectlogger.signinReturn', 'https://evil.example');
    expect(takeSigninReturn()).toBeNull();
  });

  it('clears an old path when there is none', () => {
    rememberSigninReturn('/nets/4');
    rememberSigninReturn(null);
    expect(takeSigninReturn()).toBeNull();
  });
});
