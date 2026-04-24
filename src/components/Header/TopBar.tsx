import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { PRESET_LANGUAGES } from '../../types/dictionary';
import { Toggle } from '../UI/Toggle';
import { Button } from '../UI/Button';
import { SessionBar } from '../Session/SessionBar';

type View = 'search' | 'history';

interface Props {
  view: View;
  onChangeView: (v: View) => void;
}

export function TopBar({ view, onChangeView }: Props) {
  const language = useDictStore((s) => s.prefs.language);
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const setLanguage = useDictStore((s) => s.setLanguage);
  const setShowPinyin = useDictStore((s) => s.setShowPinyin);

  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const isPreset = (PRESET_LANGUAGES as readonly string[]).includes(language);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === '__other__') {
      setCustomDraft(isPreset ? '' : language);
      setCustomOpen(true);
    } else {
      setLanguage(v);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h1 className="text-base font-semibold text-stone-800">课堂中文速查</h1>
          </div>

          <nav className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onChangeView('search')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                view === 'search'
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              查词
            </button>
            <button
              onClick={() => onChangeView('history')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                view === 'history'
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              历史 & 导出
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <Toggle
              label="拼音"
              checked={showPinyin}
              onChange={setShowPinyin}
            />

            <div className="flex items-center gap-2">
              <label className="text-sm text-stone-500">翻译至</label>
              <select
                className="text-sm border border-stone-300 rounded px-2 py-1 bg-white"
                value={isPreset ? language : '__other__'}
                onChange={handleSelect}
              >
                {PRESET_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
                <option value="__other__">
                  {isPreset ? '其他…' : `其他：${language}`}
                </option>
              </select>
            </div>

            <div className="h-5 w-px bg-stone-300" />
            <SessionBar />
          </div>
        </div>
      </header>

      {customOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center px-4"
          onClick={() => setCustomOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const v = customDraft.trim();
              if (v) {
                setLanguage(v);
                setCustomOpen(false);
              }
            }}
            className="bg-white rounded-lg shadow-lg p-5 w-full max-w-sm"
          >
            <h3 className="text-base font-semibold mb-2">自定义目标语言</h3>
            <p className="text-sm text-stone-500 mb-3">
              输入任意语言名称（如 "Tiếng Việt"、"Português"、"हिन्दी"）。
            </p>
            <input
              autoFocus
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
              placeholder="语言名称"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustomOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" size="sm" disabled={!customDraft.trim()}>
                确定
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
