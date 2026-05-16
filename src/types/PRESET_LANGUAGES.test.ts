/**
 * Regression test: PRESET_LANGUAGES order MUST match UI_LANGS order.
 *
 * Maps to a UX requirement the user explicitly asked for: the
 * "Translate to" picker in SearchBox should show the same language
 * sequence as the page-language picker in the TopBar (🌐 dropdown).
 * Their brains expect the same nine items in the same order — picking
 * Spanish in the UI picker and seeing it 5th in one place but 4th in
 * the other is a small but persistent friction.
 *
 * If anyone reorders ONE of the two arrays in the future, this test
 * fails until they reorder both.  The Vercel build gate runs vitest,
 * so a desync can't ship to production.
 */
import { describe, expect, it } from 'vitest';
import { PRESET_LANGUAGES } from './dictionary';
import { UI_LANGS, UI_LANG_LABEL } from '../i18n';

describe('PRESET_LANGUAGES — invariants', () => {
  it('order matches UI_LANGS (mapped through UI_LANG_LABEL)', () => {
    const expectedFromUiLangs = UI_LANGS.map((code) => UI_LANG_LABEL[code]);
    expect([...PRESET_LANGUAGES]).toEqual(expectedFromUiLangs);
  });

  it('includes 中文 (asked for by user)', () => {
    expect(PRESET_LANGUAGES).toContain('中文');
  });

  it('has the same length as UI_LANGS (one preset per UI language)', () => {
    expect(PRESET_LANGUAGES.length).toBe(UI_LANGS.length);
  });

  it('contains no duplicates', () => {
    const unique = new Set(PRESET_LANGUAGES);
    expect(unique.size).toBe(PRESET_LANGUAGES.length);
  });
});
