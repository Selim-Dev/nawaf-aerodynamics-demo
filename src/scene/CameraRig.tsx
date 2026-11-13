import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { Aircraft } from '../data/schema'
import { useStore } from '../store'
import { useUi } from '../ui/uiStore'
import { boundsFor, sceneRegistry } from './registry'

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Orbit / zoom / pan, plus "fly to part" and "reset view" driven by the store.
 * The default view keeps the direction from aircraft.json but sets the
 * distance so the whole aircraft fits the canvas, whatever its shape.
 *
 * On the opening screen the camera sits lower and closer and sways slowly from
 * side to side; pressing Start glides it out to the default view.
 */
export function CameraRig({ aircraft }: { aircraft: Aircraft }) {
  const ref = useRef<CameraControls>(null)
  const focus = useStore((s) => s.focus)
  const version = useStore((s) => s.sceneVersion)
  const phase = useUi((s) => s.phase)
  const rtl = useStore((s) => s.lang === 'ar')
  const size = useThree((s) => s.size)
  const fitted = useRef(false)
  /** True while the camera is where "Reset view" would put it, so a resize can re-fit without fighting the learner. */
  const atHome = useRef(false)
  const intro = useRef({ time: 0, azimuth: 0, polar: 0 })
  const settle = useRef(0)

  const homeView = useCallback(() => {
    const cam = ref.current?.camera as THREE.PerspectiveCamera | undefined
    const box = new THREE.Box3()
    for (const meshes of sceneRegistry.skin.values()) for (const m of meshes) {
      const b = sceneRegistry.bounds.get(m.userData.partId)
      if (b) box.union(b)
    }
    const { position, target } = aircraft.camera
    if (!cam || box.isEmpty()) return { pos: new THREE.Vector3(...position), target: new THREE.Vector3(...target) }
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const dir = new THREE.Vector3(...position).sub(new THREE.Vector3(...target)).normalize()
    const vFov = THREE.MathUtils.degToRad(cam.fov) / 2
    const hFov = Math.atan(Math.tan(vFov) * cam.aspect)
    // The bounding sphere is generous for a long, flat shape like an airliner, so fit to ~70% of it.
    const dist = (sphere.radius * 0.7) / Math.sin(Math.min(vFov, hFov))
    return { pos: sphere.center.clone().addScaledVector(dir, dist), target: sphere.center.clone() }
  }, [aircraft])

  /**
   * Opening view: near floor level, with the aircraft moved out of the way of the title.
   * Wide screens put the text on the reading side and the aircraft beside it; tall
   * screens put the aircraft above the text. "shift" slides the picture sideways.
   */
  const introView = useCallback(() => {
    const home = homeView()
    const cam = ref.current?.camera as THREE.PerspectiveCamera | undefined
    const s = new THREE.Spherical().setFromVector3(home.pos.clone().sub(home.target))
    s.phi = THREE.MathUtils.degToRad(81)
    const target = home.target.clone()
    let shift = 0
    if (size.width > 860 && size.width / size.height >= 1.25 && cam) {
      // The nose points to the left of the picture, so the aircraft needs a little more room on that side.
      s.radius *= rtl ? 1.12 : 1.04
      target.y -= s.radius * 0.03
      const frameWidth = 2 * s.radius * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect
      shift = frameWidth * (rtl ? 0.17 : -0.2)
    } else {
      // Portrait phones are fitted by width already; squarer windows have room to come closer.
      const portrait = size.width / size.height < 0.9
      s.radius *= portrait ? 1 : 0.85
      target.y -= s.radius * (portrait ? 0.09 : 0.19)
    }
    return { pos: target.clone().add(new THREE.Vector3().setFromSpherical(s)), target, shift }
  }, [homeView, size, rtl])

  const goHome = useCallback(
    (animate: boolean) => {
      const c = ref.current
      if (!c) return
      const { pos, target } = homeView()
      void c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate)
      void c.setFocalOffset(0, 0, 0, animate)
      atHome.current = true
    },
    [homeView],
  )

  // First fit once the model is in the registry, and again whenever the canvas changes shape
  // while the learner has not moved the camera (window resize, folding a side column).
  useEffect(() => {
    const c = ref.current
    if (!c || version === 0) return
    if (useUi.getState().phase === 'intro') {
      const { pos, target, shift } = introView()
      void c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false)
      void c.setFocalOffset(shift, 0, 0, false)
      intro.current.azimuth = c.azimuthAngle
      intro.current.polar = c.polarAngle
      fitted.current = true
      return
    }
    if (!fitted.current) {
      goHome(false)
      fitted.current = true
    } else if (atHome.current) goHome(true)
  }, [version, introView, goHome, size])

  // Start pressed: glide out from the opening view to the default one.
  useEffect(() => {
    const c = ref.current
    if (!c || phase !== 'explore' || !fitted.current || atHome.current) return
    c.smoothTime = reducedMotion ? 0.35 : 1.15
    goHome(true)
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      if (ref.current) ref.current.smoothTime = 0.35
    }, 2600)
    return () => window.clearTimeout(settle.current)
  }, [phase, goHome])

  useEffect(() => {
    const c = ref.current
    if (!c || focus.nonce === 0) return
    if (!focus.partId) {
      goHome(true)
      return
    }
    const box = boundsFor(focus.partId, useStore.getState().level === 'systems')
    if (!box || box.isEmpty()) return
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    sphere.radius = Math.max(sphere.radius * 1.7, 3.6)
    atHome.current = false
    void c.fitToSphere(sphere, true)
  }, [focus, goHome])

  // The slow sway on the opening screen.
  useFrame((_, dt) => {
    const c = ref.current
    if (!c || !fitted.current || reducedMotion || useUi.getState().phase !== 'intro') return
    const s = intro.current
    s.time += Math.min(dt, 0.1)
    void c.rotateTo(s.azimuth + 0.3 * Math.sin(s.time * 0.17), s.polar, false)
  })

  const moved = () => {
    atHome.current = false
  }

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2.5}
      maxDistance={110}
      maxPolarAngle={Math.PI * 0.54}
      smoothTime={0.35}
      dollyToCursor
      onControlStart={moved}
      onControl={moved}
    />
  )
}
