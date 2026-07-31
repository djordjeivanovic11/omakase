import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'secondary', children, className = '', ...props }: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`.trim()} {...props}>
      {children}
      <style>{`
        .btn {
          font: inherit;
          border-radius: 999px;
          padding: 0.55rem 1.1rem;
          border: 1px solid transparent;
          cursor: pointer;
        }
        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .btn-primary {
          background: var(--color-accent);
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--color-accent-hover);
        }
        .btn-secondary {
          background: #fff;
          border-color: var(--color-border);
          color: var(--color-text);
        }
        .btn-ghost {
          background: transparent;
          color: var(--color-accent);
        }
      `}</style>
    </button>
  );
}
