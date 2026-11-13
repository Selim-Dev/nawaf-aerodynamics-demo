import { useEffect, useRef, type CSSProperties } from 'react'
import type { AircraftData } from '../data/aircraft'
import { useL } from '../i18n/useT'
import { useStore } from '../store'

/**
 * One DOM label that follows the mouse. Positioned from the pointer, not from
 * 3D, and it ignores pointer events so it can never steal the hover.
 */
export function Tooltip({ data }: { data: AircraftData }) {
  const hovered = useStore((s) => s.hovered)
  const L = useL()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el || e.pointerType !== 'mouse') return
      // Only label things in the 3D view; list items already show their own name.
      el.dataset.oncanvas = String((e.target as Element | null)?.tagName === 'CANVAS')
      const pad = 14
      const w = el.offsetWidth
      const h = el.offsetHeight
      // Keep the label on screen at both edges, in either reading direction.
      const x = e.clientX + pad + w > window.innerWidth ? e.clientX - pad - w : e.clientX + pad
      const y = e.clientY + pad + h > window.innerHeight ? e.clientY - pad - h : e.clientY + pad
      el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])

  const part = hovered?.partId ? data.partsById.get(hovered.partId) : undefined
  const text = part ? L(part.name) : hovered?.label
  const color = part ? data.systemsById.get(part.system)?.color : undefined
  return (
    <div ref={ref} className="tooltip" data-visible={!!text} role="presentation" style={{ '--c': color ?? 'var(--accent)' } as CSSProperties}>
      <i className="swatch" />
      <bdi>{text}</bdi>
    </div>
  )
}
