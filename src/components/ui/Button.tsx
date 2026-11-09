import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'star';
type Size = 'md' | 'lg' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong shadow-card',
  secondary: 'bg-surface-2 text-text hover:brightness-105 border border-border',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110 dark:text-bg',
  star: 'bg-star text-[#2b1d00] hover:brightness-105 shadow-card',
};
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5 rounded-xl',
  md: 'min-h-12 px-4 text-base gap-2 rounded-2xl',
  lg: 'min-h-14 px-6 text-lg gap-2.5 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block,
    icon,
    busy,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center font-display font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {busy ? (
        <span
          className="size-5 animate-spin rounded-full border-2 border-current border-e-transparent"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children !== undefined && <span className="min-w-0 text-center leading-tight">{children}</span>}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition hover:bg-surface-2 active:scale-95 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
