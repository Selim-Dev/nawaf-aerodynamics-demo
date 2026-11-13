import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { AircraftData } from '../data/aircraft'
import { useStore } from '../store'
import { FUSELAGE, fuselagePoint, fuselageRadius } from './PlaceholderAircraft'
import { CUT_PLANES } from './cutaway'

/**
 * Faint fuselage frames and stringers in the Systems view. They are context
 * only (not clickable): they show where the skin is, so components read as
 * being inside the aircraft. Frames are spaced like the real ones, every
 * 0.533 m (21 in); every second one is drawn.
 *
 * For the built-in placeholder they follow its exact shape, nose to tail. For
 * a downloaded model they cover the constant section described by `fuselage`
 * in aircraft.json; without that block nothing is drawn.
 */
export function StructureContext({ data }: { data: AircraftData }) {
  const level = useStore((s) => s.level)
  const show = useStore((s) => s.showStructure)
  const cutaway = useStore((s) => s.cutaway)
  const placeholder = data.aircraft.model === 'placeholder'
  const section = data.aircraft.fuselage

  const geometry = useMemo(() => {
    if (!placeholder && !section) return null
    const inset = -0.03
    const point = placeholder
      ? (x: number, th: number) => fuselagePoint(x, th, inset)
      : (x: number, th: number) => new THREE.Vector3(x, section!.yc + (section!.r + inset) * section!.ky * Math.cos(th), (section!.r + inset) * Math.sin(th))
    const radius = placeholder ? fuselageRadius : () => section!.r
    const from = placeholder ? 1.6 : section!.from
    const to = placeholder ? FUSELAGE.len - 0.6 : section!.to
    const floor = (placeholder ? FUSELAGE.floor : section!.floor) - 0.12
    const yc = placeholder ? FUSELAGE.yc : section!.yc
    const ky = placeholder ? FUSELAGE.ky : section!.ky

    const pts: number[] = []
    const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const SEG = 40
    // Frames
    for (let x = from; x <= to; x += 0.533 * 2) {
      if (radius(x) < 0.5) continue
      for (let j = 0; j < SEG; j++) push(point(x, (j / SEG) * Math.PI * 2), point(x, ((j + 1) / SEG) * Math.PI * 2))
    }
    // Stringers
    const N = 16
    for (let k = 0; k < N; k++) {
      const th = ((k + 0.5) / N) * Math.PI * 2
      for (let x = from; x < to - 0.3; x += 0.533) push(point(x, th), point(Math.min(to, x + 0.533), th))
    }
    // Floor beams, to mark the cabin floor level
    for (let x = Math.max(from, 4.2); x < Math.min(to, 31.2); x += 0.533 * 2) {
      const r = radius(x)
      const half = Math.sqrt(Math.max(0, 1 - ((floor - yc) / (r * ky)) ** 2)) * r
      if (half > 0.3) push(new THREE.Vector3(x, floor, -half), new THREE.Vector3(x, floor, half))
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [placeholder, section])

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#7fb4ff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  )
  useEffect(() => {
    material.clippingPlanes = CUT_PLANES[cutaway]
    material.needsUpdate = true
  }, [material, cutaway])
  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  if (level !== 'systems' || !show || !geometry) return null
  return <lineSegments geometry={geometry} material={material} raycast={() => null} renderOrder={9} />
}
