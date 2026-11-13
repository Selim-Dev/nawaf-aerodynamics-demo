import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { drawnPartIds, type AircraftData } from '../data/aircraft'
import { useStore } from '../store'
import { anchorFor, sceneRegistry } from './registry'

/** DOM dot elements by part id, registered by ui/HotspotLayer. */
export const hotspotElements = new Map<string, HTMLElement>()

/** Which parts get a dot in the current view. */
export function useHotspotIds(data: AircraftData) {
  const level = useStore((s) => s.level)
  const activeSystem = useStore((s) => s.activeSystem)
  const version = useStore((s) => s.sceneVersion)
  return useMemo(() => {
    void version
    const system = activeSystem ? data.systemsById.get(activeSystem) : undefined
    const list =
      level === 'exterior'
        ? data.parts.filter((p) => p.kind === 'exterior').map((p) => p.id)
        : system
          ? drawnPartIds(system)
          : []
    return list.filter((id) => data.partsById.has(id) && !!anchorFor(id, level === 'systems'))
  }, [data, level, activeSystem, version])
}

/**
 * Inside the canvas: projects each anchor to screen space every frame and
 * moves the matching DOM dot. A few times a second it raycasts from the
 * camera to dim dots hidden behind the aircraft.
 */
export function HotspotProjector({ data }: { data: AircraftData }) {
  const forced = useStore((s) => s.level === 'systems' && !!data.systemsById.get(s.activeSystem ?? '')?.markers)
  const show = useStore((s) => s.showHotspots) || forced
  const level = useStore((s) => s.level)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const get = useThree((s) => s.get)
  useEffect(() => {
    // Dev only: lets a developer or a test script drive the scene from the browser console, e.g.
    //   __three().controls.setLookAt(camX, camY, camZ, targetX, targetY, targetZ, false)
    //   __store.getState().select('rudder')
    if (import.meta.env.DEV) Object.assign(window, { __three: get, __store: useStore })
  }, [get])
  const frame = useRef(0)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const raycaster = useMemo(() => {
    const r = new THREE.Raycaster()
    r.firstHitOnly = true
    return r
  }, [])

  useFrame(() => {
    if (!show) return
    const checkOcclusion = level === 'exterior' && ++frame.current % 10 === 0
    for (const [id, el] of hotspotElements) {
      const at = anchorFor(id, level === 'systems')
      if (!at) continue
      tmp.copy(at).project(camera)
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1
      el.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) continue
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      if (checkOcclusion) {
        dir.copy(at).sub(camera.position)
        const dist = dir.length()
        raycaster.set(camera.position, dir.normalize())
        raycaster.far = Math.max(0, dist - 0.35)
        el.dataset.hidden = String(raycaster.intersectObjects(sceneRegistry.skinMeshes, false).length > 0)
      } else if (level !== 'exterior') el.dataset.hidden = 'false'
    }
  })
  return null
}
