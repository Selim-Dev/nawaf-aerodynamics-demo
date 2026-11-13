/**
 * Aircraft registry. Every folder under src/data/aircraft/ that contains the
 * four JSON files becomes an aircraft the app can show. Adding an aircraft is
 * a data task: copy a folder, change the files, no code changes.
 */
import type { Aircraft, Mapping, Part, System } from '../schema'

export interface AircraftData {
  aircraft: Aircraft
  parts: Part[]
  partsById: Map<string, Part>
  mapping: Mapping
  systems: System[]
  systemsById: Map<string, System>
}

type Json<T> = { default: T }
const aircraftFiles = import.meta.glob<Json<Aircraft>>('./*/aircraft.json', { eager: true })
const partFiles = import.meta.glob<Json<{ parts: Part[] }>>('./*/parts.json', { eager: true })
const mappingFiles = import.meta.glob<Json<Mapping>>('./*/mapping.json', { eager: true })
const systemFiles = import.meta.glob<Json<{ systems: System[] }>>('./*/systems.json', { eager: true })

const registry = new Map<string, AircraftData>()
for (const [path, mod] of Object.entries(aircraftFiles)) {
  const dir = path.slice(0, path.lastIndexOf('/'))
  const parts = partFiles[`${dir}/parts.json`]?.default.parts ?? []
  const systems = (systemFiles[`${dir}/systems.json`]?.default.systems ?? []).map((s) => ({
    ...s,
    components: s.components ?? [],
    routes: s.routes ?? [],
  }))
  const mapping = mappingFiles[`${dir}/mapping.json`]?.default ?? { fallback: 'fuselage', entries: [] }
  registry.set(mod.default.id, {
    aircraft: { ...mod.default, credits: mod.default.credits ?? [], specs: mod.default.specs ?? [], sources: mod.default.sources ?? [] },
    parts,
    partsById: new Map(parts.map((p) => [p.id, p])),
    mapping,
    systems,
    systemsById: new Map(systems.map((s) => [s.id, s])),
  })
}

export const aircraftList = [...registry.values()].map((d) => d.aircraft)

export function getAircraft(id: string): AircraftData {
  return registry.get(id) ?? registry.values().next().value!
}

/** Ids of the parts a system draws, in the order they first appear (components before pipes). */
export function drawnPartIds(system: System): string[] {
  const ids = new Set<string>()
  for (const c of system.components) ids.add(c.partId)
  for (const r of system.routes) if (r.partId) ids.add(r.partId)
  return [...ids]
}

/** Systems that have something to show in the Systems view. */
export function internalSystems(data: AircraftData) {
  return data.systems.filter((s) => s.components.length > 0 || s.routes.length > 0)
}
