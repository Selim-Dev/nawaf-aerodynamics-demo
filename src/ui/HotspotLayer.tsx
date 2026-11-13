import type { AircraftData } from '../data/aircraft'
import { useL } from '../i18n/useT'
import { hotspotElements, useHotspotIds } from '../scene/Hotspots'
import { useStore } from '../store'

/**
 * The hotspot dots, as plain DOM buttons over the canvas. They are positioned
 * by HotspotProjector inside the scene. They are the main way in on touch
 * screens (no hover) and show learners what can be clicked.
 */
export function HotspotLayer({ data }: { data: AircraftData }) {
  const forced = useStore((s) => s.level === 'systems' && !!data.systemsById.get(s.activeSystem ?? '')?.markers)
  const show = useStore((s) => s.showHotspots) || forced
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const ids = useHotspotIds(data)
  const L = useL()
  if (!show) return null
  return (
    <div className="hotspot-layer">
      {ids.map((id) => {
        const part = data.partsById.get(id)!
        return (
          <button
            key={id}
            ref={(el) => {
              if (el) hotspotElements.set(id, el)
              else hotspotElements.delete(id)
            }}
            className="hotspot"
            style={{ visibility: 'hidden' }}
            data-selected={selected === id}
            aria-label={L(part.name)}
            title={L(part.name)}
            onClick={() => select(id, { focus: true })}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered({ partId: id })}
            onPointerLeave={() => setHovered(null)}
          />
        )
      })}
    </div>
  )
}
