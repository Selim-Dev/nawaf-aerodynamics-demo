/**
 * Internal systems and compartments, generated from systems.json rather than
 * taken from the model: components are simple shapes, pipes are filleted
 * tubes. Only the active system is mounted, so nothing else can be picked.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { AircraftData } from '../data/aircraft'
import type { Component, Route, System, V3 } from '../data/schema'
import { useStore } from '../store'
import { liftingPanel, mergeSimple, surfacePoint } from './geometry'
import { lookFor } from './materials'
import { sceneRegistry } from './registry'
import { filletedPath, flowTexture, tubeFor } from './routeCurve'

const DEG = Math.PI / 180

function colorOf(system: System, circuit?: string) {
  return system.circuits?.find((c) => c.id === circuit)?.color ?? system.color
}

function componentMaterial(color: string, volume = false) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(volume ? 0.5 : 0.25),
    roughness: 0.45,
    metalness: 0.1,
    toneMapped: false,
    ...(volume ? { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide } : {}),
  })
}

/** Centre of a component in the aircraft frame (unmirrored). */
export function componentCenter(data: AircraftData, c: Component): THREE.Vector3 {
  if (c.shape === 'panel' && c.surface && c.span && c.chord) {
    const s = data.aircraft.surfaces[c.surface]
    return surfacePoint(s, (c.span[0] + c.span[1]) / 2, (c.chord[0] + c.chord[1]) / 2, 0)
  }
  const p = new THREE.Vector3(...(c.position ?? [0, 0, 0]))
  if (c.shape === 'seats') p.add(new THREE.Vector3((((c.rows ?? 1) - 1) * (c.pitch ?? 0.75)) / 2, 1.0, 0.95))
  return p
}

/** Rows of seats either side of one aisle, as one merged mesh. Origin: first row, on the floor, centreline. */
function seatRows(rows: number, pitch: number, abreast: [number, number]) {
  const seatW = 0.46
  const aisle = 0.25
  const geos: THREE.BufferGeometry[] = []
  const zs: number[] = []
  for (let k = 0; k < abreast[0]; k++) zs.push(aisle + seatW / 2 + k * seatW)
  for (let k = 0; k < abreast[1]; k++) zs.push(-(aisle + seatW / 2 + k * seatW))
  for (let i = 0; i < rows; i++)
    for (const z of zs) {
      const cushion = new THREE.BoxGeometry(0.44, 0.12, 0.42)
      cushion.translate(i * pitch, 0.44, z)
      const back = new THREE.BoxGeometry(0.09, 0.66, 0.42)
      back.rotateZ(-0.15)
      back.translate(i * pitch + 0.24, 0.8, z)
      geos.push(cushion, back)
    }
  return mergeSimple(geos)
}

function componentGeometry(data: AircraftData, c: Component): THREE.BufferGeometry {
  const [sx, sy, sz] = c.size ?? [0.3, 0.3, 0.3]
  switch (c.shape) {
    case 'panel':
      return liftingPanel(data.aircraft.surfaces[c.surface!], c.span!, c.chord!, {
        shrink: c.thickness ?? 0.72,
        chordSteps: 8,
        spanSteps: 4,
      })
    case 'seats':
      return seatRows(c.rows!, c.pitch!, c.abreast ?? [3, 3])
    case 'box':
      return new THREE.BoxGeometry(sx, sy, sz)
    case 'cylinder':
      return new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 24)
    case 'capsule':
      return new THREE.CapsuleGeometry(sx / 2, Math.max(0.001, sy - sx), 6, 16)
    case 'ellipsoid': {
      const g = new THREE.SphereGeometry(0.5, 20, 14)
      g.scale(sx, sy, sz)
      return g
    }
  }
}

interface BuiltItem {
  key: string
  partId: string | null
  label: string
  geometry: THREE.BufferGeometry
  /** A fatter invisible tube, so thin pipes are easy to hit. */
  pickGeometry?: THREE.BufferGeometry
  /** Outline for see-through compartments. */
  edges?: THREE.EdgesGeometry
  volume: boolean
  color: string
  material: THREE.MeshStandardMaterial
  position: THREE.Vector3
  rotation: THREE.Euler
  mirror: boolean
  /** Hotspot / focus point (port-side copy for mirrored items). */
  anchor: THREE.Vector3
  route?: { length: number; flow?: 1 | -1; map?: THREE.Texture }
}

function routePoints(data: AircraftData, system: System, r: Route): THREE.Vector3[] {
  const end = (e: string | V3) => {
    if (typeof e !== 'string') return new THREE.Vector3(...e)
    const comp = system.components.find((c) => c.partId === e)
    return comp ? componentCenter(data, comp) : new THREE.Vector3()
  }
  return [end(r.from), ...r.via.map((v) => new THREE.Vector3(...v)), end(r.to)]
}

function buildSystem(data: AircraftData, system: System, lang: 'en' | 'ar'): BuiltItem[] {
  const items: BuiltItem[] = []
  const nameOf = (partId?: string) => (partId ? data.partsById.get(partId)?.name[lang] : undefined)
  const circuitName = (id?: string) => system.circuits?.find((c) => c.id === id)?.name[lang]
  const tex = flowTexture()

  system.components.forEach((c, i) => {
    const placed = c.shape !== 'panel'
    const volume = c.style === 'volume'
    const r = c.rotation ?? [0, 0, 0]
    const color = colorOf(system, c.circuit)
    const geometry = componentGeometry(data, c)
    items.push({
      key: `c${i}-${c.partId}`,
      partId: c.partId,
      label: nameOf(c.partId) ?? c.partId,
      geometry,
      edges: volume ? new THREE.EdgesGeometry(geometry) : undefined,
      volume,
      color,
      material: componentMaterial(color, volume),
      position: placed ? new THREE.Vector3(...c.position!) : new THREE.Vector3(),
      rotation: new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG),
      mirror: !!c.mirror,
      anchor: componentCenter(data, c),
    })
  })

  system.routes.forEach((r, i) => {
    const path = filletedPath(routePoints(data, system, r))
    const color = colorOf(system, r.circuit)
    const material = componentMaterial(color)
    const length = path.getLength()
    let map: THREE.Texture | undefined
    if (r.flow) {
      map = tex.clone()
      map.repeat.set(Math.max(1, length / 0.9), 1)
      material.map = map
    }
    items.push({
      key: `r${i}-${r.id}`,
      partId: r.partId ?? null,
      label: nameOf(r.partId) ?? circuitName(r.circuit) ?? system.name[lang],
      geometry: tubeFor(path, r.radius),
      pickGeometry: tubeFor(path, Math.max(r.radius * 3.5, 0.13), 6),
      volume: false,
      color,
      material,
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      mirror: !!r.mirror,
      anchor: path.getPointAt(0.5),
      route: { length, flow: r.flow, map },
    })
  })
  return items
}

const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })
/**
 * See-through compartments are picked on their FAR walls (back faces), so
 * anything inside them is nearer to the pointer and wins the click.
 */
const volumePickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, side: THREE.BackSide })
const noRaycast = () => null

export function SystemsLayer({ data }: { data: AircraftData }) {
  const level = useStore((s) => s.level)
  const activeId = useStore((s) => s.activeSystem)
  const system = level === 'systems' && activeId ? data.systemsById.get(activeId) : undefined
  if (!system) return null
  return <SystemMeshes key={system.id} data={data} system={system} />
}

function SystemMeshes({ data, system }: { data: AircraftData; system: System }) {
  const lang = useStore((s) => s.lang)
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const flow = useStore((s) => s.flow)
  const setHovered = useStore((s) => s.setHovered)
  const select = useStore((s) => s.select)
  const bumpScene = useStore((s) => s.bumpScene)
  const authorMode = useStore((s) => s.authorMode)
  const items = useMemo(() => buildSystem(data, system, lang), [data, system, lang])
  const meshRefs = useRef(new Map<string, THREE.Mesh[]>())
  const lineRefs = useRef(new Map<string, THREE.LineSegments[]>())

  // Bounds and anchors for camera focus and hotspot dots.
  useLayoutEffect(() => {
    const boxes = new Map<string, THREE.Box3>()
    for (const it of items) {
      if (!it.partId) continue
      it.geometry.computeBoundingBox()
      const m = new THREE.Matrix4().compose(it.position, new THREE.Quaternion().setFromEuler(it.rotation), new THREE.Vector3(1, 1, 1))
      const box = it.geometry.boundingBox!.clone().applyMatrix4(m)
      if (it.mirror) box.union(box.clone().applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1)))
      boxes.set(it.partId, (boxes.get(it.partId) ?? new THREE.Box3()).union(box))
    }
    sceneRegistry.sysBounds.clear()
    sceneRegistry.sysAnchors.clear()
    for (const [id, box] of boxes) sceneRegistry.sysBounds.set(id, box)
    // The first item for a part (usually the component, not a pipe) places its dot.
    for (const it of [...items].reverse()) if (it.partId) sceneRegistry.sysAnchors.set(it.partId, it.anchor.clone())
    bumpScene()
  }, [items, bumpScene])

  useEffect(
    () => () =>
      items.forEach((it) => {
        it.geometry.dispose()
        it.pickGeometry?.dispose()
        it.edges?.dispose()
        it.route?.map?.dispose()
        it.material.dispose()
      }),
    [items],
  )

  // Tint hovered / selected items.
  useEffect(() => {
    for (const it of items) {
      const look = it.partId && selected === it.partId ? 'selected' : it.partId && hovered?.partId === it.partId ? 'hover' : 'base'
      for (const m of meshRefs.current.get(it.key) ?? []) m.material = lookFor(it.material, look)
      const lineColor = look === 'selected' ? '#ff9a1f' : look === 'hover' ? '#7db7ff' : it.color
      for (const l of lineRefs.current.get(it.key) ?? []) (l.material as THREE.LineBasicMaterial).color.set(lineColor)
    }
  }, [items, hovered, selected])

  // Flow: scroll the band texture along each pipe.
  useFrame((_, dt) => {
    if (!flow) return
    for (const it of items) {
      const map = it.material.map
      if (map && it.route?.flow) map.offset.x -= (dt * 1.2 * it.route.flow) / 0.9
    }
  })
  useEffect(() => {
    for (const it of items)
      if (it.route?.map) {
        it.material.map = flow ? it.route.map : null
        it.material.needsUpdate = true
      }
  }, [items, flow])

  const passive = authorMode === 'route' || authorMode === 'volumes'
  const handlers = (it: BuiltItem) =>
    passive
      ? {}
      : {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            const type = e.nativeEvent.pointerType
            if (type !== 'mouse' && type !== 'pen') return
            setHovered({ partId: it.partId, label: it.label })
          },
          onPointerOut: () => setHovered(null),
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            if (e.delta > 6 || !it.partId) return
            select(it.partId)
          },
        }

  const register =
    <T extends THREE.Object3D>(store: Map<string, T[]>, key: string) =>
    (o: T | null) => {
      if (!o) return
      const list = store.get(key) ?? []
      if (!list.includes(o)) list.push(o)
      store.set(key, list)
    }

  const renderItem = (it: BuiltItem, copy: 'a' | 'b') => {
    const separatePick = !!it.pickGeometry || it.volume
    return (
      <group key={`${it.key}-${copy}`} scale={copy === 'b' ? [1, 1, -1] : 1} {...handlers(it)}>
        <group position={it.position} rotation={it.rotation}>
          <mesh
            ref={register(meshRefs.current, it.key)}
            geometry={it.geometry}
            material={it.material}
            renderOrder={it.volume ? 4 : 0}
            {...(separatePick ? { raycast: noRaycast } : {})}
          />
          {it.edges && (
            <lineSegments ref={register(lineRefs.current, it.key)} geometry={it.edges} raycast={noRaycast}>
              <lineBasicMaterial color={it.color} toneMapped={false} />
            </lineSegments>
          )}
          {it.volume && <mesh geometry={it.geometry} material={volumePickMaterial} />}
        </group>
        {it.pickGeometry && <mesh geometry={it.pickGeometry} material={pickMaterial} />}
      </group>
    )
  }

  return (
    <group name={`system-${system.id}`}>
      {items.flatMap((it) => (it.mirror ? [renderItem(it, 'a'), renderItem(it, 'b')] : [renderItem(it, 'a')]))}
    </group>
  )
}
