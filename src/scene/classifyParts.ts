/**
 * Turns any model into one real mesh per part.
 *
 * For each object of the model, in this order:
 * 1. Volumes that name this object in their own `meshes` list cut a region out
 *    of it, such as the rudder out of a one-piece fin or the radome out of the
 *    fuselage. Box volumes cut the triangles exactly along the box faces, so
 *    the seam is straight however coarse the object's triangles are.
 * 2. If an entry lists the object (or an ancestor node) in its `meshes`, what
 *    is left of it belongs to that part.
 * 3. Otherwise each triangle's centre (in the aircraft frame) is tested
 *    against the general volumes in entry order; the first match wins,
 *    otherwise the triangle goes to `mapping.fallback`.
 *
 * Objects that are not cut keep sharing the source vertex buffers and only get
 * their own index buffer, so splitting costs little memory. Picking is exact
 * on the real surface and highlighting tints the real skin of that part.
 */
import * as THREE from 'three'
import type { Mapping, Volume } from '../data/schema'

export interface ClassifiedPart {
  partId: string
  meshes: THREE.Mesh[]
  box: THREE.Box3
}

interface PreparedVolume {
  partId: string
  inverse: THREE.Matrix4
  shape: Volume['shape']
  mirror: boolean
  /** If set, the volume only applies to these objects of the model. */
  only?: Set<string>
}

const DEG = Math.PI / 180

export function volumeMatrix(v: Volume) {
  const r = v.rotation ?? [0, 0, 0]
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...v.center),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)),
    new THREE.Vector3(...v.size),
  )
}

function prepareVolumes(mapping: Mapping): PreparedVolume[] {
  const out: PreparedVolume[] = []
  for (const e of mapping.entries)
    for (const v of e.volumes ?? [])
      out.push({ partId: e.partId, inverse: volumeMatrix(v).invert(), shape: v.shape, mirror: !!v.mirror, only: v.meshes ? new Set(v.meshes) : undefined })
  return out
}

const _local = new THREE.Vector3()
function inside(v: PreparedVolume, p: THREE.Vector3) {
  // Volumes are unit shapes scaled by `size`, so in local space a box is |x|<=0.5.
  _local.copy(p).applyMatrix4(v.inverse)
  if (v.shape === 'box') return Math.abs(_local.x) <= 0.5 && Math.abs(_local.y) <= 0.5 && Math.abs(_local.z) <= 0.5
  return _local.lengthSq() <= 0.25
}

const _mirror = new THREE.Vector3()
export function classifyPoint<T extends string | undefined>(volumes: PreparedVolume[], p: THREE.Vector3, fallback: T): string | T {
  for (const v of volumes) {
    if (inside(v, p)) return v.partId
    if (v.mirror && inside(v, _mirror.set(p.x, p.y, -p.z))) return v.partId
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Exact cutting of one object by box volumes
// ---------------------------------------------------------------------------

/** A vertex while cutting: its position in the aircraft frame, and all its attributes in the object's own space. */
interface CutVertex {
  w: THREE.Vector3
  d: Float32Array
}
type Polygon = CutVertex[]
interface AttributeSlot {
  name: string
  size: number
  offset: number
}

const EPS = 1e-6

function between(inner: CutVertex, outer: CutVertex, t: number): CutVertex {
  const d = new Float32Array(inner.d.length)
  for (let i = 0; i < d.length; i++) d[i] = inner.d[i] + (outer.d[i] - inner.d[i]) * t
  return { w: inner.w.clone().lerp(outer.w, t), d }
}

/** Splits a convex polygon by a plane, given each vertex's signed distance to it (negative = inside). */
function splitPolygon(poly: Polygon, dist: number[]): { inner: Polygon | null; outer: Polygon | null } {
  let anyInner = false
  let anyOuter = false
  for (const s of dist) {
    if (s < -EPS) anyInner = true
    else if (s > EPS) anyOuter = true
  }
  if (!anyOuter) return { inner: poly, outer: null }
  if (!anyInner) return { inner: null, outer: poly }

  const inner: Polygon = []
  const outer: Polygon = []
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    const a = poly[i]
    const b = poly[j]
    const da = dist[i]
    const db = dist[j]
    if (da <= EPS) inner.push(a)
    if (da >= -EPS) outer.push(a)
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      // Always interpolate from the inside vertex towards the outside one. Two triangles that
      // share this edge then compute exactly the same point, so no crack opens between them.
      const v = da < 0 ? between(a, b, da / (da - db)) : between(b, a, db / (db - da))
      inner.push(v)
      outer.push(v)
    }
  }
  return { inner: inner.length >= 3 ? inner : null, outer: outer.length >= 3 ? outer : null }
}

/** Cuts polygons by the six faces of a unit box given in the box's local space. */
function cutByBox(polys: Polygon[], toLocal: (w: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3) {
  let inner = polys
  const outer: Polygon[] = []
  const local = new THREE.Vector3()
  for (let axis = 0; axis < 3 && inner.length; axis++)
    for (const sign of [1, -1]) {
      const next: Polygon[] = []
      for (const poly of inner) {
        const dist = poly.map((v) => sign * toLocal(v.w, local).getComponent(axis) - 0.5)
        const r = splitPolygon(poly, dist)
        if (r.inner) next.push(r.inner)
        if (r.outer) outer.push(r.outer)
      }
      inner = next
    }
  return { inner, outer }
}

function polygonCentre(poly: Polygon, out: THREE.Vector3) {
  out.set(0, 0, 0)
  for (const v of poly) out.add(v.w)
  return out.divideScalar(poly.length)
}

/**
 * Cuts one object by the volumes that target it.
 * @returns per part id, the flat vertex data of its triangles (not indexed) and its bounds.
 */
function cutObject(
  geo: THREE.BufferGeometry,
  world: THREE.Matrix4,
  targeted: PreparedVolume[],
  rest: (centre: THREE.Vector3) => string,
) {
  // All attributes of a vertex side by side, as real floats. Compressed models store
  // positions as normalised integers; getComponent() returns the real value.
  const slots: AttributeSlot[] = []
  let stride = 0
  for (const [name, attr] of Object.entries(geo.attributes)) {
    slots.push({ name, size: attr.itemSize, offset: stride })
    stride += attr.itemSize
  }
  const pos = geo.getAttribute('position')
  const posOffset = slots.find((s) => s.name === 'position')!.offset
  const vertexAt = (i: number): CutVertex => {
    const d = new Float32Array(stride)
    for (const s of slots) {
      const attr = geo.attributes[s.name]
      for (let c = 0; c < s.size; c++) d[s.offset + c] = attr.getComponent(i, c)
    }
    return { w: new THREE.Vector3(d[posOffset], d[posOffset + 1], d[posOffset + 2]).applyMatrix4(world), d }
  }

  let remaining: Polygon[] = []
  const count = geo.index ? geo.index.count : pos.count
  const at = (k: number) => (geo.index ? geo.index.getX(k) : k)
  for (let k = 0; k + 2 < count; k += 3) remaining.push([vertexAt(at(k)), vertexAt(at(k + 1)), vertexAt(at(k + 2))])

  const out = new Map<string, { data: number[]; box: THREE.Box3 }>()
  const emit = (partId: string, polys: Polygon[]) => {
    let o = out.get(partId)
    if (!o) out.set(partId, (o = { data: [], box: new THREE.Box3() }))
    for (const poly of polys)
      for (let i = 1; i + 1 < poly.length; i++)
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          for (let c = 0; c < stride; c++) o.data.push(v.d[c])
          o.box.expandByPoint(v.w)
        }
  }

  const centre = new THREE.Vector3()
  for (const v of targeted)
    for (const mirrored of v.mirror ? [false, true] : [false]) {
      const toLocal = (w: THREE.Vector3, o: THREE.Vector3) => o.set(w.x, w.y, mirrored ? -w.z : w.z).applyMatrix4(v.inverse)
      if (v.shape === 'box') {
        const r = cutByBox(remaining, toLocal)
        emit(v.partId, r.inner)
        remaining = r.outer
      } else {
        // Ellipsoids are not cut: whole triangles go by their centre.
        const keep: Polygon[] = []
        for (const poly of remaining) {
          if (toLocal(polygonCentre(poly, centre), _local).lengthSq() <= 0.25) emit(v.partId, [poly])
          else keep.push(poly)
        }
        remaining = keep
      }
    }
  for (const poly of remaining) emit(rest(polygonCentre(poly, centre)), [poly])

  return { slots, stride, parts: out }
}

// ---------------------------------------------------------------------------

/** Every source name on the way up from an object: its own and its ancestors'. */
function sourceNames(obj: THREE.Object3D, root: THREE.Object3D) {
  const names = new Set<string>()
  for (let o: THREE.Object3D | null = obj; o && o !== root.parent; o = o.parent) {
    names.add(o.name)
    names.add(sourceName(o))
  }
  return names
}

/**
 * The name the model file gave an object. three.js strips characters such as
 * "." from object names ("Cylinder.027" becomes "Cylinder027") but keeps the
 * original in userData.name; mapping.json uses the original.
 */
export function sourceName(o: THREE.Object3D): string {
  return (o.userData?.name as string | undefined) ?? o.name
}

/** Finds the mapping entry that claims this mesh by its own or an ancestor's name. */
function nameMatch(obj: THREE.Object3D, byName: Map<string, string>, root: THREE.Object3D) {
  for (let o: THREE.Object3D | null = obj; o && o !== root.parent; o = o.parent) {
    const hit = byName.get(sourceName(o)) ?? byName.get(o.name)
    if (hit) return hit
  }
  return undefined
}

/** Name of the nearest named object: the mesh itself, or the node that owns a multi-material mesh. */
function nearestSourceName(obj: THREE.Object3D, root: THREE.Object3D) {
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) if (o.userData?.name) return o.userData.name as string
  return obj.name
}

/**
 * @param root A model whose matrixWorld places it in the aircraft frame
 *             (call root.updateMatrixWorld(true) first).
 */
export function classifyParts(root: THREE.Object3D, mapping: Mapping): Map<string, ClassifiedPart> {
  const byName = new Map<string, string>()
  for (const e of mapping.entries) for (const n of e.meshes ?? []) byName.set(n, e.partId)
  const volumes = prepareVolumes(mapping)
  const general = volumes.filter((v) => !v.only)
  const result = new Map<string, ClassifiedPart>()

  const bucket = (partId: string) => {
    let p = result.get(partId)
    if (!p) result.set(partId, (p = { partId, meshes: [], box: new THREE.Box3() }))
    return p
  }
  const addMesh = (partId: string, geometry: THREE.BufferGeometry, material: THREE.Material, src: THREE.Mesh) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${src.name || 'mesh'}:${partId}`
    mesh.matrixAutoUpdate = false
    mesh.matrix.copy(src.matrixWorld)
    mesh.userData = { partId, sourceName: nearestSourceName(src, root), sourceMesh: src }
    bucket(partId).meshes.push(mesh)
  }

  const sources: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) sources.push(o as THREE.Mesh)
  })

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const centroid = new THREE.Vector3()

  for (const src of sources) {
    const geo = src.geometry as THREE.BufferGeometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) continue
    const world = src.matrixWorld
    const named = nameMatch(src, byName, root)
    const names = sourceNames(src, root)
    const targeted = volumes.filter((v) => v.only && [...v.only].some((n) => names.has(n)))

    // 1. Objects that volumes cut into parts get new, exactly cut geometry.
    if (targeted.length && !Array.isArray(src.material)) {
      const cut = cutObject(geo, world, targeted, (centre) => named ?? classifyPoint(general, centre, mapping.fallback))
      for (const [partId, piece] of cut.parts) {
        const g = new THREE.BufferGeometry()
        const vertices = piece.data.length / cut.stride
        for (const s of cut.slots) {
          const array = new Float32Array(vertices * s.size)
          for (let i = 0; i < vertices; i++) for (let k = 0; k < s.size; k++) array[i * s.size + k] = piece.data[i * cut.stride + s.offset + k]
          g.setAttribute(s.name, new THREE.BufferAttribute(array, s.size))
        }
        g.computeBoundingBox()
        g.computeBoundingSphere()
        addMesh(partId, g, src.material, src)
        bucket(partId).box.union(piece.box)
      }
      continue
    }

    // 2 and 3. Everything else is split by triangle and keeps sharing the source vertex buffers.
    const materials = Array.isArray(src.material) ? src.material : [src.material]
    const triCount = geo.index ? geo.index.count / 3 : pos.count / 3
    const idx = (k: number) => (geo.index ? geo.index.getX(k) : k)

    // Material index per triangle, from geometry groups when the material is an array.
    const matOf = new Uint16Array(triCount)
    if (Array.isArray(src.material) && geo.groups.length)
      for (const g of geo.groups) {
        const end = Math.min(triCount, (g.start + g.count) / 3)
        for (let t = g.start / 3; t < end; t++) matOf[t] = g.materialIndex ?? 0
      }

    // partId|materialIndex -> triangle vertex indices
    const out = new Map<string, number[]>()
    for (let t = 0; t < triCount; t++) {
      const i0 = idx(t * 3)
      const i1 = idx(t * 3 + 1)
      const i2 = idx(t * 3 + 2)
      let partId: string | undefined
      if (targeted.length || !named) {
        a.fromBufferAttribute(pos, i0)
        b.fromBufferAttribute(pos, i1)
        c.fromBufferAttribute(pos, i2)
        centroid.copy(a).add(b).add(c).divideScalar(3).applyMatrix4(world)
        if (targeted.length) partId = classifyPoint(targeted, centroid, undefined)
        if (!partId && !named) partId = classifyPoint(general, centroid, mapping.fallback)
      }
      partId ??= named ?? mapping.fallback
      const key = `${partId}|${matOf[t]}`
      let list = out.get(key)
      if (!list) out.set(key, (list = []))
      list.push(i0, i1, i2)
    }

    for (const [key, indices] of out) {
      const [partId, mi] = key.split('|')
      const g = new THREE.BufferGeometry()
      for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr)
      g.setIndex(indices)
      g.boundingSphere = geo.boundingSphere ?? (geo.computeBoundingSphere(), geo.boundingSphere)
      g.boundingBox = geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox)
      addMesh(partId, g, materials[Number(mi)] ?? materials[0], src)
      const box = bucket(partId).box
      for (const k of indices) box.expandByPoint(a.fromBufferAttribute(pos, k).applyMatrix4(world))
    }
  }
  return result
}

/** Builds a 4x4 transform for the GLB-to-aircraft-frame settings in aircraft.json. */
export function frameMatrix(frame: { scale: number; rotation: [number, number, number]; offset: [number, number, number] }) {
  const r = frame.rotation
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...frame.offset),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)),
    new THREE.Vector3(frame.scale, frame.scale, frame.scale),
  )
}
