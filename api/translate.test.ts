/**
 * Regression tests for the Simplified-Chinese safety net.
 *
 * Maps to user-reported bug: "ensure all Chinese output (including
 * example sentences) is Simplified".  The prompts already mandate
 * Simplified, but Gemini occasionally drifts — especially when the
 * input contains traditional characters and its autoregressive
 * generation carries some 繁體 forms over.  `toSimplified()` is the
 * deterministic safety net: any traditional character we recognize
 * gets converted to its Simplified counterpart in-place.
 *
 * If anyone tries to "simplify" this back to prompt-only enforcement
 * in the future, the tests below fail and the Vercel build blocks
 * the deploy.
 */
import { describe, expect, it } from 'vitest';
import { toSimplified } from './translate';

describe('toSimplified — Simplified-Chinese safety net', () => {
  it('returns input unchanged when there are no traditional characters', () => {
    const { converted, replacements } = toSimplified('今天天气真好。');
    expect(converted).toBe('今天天气真好。');
    expect(replacements).toBe(0);
  });

  it('converts common traditional pronouns / function words', () => {
    // 個們這麼沒 → 个们这么没
    const { converted, replacements } = toSimplified('這個我們沒看過。');
    expect(converted).toBe('这个我们没看过。');
    expect(replacements).toBe(5); // 這→这, 個→个, 們→们, 沒→没, 過→过
  });

  it('converts traditional verbs (學 / 說 / 開)', () => {
    const { converted } = toSimplified('我們在學中文，老師說每天要開口練習。');
    // 們→们, 學→学, 師→师 (not in our map — kept as 師), 說→说, 開→开, 練→练, 習→习
    // 師 not in map → stays as 師, but everything else flips.
    expect(converted).toContain('们');
    expect(converted).toContain('学');
    expect(converted).toContain('说');
    expect(converted).toContain('开');
    expect(converted).toContain('练');
    expect(converted).toContain('习');
    expect(converted).not.toContain('們');
    expect(converted).not.toContain('學');
    expect(converted).not.toContain('說');
    expect(converted).not.toContain('開');
  });

  it('converts mixed traditional + simplified text correctly (idempotent on already-simplified)', () => {
    // Mix: 國 is traditional, 国 is simplified.  Both present should
    // come out all simplified.
    const { converted, replacements } = toSimplified('中國人和中国人');
    expect(converted).toBe('中国人和中国人');
    expect(replacements).toBe(1); // only the 國 got flipped
  });

  it('handles a realistic example sentence', () => {
    const { converted } = toSimplified('他每天開車去上學。');
    expect(converted).toBe('他每天开车去上学。');
  });

  it('does not over-convert characters NOT in the map', () => {
    // 他 / 中 / 国 / 人 / 朋 / 友 are all already simplified; should
    // pass through untouched.  No replacements expected.
    const { converted, replacements } = toSimplified('他和中国朋友吃饭。');
    expect(converted).toBe('他和中国朋友吃饭。');
    expect(replacements).toBe(0);
  });

  it('preserves punctuation and non-Chinese characters', () => {
    const { converted } = toSimplified('"這" → "这" (1 個 char)');
    expect(converted).toBe('"这" → "这" (1 个 char)');
  });

  it('is idempotent — running on already-simplified output yields the same output', () => {
    const once = toSimplified('這個學生很努力。').converted;
    const twice = toSimplified(once).converted;
    expect(once).toBe(twice);
    expect(toSimplified(once).replacements).toBe(0);
  });
});
