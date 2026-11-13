import type { CSSProperties } from 'react'
import type { AircraftData } from '../data/aircraft'
import { useL, useT } from '../i18n/useT'
import { useStore } from '../store'

/**
 * The aircraft's name, set large in the corner of the 3D view: maker above,
 * type name, and one line saying what it is. In the Systems view the last
 * line names the system on show instead.
 */
export function Nameplate({ data }: { data: AircraftData }) {
  const t = useT()
  const L = useL()
  const level = useStore((s) => s.level)
  const activeSystem = useStore((s) => s.activeSystem)
  const { aircraft } = data
  const system = level === 'systems' ? data.systemsById.get(activeSystem ?? '') : undefined
  return (
    <div className="nameplate">
      {aircraft.manufacturer && <span className="np-maker">{L(aircraft.manufacturer)}</span>}
      <span className="np-name" dir="ltr">
        {aircraft.designation ?? L(aircraft.name)}
      </span>
      <span className="np-rule" />
      {system ? (
        <span className="np-tag" style={{ '--c': system.color } as CSSProperties}>
          <i className="swatch" />
          {t('systemsView')} · <bdi>{L(system.name)}</bdi>
        </span>
      ) : (
        aircraft.tagline && <span className="np-tag">{L(aircraft.tagline)}</span>
      )}
    </div>
  )
}
