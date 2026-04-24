import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed',
  secondary:
    'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-stone-700 hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed',
};

const SIZES: Record<Size, string> = {
  sm: 'text-sm px-2.5 py-1 rounded',
  md: 'text-sm px-3.5 py-1.5 rounded-md',
  lg: 'text-base px-5 py-2 rounded-md',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-colors ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
