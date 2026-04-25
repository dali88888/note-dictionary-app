import { useCallback } from 'react';
import { useDictStore } from '../store/dictStore';
import { translate, type StringKey, type UILang } from './index';

export function useT(): {
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  lang: UILang;
} {
  const lang = useDictStore((s) => s.prefs.uiLanguage);
  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
