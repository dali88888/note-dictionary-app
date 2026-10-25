/**
 * The search box must show the real reason an AI lookup failed.  When
 * the Gemini balance ran out, users were told "AI busy, retry in 30 s",
 * which sent them retrying forever.  The server now returns an
 * errorCode; these tests pin the client-side mapping to a localized
 * message that names the actual cause.
 */
import { describe, expect, it } from 'vitest';
import { localizeAiError } from './aiErrorMessage';
import { UI_LANGS } from '../i18n';

describe('localizeAiError', () => {
  it('billing code says credits ran out, not "busy"', () => {
    const msg = localizeAiError('zh', 'AI_BILLING', 'Gemini: out of credits (HTTP 402)');
    expect(msg).toContain('额度已用完');
    expect(msg).not.toContain('繁忙');
    expect(msg).toContain('(Gemini: out of credits (HTTP 402))');

    const en = localizeAiError('en', 'AI_BILLING', undefined);
    expect(en).toMatch(/run out of credits/);
    expect(en).not.toMatch(/busy/i);
  });

  it('every UI language has a distinct message for each code', () => {
    for (const lang of UI_LANGS) {
      const msgs = ['AI_BILLING', 'AI_AUTH', 'AI_BUSY', 'AI_FAILED'].map((c) =>
        localizeAiError(lang, c, undefined),
      );
      expect(msgs.every((m) => typeof m === 'string' && m.length > 0)).toBe(true);
      expect(new Set(msgs).size).toBe(4);
    }
  });

  it('returns null for unknown or missing codes so the raw server message is kept', () => {
    expect(localizeAiError('en', undefined, 'x')).toBeNull();
    expect(localizeAiError('en', 'SOMETHING_NEW', undefined)).toBeNull();
  });
});
