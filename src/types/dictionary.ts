export interface Syllable {
  hanzi: string;
  pinyin: string;
}

export interface Example {
  chinese: Syllable[];
  translation: string;
}

export interface Meaning {
  partOfSpeech: string;
  pinyin?: string;
  definition: string;
  example: Example;
}

export interface DictionaryEntry {
  id: string;
  word: string;
  wordSyllables: Syllable[];
  language: string;
  meanings: Meaning[];
  queriedAt: number;
}

export type TranslateResponse = Omit<DictionaryEntry, 'id' | 'queriedAt'>;

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
