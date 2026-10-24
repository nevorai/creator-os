import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

// Shared visual language for the whole app — a dark, glass-adjacent premium
// dashboard aesthetic (accent violet, near-black surfaces). Every screen
// pulls from here instead of inventing its own spacing/color/radius, so the
// app reads as one system rather than 15 hand-styled pages.

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border-subtle bg-surface shadow-card ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/50">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

const BUTTON_VARIANTS = {
  primary:
    'bg-gradient-to-br from-accent-500 to-[#ff7a1a] text-on-brand shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset] hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100',
  secondary:
    'border border-border bg-surface-raised text-white/80 hover:border-white/20 hover:text-white disabled:opacity-40',
  ghost: 'text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-40',
  danger:
    'border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40',
} as const

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[14px] px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const BADGE_VARIANTS = {
  default: 'border border-white/10 bg-white/5 text-white/60',
  accent: 'border border-accent-500/25 bg-accent-500/15 text-accent-300',
  success: 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-300',
  warning: 'border border-amber-500/25 bg-amber-500/15 text-amber-300',
  danger: 'border border-red-500/25 bg-red-500/15 text-red-300',
} as const

export function Badge({
  variant = 'default',
  children,
  className = '',
}: {
  variant?: keyof typeof BADGE_VARIANTS
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-white/[0.02] p-8 text-center">
      <p className="text-sm font-medium text-white/70">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-white/40">{description}</p>}
    </div>
  )
}

const fieldClass =
  'w-full rounded-[14px] border border-border bg-surface-raised px-3.5 py-2.5 text-base text-white md:text-sm placeholder:text-white/30 outline-none transition-colors focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium text-white/40">{children}</div>
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">{label}</p>
      <p className="font-display mt-1.5 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </Card>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin text-current ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
