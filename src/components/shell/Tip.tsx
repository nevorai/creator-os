import { cloneElement, useState, type ReactElement } from 'react'

type Props = { label: string; disabled?: boolean; side?: 'right' | 'bottom' | 'top'; children: ReactElement<Record<string, unknown>> }

/** The name of an icon, shown the instant the pointer or keyboard focus lands on it (no slow `title`). */
export function Tip({ label, disabled = false, side = 'right', children }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const show = (el: Element) => {
    const r = el.getBoundingClientRect()
    setAt(side === 'right' ? { x: r.right + 10, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: side === 'bottom' ? r.bottom + 10 : r.top - 10 })
  }
  const hide = () => setAt(null)
  const transform = side === 'right' ? 'translateY(-50%)' : side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%,-100%)'
  return (
    <>
      {cloneElement(children, {
        onPointerEnter: (e: React.PointerEvent) => { if (!disabled && e.pointerType === 'mouse') show(e.currentTarget) },
        onPointerLeave: hide,
        onFocus: (e: React.FocusEvent) => { if (!disabled && (e.target as HTMLElement).matches(':focus-visible')) show(e.currentTarget) },
        onBlur: hide,
        onClick: (e: React.MouseEvent) => { hide(); (children.props.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e) },
      })}
      {at && !disabled && (
        <div role="tooltip" style={{ position: 'fixed', left: at.x, top: at.y, transform }} className="pointer-events-none z-[60] whitespace-nowrap rounded-[10px] bg-[var(--text)] px-2.5 py-1.5 text-xs font-medium text-[var(--canvas)] shadow-md">
          {label}
        </div>
      )}
    </>
  )
}
