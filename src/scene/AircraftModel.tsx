import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'
import type { AircraftData } from '../data/aircraft'
import { useStore } from '../store'
import { buildPlaceholder } from './PlaceholderAircraft'
import { classifyParts, frameMatrix } from './classifyParts'
import { CUT_PLANES } from './cutaway'
import { createGhostMaterial, debugMaterial, isLoaderDefault, lookFor, unpaintedMaterial } from './materials'
import { sceneRegistry } from './registry'

const noRaycast = () => {}

export function AircraftModel({ data }: { data: AircraftData }) {
  return data.aircraft.model === 'placeholder' ? <PlaceholderSource data={data} /> : <GlbSource data={data} />
}

function PlaceholderSource({ data }: { data: AircraftData }) {
  const root = useMemo(() => buildPlaceholder(data.aircraft), [data])
  return <Classified root={root} data={data} />
}

function GlbSource({ data }: { data: AircraftData }) {
  // useDraco = false, useMeshopt = true: the meshopt decoder is bundled, so nothing loads from a CDN.
  const gltf = useGLTF(import.meta.env.BASE_URL + data.aircraft.model, false, true)
  const root = useMemo(() => {
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    g.matrix.copy(frameMatrix(data.aircraft.frame))
    const model = gltf.scene.clone(true)
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && !Array.isArray(mesh.material) && isLoaderDefault(mesh.material)) mesh.material = unpaintedMaterial
    })
    g.add(model)
    return g
  }, [gltf, data])
  return <Classified root={root} data={data} />
}

const ghost = createGhostMaterial()

function Classified({ root, data }: { root: THREE.Object3D; data: AircraftData }) {
  const mappingOverride = useStore((s) => s.mappingOverride)
  const mapping = mappingOverride ?? data.mapping
  const level = useStore((s) => s.level)
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const debug = useStore((s) => s.debugColors)
  const debugMeshes = useStore((s) => s.debugMeshes)
  const cutaway = useStore((s) => s.cutaway)
  const authorMode = useStore((s) => s.authorMode)
  const bumpScene = useStore((s) => s.bumpScene)

  const parts = useMemo(() => {
    root.updateMatrixWorld(true)
    const result = classifyParts(root, mapping)
    for (const part of result.values())
      for (const m of part.meshes) {
        // Each split mesh has its own index, so it gets its own BVH; the shared vertex data is untouched.
        m.geometry.boundsTree = new MeshBVH(m.geometry)
        m.raycast = acceleratedRaycast
      }
    return result
  }, [root, mapping])

  // Publish meshes, bounds and anchors for the camera, hotspots and authoring tools.
  useLayoutEffect(() => {
    const reg = sceneRegistry
    reg.skin.clear()
    reg.skinMeshes = []
    for (const [id, part] of parts) {
      reg.skin.set(id, part.meshes)
      reg.skinMeshes.push(...part.meshes)
      reg.bounds.set(id, part.box.clone())
    }
    for (const e of mapping.entries) {
      const box = reg.bounds.get(e.partId)
      if (e.anchor) reg.anchors.set(e.partId, new THREE.Vector3(...e.anchor))
      else if (box) reg.anchors.set(e.partId, box.getCenter(new THREE.Vector3()))
    }
    bumpScene()
  }, [parts, mapping, bumpScene])

  useEffect(() => () => {
    for (const part of parts.values()) for (const m of part.meshes) m.geometry.boundsTree = undefined
  }, [parts])

  // Materials and pickability follow the UI state.
  const xray = level === 'systems'
  useEffect(() => {
    ghost.clippingPlanes = xray ? CUT_PLANES[cutaway] : []
    ghost.needsUpdate = true
    for (const [id, part] of parts)
      for (const m of part.meshes) {
        const base = (m.userData.baseMaterial ??= m.material) as THREE.Material
        if (xray) m.material = ghost
        else if (debugMeshes) m.material = debugMaterial(m.userData.sourceName)
        else if (debug) m.material = debugMaterial(id)
        else m.material = lookFor(base, selected === id ? 'selected' : hovered?.partId === id ? 'hover' : 'base')
        // The skin is only pickable when solid, so system parts can be clicked through it.
        m.raycast = xray ? noRaycast : acceleratedRaycast
        m.renderOrder = xray ? 10 : 0
      }
  }, [parts, xray, debug, debugMeshes, hovered, selected, cutaway])

  const setHovered = useStore((s) => s.setHovered)
  const select = useStore((s) => s.select)
  const handlersOn = !xray && authorMode !== 'route' && authorMode !== 'volumes'

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const type = e.nativeEvent.pointerType
    if (type !== 'mouse' && type !== 'pen') return
    setHovered({ partId: e.object.userData.partId })
  }
  const out = () => setHovered(null)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return // the pointer moved: this was an orbit drag, not a click
    select(e.object.userData.partId)
  }

  return (
    <group
      name="aircraft"
      onPointerOver={handlersOn ? over : undefined}
      onPointerOut={handlersOn ? out : undefined}
      onClick={handlersOn ? click : undefined}
    >
      {[...parts.values()].flatMap((p) => p.meshes.map((m) => <primitive key={m.uuid} object={m} />))}
    </group>
  )
}
