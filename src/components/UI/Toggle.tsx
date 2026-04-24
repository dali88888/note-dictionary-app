interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
}

export function Toggle({ checked, onChange, label, id }: Props) {
  const toggleId = id ?? `tgl-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label
      htmlFor={toggleId}
      className="inline-flex items-center gap-2 cursor-pointer select-none"
    >
      {label && <span className="text-sm text-stone-700">{label}</span>}
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-amber-600' : 'bg-stone-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
