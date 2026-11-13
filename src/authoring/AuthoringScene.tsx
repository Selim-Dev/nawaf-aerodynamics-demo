/**
 * Dev-only authoring tools inside the 3D scene (open the app with ?author=1).
 *  - Inspect: click the model to read the part, source mesh name and frame coordinates.
 *  - Volumes: wireframes of mapping.json volumes; drag the selected one with a gizmo
 *    and the model is re-split live.
 *  - Route: click to drop pipe waypoints. A click lands midway between where the
 *    ray enters and leaves the skin (inside the aircraft); hold Shift for the surface.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import type CameraControlsImpl from 'camera-controls'
import { acceleratedRaycast } from 'three-mesh-bvh'
import type { AircraftData } from '../data/aircraft'
import type { Mapping, V3 } from '../data/schema'
import { useStore } from '../store'
import { volumeMatrix } from '../scene/classifyParts'
import { sceneRegistry } from '../scene/registry'
import { filletedPath, tubeFor } from '../scene/routeCurve'
import { roundV, useAuthoring } from './authoringStore'

const DEG = 180 / Math.PI

function skinHits(raycaster: THREE.Raycaster) {
  const hits: THREE.Intersection[] = []
  for (const m of sceneRegistry.skinMeshes) acceleratedRaycast.call(m, raycaster, hits)
  return hits.sort((a, b) => a.distance - b.distance)
}

export default function AuthoringScene({ data }: { data: AircraftData }) {
  const mode = useStore((s) => s.authorMode)
  const { gl, camera, controls } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // Click handling straight on the canvas, so it works whatever is pickable.
  useEffect(() => {
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return
      const mode = useStore.getState().authorMode
      if (mode !== 'inspect' && mode !== 'route') return
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = skinHits(raycaster)
      if (!hits.length) return
      const a = useAuthoring.getState()
      if (mode === 'inspect') {
        const h = hits[0]
        a.setPick({ point: roundV(h.point), partId: h.object.userData.partId, sourceName: h.object.userData.sourceName })
      } else {
        const surface = e.shiftKey || a.surfaceMode
        const p = surface || hits.length < 2 ? hits[0].point : hits[0].point.clone().add(hits[1].point).multiplyScalar(0.5)
        a.addPoint(roundV(p))
      }
    }
    gl.domElement.addEventListener('pointerdown', onDown)
    gl.domElement.addEventListener('pointerup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointerdown', onDown)
      gl.domElement.removeEventListener('pointerup', onUp)
    }
  }, [gl, camera, raycaster])

  // Orthogonal-ish views for placing waypoints.
  const viewRequest = useAuthoring((s) => s.viewRequest)
  useEffect(() => {
    const c = controls as unknown as CameraControlsImpl | null
    if (!viewRequest || !c) return
    const t = new THREE.Vector3()
    c.getTarget(t)
    const d = 30
    const pos = {
      top: [t.x, t.y + d, t.z + 0.01],
      side: [t.x, t.y, t.z + d],
      front: [t.x - d, t.y, t.z],
      rear: [t.x + d, t.y, t.z],
    }[viewRequest.view] as V3
    c.setLookAt(...pos, t.x, t.y, t.z, true)
  }, [viewRequest, controls])

  return (
    <>
      {mode === 'inspect' && <PickMarker />}
      {mode === 'route' && <RoutePreview />}
      {mode === 'volumes' && <VolumeEditor data={data} />}
    </>
  )
}

function PickMarker() {
  const pick = useAuthoring((s) => s.pick)
  if (!pick) return null
  return (
    <mesh position={pick.point} renderOrder={20}>
      <sphereGeometry args={[0.12, 16, 12]} />
      <meshBasicMaterial color="#ff2bd6" depthTest={false} />
    </mesh>
  )
}

function RoutePreview() {
  const points = useAuthoring((s) => s.routePoints)
  const tube = useMemo(() => {
    if (points.length < 2) return null
    return tubeFor(filletedPath(points.map((p) => new THREE.Vector3(...p))), 0.06)
  }, [points])
  useEffect(() => () => tube?.dispose(), [tube])
  return (
    <group>
      {tube && (
        <mesh geometry={tube} renderOrder={20}>
          <meshBasicMaterial color="#ff2bd6" depthTest={false} transparent opacity={0.9} />
        </mesh>
      )}
      {points.map((p, i) => (
        <mesh key={i} position={p} renderOrder={21}>
          <sphereGeometry args={[i === points.length - 1 ? 0.13 : 0.09, 14, 10]} />
          <meshBasicMaterial color={i === 0 ? '#22ff88' : '#ffffff'} depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}

function VolumeEditor({ data }: { data: AircraftData }) {
  const override = useStore((s) => s.mappingOverride)
  const setOverride = useStore((s) => s.setMappingOverride)
  const mapping = override ?? data.mapping
  const selected = useAuthoring((s) => s.selectedVolume)
  const gizmo = useAuthoring((s) => s.gizmo)
  const target = useRef<THREE.Mesh>(null)

  const volumes = mapping.entries.flatMap((e, ei) =>
    (e.volumes ?? []).map((v, vi) => ({ ei, vi, partId: e.partId, v, m: volumeMatrix(v) })),
  )
  const sel = volumes.find((x) => x.ei === selected?.entry && x.vi === selected?.volume)

  useEffect(() => {
    const t = target.current
    if (!t || !sel) return
    sel.m.decompose(t.position, t.quaternion, t.scale)
  }, [sel])

  const commit = () => {
    const t = target.current
    if (!t || !selected) return
    const e = new THREE.Euler().setFromQuaternion(t.quaternion)
    const next: Mapping = structuredClone(mapping)
    const vol = next.entries[selected.entry].volumes![selected.volume]
    vol.center = roundV(t.position)
    vol.size = roundV(t.scale).map((n) => Math.max(0.05, Math.abs(n))) as V3
    const rot = roundV({ x: e.x * DEG, y: e.y * DEG, z: e.z * DEG })
    vol.rotation = rot.every((n) => n === 0) ? undefined : rot
    if (!vol.rotation) delete vol.rotation
    setOverride(next)
  }

  // Keep the gizmo target in sync if the mapping changes under it.
  useFrame(() => {
    if (target.current && !sel) target.current.visible = false
  })

  return (
    <group>
      {volumes.map(({ ei, vi, v, m }) => {
        const isSel = ei === selected?.entry && vi === selected?.volume
        const geo = v.shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[0.5, 18, 12]} />
        const mats = [m, ...(v.mirror ? [new THREE.Matrix4().makeScale(1, 1, -1).multiply(m)] : [])]
        return mats.map((mm, k) => (
          <mesh
            key={`${ei}-${vi}-${k}`}
            matrixAutoUpdate={false}
            matrix={mm}
            raycast={() => null}
            renderOrder={20}
            visible={!(isSel && k === 0)}
          >
            {geo}
            <meshBasicMaterial color={isSel ? '#ff2bd6' : '#00e5ff'} wireframe depthTest={false} transparent opacity={0.7} />
          </mesh>
        ))
      })}
      {sel && (
        <>
          <mesh ref={target} renderOrder={22}>
            {sel.v.shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[0.5, 18, 12]} />}
            <meshBasicMaterial color="#ff2bd6" wireframe depthTest={false} />
          </mesh>
          <TransformControls object={target as React.RefObject<THREE.Object3D>} mode={gizmo} onMouseUp={commit} />
        </>
      )}
    </group>
  )
}
