export interface Syllable {
  hanzi: string;
  pinyin: string;
}

export interface Example {
  chinese: Syllable[];
  translation: string;
}

/**
 * Translation direction.
 * - "zh-to-other": user inputs Chinese, gets translation in target language (original feature)
 * - "other-to-zh": user inputs any language, gets idiomatic Chinese candidates with register notes
 *
 * `direction` is optional on persisted entries for backward compatibility — `undefined` is
 * interpreted as "zh-to-other".
 */
export type TranslationDirection = 'zh-to-other' | 'other-to-zh';

/**
 * Register of a Chinese expression. Used in reverse-translation mode to help learners
 * pick the right candidate among synonyms (e.g. 高兴/开心/愉快/欢喜).
 */
export type Register = 'casual' | 'colloquial' | 'neutral' | 'formal' | 'literary';

export const REGISTERS: readonly Register[] = [
  'casual',
  'colloquial',
  'neutral',
  'formal',
  'literary',
] as const;

export interface Meaning {
  partOfSpeech: string;
  /** [zh-to-other] polyphone reading hint for this meaning */
  pinyin?: string;
  /** [other-to-zh] the Chinese candidate, broken per-character with pinyin */
  hanziSyllables?: Syllable[];
  /** [other-to-zh] register classification of this candidate */
  register?: Register;
  /**
   * Both directions: the explanation in the non-Chinese language.
   * - zh→other: meaning of the Chinese word in target lang
   * - other→zh: usage note explaining when to pick this Chinese candidate vs. others
   */
  definition: string;
  example: Example;
}

export interface DictionaryEntry {
  id: string;
  /** Translation direction. Optional for backward compatibility (legacy = "zh-to-other"). */
  direction?: TranslationDirection;
  /** Original input the user typed. */
  word: string;
  /**
   * Per-character Chinese form with pinyin.
   * - zh→other: the queried Chinese word
   * - other→zh: empty array (input was not Chinese)
   */
  wordSyllables: Syllable[];
  /**
   * - zh→other: target language the user requested
   * - other→zh: source language auto-detected by the AI (may be mixed, e.g. "English + Japanese")
   */
  language: string;
  meanings: Meaning[];
  queriedAt: number;
}

export type TranslateResponse = Omit<DictionaryEntry, 'id' | 'queriedAt'> & {
  /**
   * True when the API served this response from the global
   * dictionary_cache (somebody else — or an earlier request from this
   * user — had already paid the AI cost).  Drives the "⚡ 已缓存"
   * badge.  Absent or false on cache miss.
   */
  _fromCache?: boolean;
};

export type SessionKind = 'auto' | 'manual';

export interface ClassSession {
  id: string;
  name: string;
  kind: SessionKind;
  createdAt: number;
  endedAt?: number;
  entryIds: string[];
}

export interface ExportOptions {
  includePinyin: boolean;
  includeExampleTranslation: boolean;
  wordsPerSlide: 1 | 2;
  title?: string;
}

export const PRESET_LANGUAGES = [
  'English',
  '日本語',
  '한국어',
  'Español',
  'Français',
  'Deutsch',
  'Русский',
  'العربية',
] as const;

export type PresetLanguage = (typeof PRESET_LANGUAGES)[number];
