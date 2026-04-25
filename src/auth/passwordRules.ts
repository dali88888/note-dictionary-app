/**
 * Password strength rules for signup.
 *
 * The rules deliberately match what we tell the user up-front in the UI —
 * no surprise rejections from the server.  Each rule has an i18n key so the
 * UI can render the checklist localized.
 */

import type { StringKey } from '../i18n';

export interface PasswordRule {
  /** Stable id, also used as React key. */
  id: 'len' | 'lower' | 'upper' | 'digit' | 'special';
  /** i18n key describing the rule to the user. */
  labelKey: StringKey;
  /** Returns true if the candidate password satisfies this rule. */
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'len',
    labelKey: 'pwRuleLen',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'lower',
    labelKey: 'pwRuleLower',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'upper',
    labelKey: 'pwRuleUpper',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'digit',
    labelKey: 'pwRuleDigit',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'special',
    labelKey: 'pwRuleSpecial',
    // "Special" = anything that's not a letter or digit.  Matches typical
    // password-policy expectations and avoids requiring a fixed punctuation set.
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

export function passwordIsStrong(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
