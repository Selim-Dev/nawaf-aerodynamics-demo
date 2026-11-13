/**
 * Small procedural-geometry toolkit used by the placeholder airliner and by
 * the systems layer (fuel tanks are slices of the wing surface).
 * All coordinates are aircraft-frame metres (see src/data/schema.ts).
 */
import * as THREE from 'three'
import type { Surface, V3 } from '../data/schema'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _n = new THREE.Vector3()

/**
 * Builds an indexed grid surface. Each quad's winding is chosen so its face
 * normal agrees with `outward`, which keeps lighting correct without having
 * to reason about parameter directions.
 */
export function gridSurface(
  rows: number,
  cols: number,
  pos: (i: number, j: number) => THREE.Vector3,
  outward: (p: THREE.Vector3) => THREE.Vector3,
  closedCols = false,
): THREE.BufferGeometry {
  const positions: number[] = []
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const p = pos(i, j)
      positions.push(p.x, p.y, p.z)
    }
  const index: number[] = []
  const P = (k: number) => _a.set(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]).clone()
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j
      const b = (i + 1) * cols + j
      const c = (i + 1) * cols + j + 1
      const d = i * cols + j + 1
      pushQuad(index, a, b, c, d, P(a), P(b), P(c), P(d), outward)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  if (closedCols) weldSeamNormals(g, rows, cols)
  return g
}

function pushQuad(
  index: number[],
  a: number, b: number, c: number, d: number,
  pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3, pd: THREE.Vector3,
  outward: (p: THREE.Vector3) => THREE.Vector3,
) {
  const center = pa.clone().add(pb).add(pc).add(pd).multiplyScalar(0.25)
  _b.subVectors(pc, pa)
  _c.subVectors(pd, pb)
  _n.crossVectors(_b, _c) // diagonal cross: robust when one edge is degenerate
  if (_n.lengthSq() < 1e-14) {
    _b.subVectors(pb, pa)
    _c.subVectors(pd, pa)
    _n.crossVectors(_b, _c)
  }
  if (_n.dot(outward(center)) >= 0) index.push(a, b, c, a, c, d)
  else index.push(a, c, b, a, d, c)
}

/** Averages normals on the duplicated first/last column of a closed surface. */
function weldSeamNormals(g: THREE.BufferGeometry, rows: number, cols: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < rows; i++) {
    const a = i * cols
    const b = i * cols + cols - 1
    _a.fromBufferAttribute(n, a).add(_b.fromBufferAttribute(n, b)).normalize()
    n.setXYZ(a, _a.x, _a.y, _a.z)
    n.setXYZ(b, _a.x, _a.y, _a.z)
  }
  n.needsUpdate = true
}

/** Merges geometries that only have position + normal (+ optional uv). */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  let offset = 0
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0.toNonIndexed()
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let k = 0; k < p.count; k++) {
      pos.push(p.getX(k), p.getY(k), p.getZ(k))
      nor.push(n.getX(k), n.getY(k), n.getZ(k))
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + offset)
    else for (let k = 0; k < p.count; k++) idx.push(k + offset)
    offset += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setIndex(idx)
  return out
}

/** NACA 00xx half-thickness distribution, as a fraction of chord, at chord station c. */
export function nacaHalf(c: number, tc: number) {
  return 5 * tc * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4)
}

export interface PanelOptions {
  /** Mirror to the starboard side (z -> -z). */
  mirror?: boolean
  /** Scales thickness, e.g. 0.8 for a tank that sits inside the skin. */
  shrink?: number
  chordSteps?: number
  spanSteps?: number
}

/** Point on a lifting surface at span fraction s, chord fraction c, side +1 top / -1 bottom. */
export function surfacePoint(s: Surface, sf: number, cf: number, side: number, shrink = 1, mirror = false) {
  const le = new THREE.Vector3().fromArray(s.rootLE).lerp(new THREE.Vector3().fromArray(s.tipLE), sf)
  const chord = THREE.MathUtils.lerp(s.rootChord, s.tipChord, sf)
  const tc = THREE.MathUtils.lerp(s.thickness[0], s.thickness[1], sf)
  const half = nacaHalf(cf, tc) * chord * shrink
  const p = le.add(new THREE.Vector3(cf * chord, 0, 0)).addScaledVector(new THREE.Vector3().fromArray(s.normal), half * side)
  if (mirror) p.z = -p.z
  return p
}

/**
 * A closed solid slice of a lifting surface between span fractions
 * `span[0]..span[1]` and chord fractions `chord[0]..chord[1]`.
 * Used for wings, control surfaces and the fuel tanks inside the wing.
 */
export function liftingPanel(
  s: Surface,
  span: [number, number],
  chord: [number, number],
  opts: PanelOptions = {},
): THREE.BufferGeometry {
  const { mirror = false, shrink = 1, chordSteps = 14, spanSteps = 6 } = opts
  const normal = new THREE.Vector3().fromArray(s.normal)
  if (mirror) normal.z = -normal.z
  const spanDir = new THREE.Vector3().fromArray(s.tipLE).sub(new THREE.Vector3().fromArray(s.rootLE)).normalize()
  if (mirror) spanDir.z = -spanDir.z

  // Cosine spacing packs stations near the leading edge where curvature is high.
  const cs: number[] = []
  for (let i = 0; i <= chordSteps; i++) {
    const t = i / chordSteps
    const cosT = (1 - Math.cos(t * Math.PI)) / 2
    cs.push(THREE.MathUtils.lerp(chord[0], chord[1], chord[0] === 0 ? cosT : t))
  }
  const ss: number[] = []
  for (let j = 0; j <= spanSteps; j++) ss.push(THREE.MathUtils.lerp(span[0], span[1], j / spanSteps))

  const P = (sf: number, cf: number, side: number) => surfacePoint(s, sf, cf, side, shrink, mirror)
  const parts: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    parts.push(
      gridSurface(cs.length, ss.length, (i, j) => P(ss[j], cs[i], side), () => normal.clone().multiplyScalar(side)),
    )
  }
  // Caps: trailing edge (and leading edge when the slice starts aft of it).
  const chordCap = (cf: number, dir: number) =>
    gridSurface(2, ss.length, (i, j) => P(ss[j], cf, i === 0 ? 1 : -1), () => new THREE.Vector3(dir, 0, 0))
  parts.push(chordCap(chord[1], 1))
  if (chord[0] > 0.001) parts.push(chordCap(chord[0], -1))
  // Caps at the two span ends.
  const spanCap = (sf: number, dir: number) =>
    gridSurface(2, cs.length, (i, j) => P(sf, cs[j], i === 0 ? 1 : -1), () => spanDir.clone().multiplyScalar(dir))
  parts.push(spanCap(span[0], -1), spanCap(span[1], 1))
  return mergeSimple(parts)
}

/**
 * Surface of revolution around an axis parallel to +X through (y0, z0).
 * `radius` gives the radius at each x; `yOffset` lets the axis bend (fuselage upsweep);
 * `yScale` stretches the section vertically (the A320 fuselage is 3.95 m wide and 4.14 m tall).
 */
export function revolve(
  xs: number[],
  radius: (x: number) => number,
  y0: number,
  z0: number,
  segments = 40,
  yOffset: (x: number) => number = () => 0,
  yScale = 1,
): THREE.BufferGeometry {
  const pos = (i: number, j: number) => {
    const x = xs[i]
    const th = (j / segments) * Math.PI * 2
    const r = radius(x)
    return new THREE.Vector3(x, y0 + yOffset(x) + r * yScale * Math.cos(th), z0 + r * Math.sin(th))
  }
  return gridSurface(
    xs.length,
    segments + 1,
    pos,
    (p) => new THREE.Vector3(0, p.y - (y0 + yOffset(p.x)), p.z - z0),
    true,
  )
}

/** Evenly spaced numbers from a to b inclusive with roughly `step` spacing. */
export function range(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

export const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2])
