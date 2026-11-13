/**
 * A procedural narrow-body airliner built from code, in the aircraft frame
 * (metres, +X aft, +Y up, +Z port).
 *
 * Its dimensions and door, gear and engine positions follow the public Airbus
 * document "A320 Aircraft Characteristics - Airport and Maintenance Planning":
 * length 37.57 m, fuselage 3.95 m wide and 4.14 m tall, belly 1.76 m and crown
 * 5.90 m above the ground, engines 5.75 m from the centreline, nose gear 5.07 m
 * aft of the nose, wheelbase 12.64 m, track 7.59 m, doors at 5.04 / 29.53 m,
 * overwing exits at 14.43 / 15.28 m, cargo doors at 8.16 / 22.69 / 26.29 m.
 * The shapes between those points are simplified.
 *
 * It exists so the app works before a real model is chosen, and as a fallback
 * if no free model is good enough. On purpose, the fuselage is ONE mesh that
 * also contains the radome, cockpit shell and tail cone: those parts are
 * separated at load time by the volumes in mapping.json, which is exactly
 * what has to happen with a downloaded model whose parts are merged.
 */
import * as THREE from 'three'
import type { Aircraft, Surface } from '../data/schema'
import { gridSurface, liftingPanel, mergeSimple, range, revolve } from './geometry'

export const FUSELAGE = {
  yc: 3.83, // centreline height: belly 1.76 m, crown 5.90 m
  r: 1.975, // half width (3.95 m wide)
  ky: 1.048, // vertical stretch (4.14 m tall)
  nose: 5.6, // end of the nose section
  tail0: 26.5, // start of the tail taper
  len: 37.57,
  floor: 3.4, // cabin floor: door 1 sill is 3.4 m above the ground
}
const { yc: YC, r: R, ky: KY, nose: NOSE, tail0: TAIL0, len: LEN } = FUSELAGE

export function fuselageRadius(x: number) {
  if (x <= 0) return 0
  if (x < NOSE) return R * Math.sqrt(1 - ((NOSE - x) / NOSE) ** 2)
  if (x <= TAIL0) return R
  if (x <= LEN) return R * (1 - 0.82 * ((x - TAIL0) / (LEN - TAIL0)) ** 1.6)
  const end = R * (1 - 0.82)
  const t = Math.min(1, (x - LEN) / 0.3)
  return end * Math.sqrt(Math.max(0, 1 - t * t))
}

export function fuselageYOffset(x: number) {
  if (x < NOSE) return -0.5 * (1 - x / NOSE) ** 2 // slight nose droop
  if (x <= TAIL0) return 0
  return 0.95 * Math.min(1, (x - TAIL0) / (LEN - TAIL0)) ** 1.5 // tail upsweep (APU exhaust ~4.75 m high)
}

/** Point on the fuselage skin. theta: 0 = top, +PI/2 = port side, -PI/2 = starboard. */
export function fuselagePoint(x: number, theta: number, offset = 0) {
  const r = fuselageRadius(x) + offset
  return new THREE.Vector3(x, YC + fuselageYOffset(x) + r * KY * Math.cos(theta), r * Math.sin(theta))
}

/** Angle on the fuselage section at station x that is `y` metres above the ground. */
function thetaAt(x: number, y: number) {
  const c = (y - YC - fuselageYOffset(x)) / (fuselageRadius(x) * KY)
  return Math.acos(THREE.MathUtils.clamp(c, -1, 1))
}

/** A patch proud of the skin between two stations and two heights; side +1 port, -1 starboard. */
function skinPatch(x0: number, x1: number, yLow: number, yHigh: number, side: 1 | -1, offset = 0.02, steps = 3) {
  return gridSurface(
    steps + 1,
    steps + 1,
    (i, j) => {
      const x = x0 + ((x1 - x0) * i) / steps
      const y = yLow + ((yHigh - yLow) * j) / steps
      return fuselagePoint(x, side * thetaAt(x, y), offset)
    },
    (p) => new THREE.Vector3(0, p.y - (YC + fuselageYOffset(p.x)), p.z),
  )
}
const bothSides = (x0: number, x1: number, y0: number, y1: number, offset = 0.02, steps = 3) => [
  skinPatch(x0, x1, y0, y1, 1, offset, steps),
  skinPatch(x0, x1, y0, y1, -1, offset, steps),
]

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, seg = 12) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(radius, radius, len, seg)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  g.applyQuaternion(q)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  g.translate(mid.x, mid.y, mid.z)
  return g
}

function wheelPair(x: number, y: number, z: number, radius: number, width: number, gap: number) {
  const make = (zz: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, width, 24)
    g.rotateX(Math.PI / 2)
    g.translate(x, y, zz)
    return g
  }
  return mergeSimple([make(z - gap), make(z + gap)])
}

const mat = (color: string, roughness: number, metalness: number) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

export function buildPlaceholder(aircraft: Aircraft): THREE.Group {
  const { wing, hstab, fin } = aircraft.surfaces
  const M = {
    skin: mat('#eef1f5', 0.5, 0.15),
    panel: mat('#d6dce4', 0.55, 0.15),
    paint: mat('#1d3c66', 0.45, 0.2),
    nacelle: mat('#c9d0d8', 0.35, 0.45),
    fan: mat('#30353c', 0.4, 0.6),
    glass: mat('#16202b', 0.15, 0.3),
    tyre: mat('#1c1c1e', 0.9, 0),
    strut: mat('#a9b1bb', 0.3, 0.75),
    door: mat('#cfd6df', 0.5, 0.15),
    exhaust: mat('#4a4f57', 0.5, 0.6),
  }
  const group = new THREE.Group()
  group.name = 'PlaceholderAircraft'
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const m = new THREE.Mesh(geometry, material)
    m.name = name
    group.add(m)
    return m
  }

  // ---- Fuselage (one mesh: radome + cockpit shell + cabin + tail cone) ----
  const xs = [
    ...range(0, 1.5, 0.1),
    ...range(1.5, NOSE, 0.25).slice(1),
    ...range(NOSE, TAIL0, 0.6).slice(1),
    ...range(TAIL0, LEN, 0.35).slice(1),
    ...range(LEN, LEN + 0.3, 0.06).slice(1),
  ]
  add('Fuselage', revolve(xs, fuselageRadius, YC, 0, 56, fuselageYOffset, KY), M.skin)

  // Belly fairing: the bulge under the wing that houses the packs and the main gear bay (1.62 m clearance).
  const belly = new THREE.SphereGeometry(1, 28, 14)
  belly.scale(5.4, 0.62, 1.9)
  belly.translate(16.2, 2.2, 0)
  add('BellyFairing', belly, M.skin)

  // ---- Windows ----
  const cockpit: [number, number, number, number][] = [
    [2.35, 3.1, 4.45, 5.05],
    [3.17, 3.85, 4.3, 4.95],
    [3.92, 4.4, 4.3, 4.9],
  ]
  add('Cockpit_Windows', mergeSimple(cockpit.flatMap(([x0, x1, y0, y1]) => bothSides(x0, x1, y0, y1, 0.015))), M.glass)

  const cabin: THREE.BufferGeometry[] = []
  for (let x = 6.1; x < 28.9; x += 0.533) {
    if (Math.abs(x + 0.115 - 14.43) < 0.5 || Math.abs(x + 0.115 - 15.28) < 0.5) continue // overwing exits
    cabin.push(...bothSides(x, x + 0.23, 4.3, 4.63, 0.012, 1))
  }
  add('Cabin_Windows', mergeSimple(cabin), M.glass)

  // ---- Doors and exits, at the stations and sill heights Airbus publishes ----
  add('Door_1L', skinPatch(4.63, 5.45, 3.4, 5.25, 1), M.door)
  add('Door_1R', skinPatch(4.63, 5.45, 3.4, 5.25, -1), M.door)
  add('Door_4L', skinPatch(29.12, 29.94, 3.55, 5.4, 1), M.door)
  add('Door_4R', skinPatch(29.12, 29.94, 3.55, 5.4, -1), M.door)
  add('Exit_L', mergeSimple([skinPatch(14.18, 14.68, 3.87, 4.9, 1), skinPatch(15.03, 15.53, 3.87, 4.9, 1)]), M.door)
  add('Exit_R', mergeSimple([skinPatch(14.18, 14.68, 3.87, 4.9, -1), skinPatch(15.03, 15.53, 3.87, 4.9, -1)]), M.door)
  // Cargo doors are on the right-hand side: 1.81 m wide, sills about 1.85 m above the ground.
  add('CargoDoor_Fwd', skinPatch(7.25, 9.06, 1.86, 3.08, -1), M.door)
  add('CargoDoor_Aft', skinPatch(21.78, 23.6, 1.92, 3.12, -1), M.door)
  add('CargoDoor_Bulk', skinPatch(25.82, 26.76, 2.2, 3.0, -1), M.door)

  // ---- Wings ----
  for (const [side, mirror] of [['L', false], ['R', true]] as const) {
    const o = { mirror }
    add(`Wing_${side}`, mergeSimple([
      liftingPanel(wing, [0, 1], [0.13, 0.7], o),
      liftingPanel(wing, [0, 0.2], [0, 0.13], o),
      liftingPanel(wing, [0.97, 1], [0, 0.13], o),
      liftingPanel(wing, [0, 0.05], [0.7, 1], o),
      liftingPanel(wing, [0.68, 0.7], [0.7, 1], o),
      liftingPanel(wing, [0.94, 1], [0.7, 1], o),
    ]), M.skin)
    add(`Slats_${side}`, liftingPanel(wing, [0.2, 0.97], [0, 0.13], o), M.panel)
    add(`Flaps_${side}`, liftingPanel(wing, [0.05, 0.68], [0.7, 1], o), M.panel)
    add(`Aileron_${side}`, liftingPanel(wing, [0.7, 0.94], [0.7, 1], o), M.panel)

    // Sharklet: 2.43 m tall, taking the span from 34.10 m to 35.80 m.
    const tip: Surface = {
      rootLE: [wing.tipLE[0] - 0.05, wing.tipLE[1] - 0.05, wing.tipLE[2] - 0.02],
      rootChord: wing.tipChord * 0.95,
      tipLE: [wing.tipLE[0] + 1.75, wing.tipLE[1] + 2.38, 17.9],
      tipChord: 0.55,
      thickness: [0.1, 0.08],
      normal: [0, 0, 1],
    }
    add(`Sharklet_${side}`, liftingPanel(tip, [0, 1], [0, 1], { mirror, spanSteps: 4 }), M.paint)

    add(`HStab_${side}`, mergeSimple([
      liftingPanel(hstab, [0, 1], [0, 0.68], o),
      liftingPanel(hstab, [0, 0.08], [0.68, 1], o),
      liftingPanel(hstab, [0.98, 1], [0.68, 1], o),
    ]), M.skin)
    add(`Elevator_${side}`, liftingPanel(hstab, [0.08, 0.98], [0.68, 1], o), M.panel)
  }

  // ---- Fin and rudder ----
  add('Fin', mergeSimple([
    liftingPanel(fin, [0, 1], [0, 0.66]),
    liftingPanel(fin, [0, 0.03], [0.66, 1]),
    liftingPanel(fin, [0.97, 1], [0.66, 1]),
  ]), M.paint)
  add('Rudder', liftingPanel(fin, [0.03, 0.97], [0.66, 1]), M.paint)

  // ---- Engines (1 = port/left, 2 = starboard/right), 5.75 m from the centreline ----
  const nacelleProfile: [number, number][] = [
    [0, 0.98], [0.12, 1.06], [0.3, 1.1], [0.8, 1.12], [2.6, 1.08], [3.6, 0.92], [4.2, 0.78],
  ]
  const nacelleR = (u: number) => {
    for (let k = 1; k < nacelleProfile.length; k++) {
      const [u1, r1] = nacelleProfile[k]
      const [u0, r0] = nacelleProfile[k - 1]
      if (u <= u1) return r0 + ((r1 - r0) * (u - u0)) / (u1 - u0)
    }
    return nacelleProfile[nacelleProfile.length - 1][1]
  }
  for (const [n, z] of [[1, 5.75], [2, -5.75]] as const) {
    const x0 = 11.2
    const y = 1.7 // nacelle low point 0.58 m above the ground
    add(`Engine${n}_Nacelle`, revolve(range(x0, x0 + 4.2, 0.15), (x) => nacelleR(x - x0), y, z, 40), M.nacelle)
    const fanDisc = new THREE.CircleGeometry(0.95, 40)
    fanDisc.rotateY(-Math.PI / 2)
    fanDisc.translate(x0 + 0.55, y, z)
    const spinner = new THREE.ConeGeometry(0.3, 0.55, 24)
    spinner.rotateZ(Math.PI / 2)
    spinner.translate(x0 + 0.3, y, z)
    add(`Engine${n}_Fan`, mergeSimple([fanDisc, spinner]), M.fan)
    const cone = new THREE.ConeGeometry(0.5, 0.95, 24)
    cone.rotateZ(-Math.PI / 2)
    cone.translate(x0 + 4.2 + 0.45, y, z)
    add(`Engine${n}_Exhaust`, cone, M.exhaust)
    const pylon = new THREE.BoxGeometry(3.6, 0.5, 0.32)
    pylon.translate(x0 + 2.5, y + 1.15, z)
    add(`Engine${n}_Pylon`, pylon, M.nacelle)
  }

  // ---- Landing gear: nose gear 5.07 m aft of the nose, wheelbase 12.64 m, track 7.59 m ----
  add('NoseGear_Strut', cylinderBetween(new THREE.Vector3(5.07, 2.05, 0), new THREE.Vector3(5.07, 0.38, 0), 0.08), M.strut)
  add('NoseGear_Wheels', wheelPair(5.07, 0.38, 0, 0.38, 0.2, 0.2), M.tyre)
  for (const [side, z] of [['L', 3.795], ['R', -3.795]] as const) {
    add(`MainGear_${side}_Strut`, mergeSimple([
      cylinderBetween(new THREE.Vector3(17.71, 2.8, z), new THREE.Vector3(17.71, 0.57, z), 0.12),
      cylinderBetween(new THREE.Vector3(17.71, 1.3, z), new THREE.Vector3(17.71, 2.5, z * 0.55), 0.06),
    ]), M.strut)
    add(`MainGear_${side}_Wheels`, wheelPair(17.71, 0.57, z, 0.57, 0.35, 0.42), M.tyre)
  }

  // ---- APU exhaust at the tail tip ----
  const apu = new THREE.CylinderGeometry(0.16, 0.16, 0.35, 16)
  apu.rotateZ(Math.PI / 2)
  apu.translate(LEN + 0.3, YC + fuselageYOffset(LEN), 0)
  add('APU_Exhaust', apu, M.exhaust)

  return group
}
