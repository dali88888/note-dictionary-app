import type { Syllable } from '../../types/dictionary';

export type ChineseLineSize = 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  syllables: Syllable[];
  showPinyin: boolean;
  size?: ChineseLineSize;
  centered?: boolean;
}

export function ChineseLine({
  syllables,
  showPinyin,
  size = 'md',
  centered,
}: Props) {
  return (
    <div
      className={`flex flex-wrap items-end gap-x-1 ${
        centered ? 'justify-center' : ''
      }`}
    >
      {syllables.map((s, i) => (
        <span key={i} className={`hanzi-cluster size-${size}`}>
          <span className="pinyin">
            {showPinyin && s.pinyin ? s.pinyin : '\u00A0'}
          </span>
          <span className="hanzi">{s.hanzi}</span>
        </span>
      ))}
    </div>
  );
}
