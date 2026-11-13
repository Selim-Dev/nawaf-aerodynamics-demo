/**
 * Checks every aircraft's data files before a build (npm run validate).
 *
 *  - each JSON file matches its schema (src/data/schema.ts)
 *  - every part id referenced in mapping/systems exists in parts.json
 *  - part ids are unique; every part has text in both languages
 *  - mesh names in mapping.json exist in the model (GLB or placeholder)
 *  - media files and route endpoints resolve
 *
 * Exit code 1 on any error, so `npm run build` stops before shipping bad data.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AircraftFile, MappingFile, PartsFile, SystemsFile } from '../src/data/schema.ts'
import { PLACEHOLDER_MESH_NAMES } from '../src/scene/placeholderNames.ts'

const root = resolve(import.meta.dirname, '..')
const dataDir = join(root, 'src/data/aircraft')
let errors = 0
let warnings = 0
const err = (where: string, msg: string) => {
  errors++
  console.error(`  ✗ ${where}: ${msg}`)
}
const warn = (where: string, msg: string) => {
  warnings++
  console.warn(`  ! ${where}: ${msg}`)
}

function load<T>(file: string, schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }) {
  if (!existsSync(file)) {
    err(file, 'missing')
    return undefined
  }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    err(file, `not valid JSON: ${(e as Error).message}`)
    return undefined
  }
  const r = schema.safeParse(json)
  if (!r.success) {
    for (const i of r.error!.issues) err(file.replace(root, '.'), `${i.path.join('.') || '(root)'}: ${i.message}`)
    return undefined
  }
  return r.data
}

/** Node and mesh names from a .glb file's JSON chunk. */
function glbNames(file: string): Set<string> {
  const buf = readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file')
  const jsonLen = buf.readUInt32LE(12)
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const names = new Set<string>()
  for (const n of gltf.nodes ?? []) if (n.name) names.add(n.name)
  for (const m of gltf.meshes ?? []) if (m.name) names.add(m.name)
  return names
}

for (const dir of readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const base = join(dataDir, dir.name)
  console.log(`\n${dir.name}`)
  const aircraft = load(join(base, 'aircraft.json'), AircraftFile)
  const parts = load(join(base, 'parts.json'), PartsFile)
  const mapping = load(join(base, 'mapping.json'), MappingFile)
  const systems = load(join(base, 'systems.json'), SystemsFile)
  if (!aircraft || !parts || !mapping || !systems) continue

  const ids = new Set<string>()
  for (const p of parts.parts) {
    if (ids.has(p.id)) err('parts.json', `duplicate part id "${p.id}"`)
    ids.add(p.id)
    if (p.details.en.length !== p.details.ar.length)
      warn('parts.json', `"${p.id}" has ${p.details.en.length} English and ${p.details.ar.length} Arabic paragraphs`)
    for (const m of p.media ?? [])
      if (m.type !== 'youtube' && !/^https?:/.test(m.src) && !existsSync(join(root, 'public', m.src)))
        err('parts.json', `"${p.id}" media file public/${m.src} not found`)
  }
  const systemIds = new Set(systems.systems.map((s) => s.id))
  for (const p of parts.parts) if (!systemIds.has(p.system)) err('parts.json', `"${p.id}" uses unknown system "${p.system}"`)

  const known = (where: string, id: string) => {
    if (!ids.has(id)) err(where, `part "${id}" is not in parts.json`)
  }
  known('mapping.json fallback', mapping.fallback)

  let modelNames: Set<string> | null = null
  if (aircraft.model === 'placeholder') modelNames = new Set(PLACEHOLDER_MESH_NAMES)
  else {
    const glb = join(root, 'public', aircraft.model)
    if (!existsSync(glb)) err('aircraft.json', `model public/${aircraft.model} not found`)
    else if (glb.endsWith('.glb')) modelNames = glbNames(glb)
    else warn('aircraft.json', 'mesh names are only checked for .glb models')
  }

  const mapped = new Set<string>()
  for (const e of mapping.entries) {
    known('mapping.json', e.partId)
    mapped.add(e.partId)
    for (const n of e.meshes ?? []) if (modelNames && !modelNames.has(n)) err('mapping.json', `"${e.partId}" names mesh "${n}", which is not in the model`)
    for (const v of e.volumes ?? [])
      for (const n of v.meshes ?? []) if (modelNames && !modelNames.has(n)) err('mapping.json', `a volume of "${e.partId}" names object "${n}", which is not in the model`)
    if (!e.meshes?.length && !e.volumes?.length && e.partId !== mapping.fallback)
      warn('mapping.json', `"${e.partId}" has no meshes and no volumes, so nothing will be assigned to it`)
  }

  const inSystems = new Set<string>()
  for (const s of systems.systems) {
    const comps = new Set<string>()
    for (const c of s.components) {
      known(`systems.json ${s.id}`, c.partId)
      comps.add(c.partId)
      inSystems.add(c.partId)
      if (c.circuit && !s.circuits?.some((k) => k.id === c.circuit)) err(`systems.json ${s.id}`, `"${c.partId}" uses unknown circuit "${c.circuit}"`)
    }
    for (const r of s.routes) {
      if (r.partId) {
        known(`systems.json ${s.id}`, r.partId)
        inSystems.add(r.partId)
      }
      for (const end of [r.from, r.to])
        if (typeof end === 'string' && !comps.has(end)) err(`systems.json ${s.id}`, `route "${r.id}" ends at "${end}", which is not a component of this system`)
      if (r.circuit && !s.circuits?.some((k) => k.id === r.circuit)) err(`systems.json ${s.id}`, `route "${r.id}" uses unknown circuit "${r.circuit}"`)
    }
  }

  for (const p of parts.parts) {
    if (p.kind === 'exterior' && !mapped.has(p.id) && p.id !== mapping.fallback) warn('parts.json', `exterior part "${p.id}" is not in mapping.json`)
    if (p.kind === 'component' && !inSystems.has(p.id)) warn('parts.json', `component "${p.id}" is not drawn by any system`)
  }
  console.log(`  ${parts.parts.length} parts, ${mapping.entries.length} mapping entries, ${systems.systems.length} systems`)
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
