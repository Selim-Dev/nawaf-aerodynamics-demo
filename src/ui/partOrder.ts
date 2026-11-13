import { drawnPartIds, type AircraftData } from '../data/aircraft'
import { useStore, type Level } from '../store'

/**
 * The parts of the current view in the order the sidebar lists them:
 * exterior parts grouped by category, or what the active system draws.
 * "Previous / next part" and the arrow keys walk this list.
 */
export function orderedPartIds(data: AircraftData, level: Level, activeSystem: string | null): string[] {
  if (level === 'exterior') {
    const exterior = data.parts.filter((p) => p.kind === 'exterior')
    return data.systems.flatMap((sys) => exterior.filter((p) => p.system === sys.id).map((p) => p.id))
  }
  const system = activeSystem ? data.systemsById.get(activeSystem) : undefined
  return system ? drawnPartIds(system).filter((id) => data.partsById.has(id)) : []
}

/** Selects the part before or after the current one, wrapping round, and flies the camera to it. */
export function stepPart(data: AircraftData, direction: 1 | -1) {
  const s = useStore.getState()
  const ids = orderedPartIds(data, s.level, s.activeSystem)
  if (!ids.length) return
  const i = s.selected ? ids.indexOf(s.selected) : -1
  const next = i < 0 ? (direction > 0 ? 0 : ids.length - 1) : (i + direction + ids.length) % ids.length
  s.select(ids[next], { focus: true })
}

/** Lower-case, and forgiving about Arabic spelling variants, so a search finds what was meant. */
export function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
}
