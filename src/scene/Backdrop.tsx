/**
 * The space around the aircraft: a sky dome, a studio floor with a pool of
 * light, a measuring grid and a turntable ring, the aircraft's name lettered
 * on the floor, and the lights.
 *
 * Everything here is generated (two small shaders, a few canvas textures and
 * three.js's built-in room for reflections), so nothing is downloaded and it
 * adds only a handful of draw calls. The look blends smoothly between moods
 * (see moods.ts) when the learner changes view or backdrop.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { AircraftData } from '../data/aircraft'
import { strings } from '../i18n/strings'
import { useStore } from '../store'
import { useUi } from '../ui/uiStore'
import { at, flatten, liveMood, MOODS, type ColorKey, type MoodName } from './moods'
import { sceneRegistry } from './registry'

const noRaycast = () => null

/** The horizon glow sits behind the aircraft as seen from the opening camera position (x, z). */
const GLOW_DIR = new THREE.Vector2(0.63, -0.78).normalize()

const HASH = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`

/** Colours are written as plain sRGB (no tone mapping), so the hex values in moods.ts are what appears on screen. */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uNadir: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Vector3() },
      uGlowK: { value: 0 },
      uGlowDir: { value: GLOW_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uNadir;
      uniform vec3 uGlow;
      uniform float uGlowK;
      uniform vec2 uGlowDir;
      varying vec3 vDir;
      ${HASH}
      void main() {
        vec3 d = normalize(vDir);
        float toward = max(dot(normalize(d.xz + vec2(1e-5)), uGlowDir), 0.0);
        vec3 glow = uGlow * uGlowK * (0.3 + 0.7 * toward * toward);
        // Brightest exactly at the horizon, fading upwards into the sky. Below the horizon (the thin
        // strip beyond the edge of the floor, and the view from under the aircraft) it starts from
        // the same colour, so no line shows where floor and sky meet.
        vec3 col = d.y >= 0.0
          ? mix(uHorizon, uZenith, pow(d.y, 0.8)) + glow * exp(-d.y * 4.5)
          : mix(uHorizon + glow, uNadir, smoothstep(0.0, 0.55, -d.y));
        // A little noise hides the banding that dark gradients show on 8-bit screens.
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  })
}

function floorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFloor: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uPool: { value: new THREE.Vector3() },
      uGrid: { value: new THREE.Vector3() },
      uPoolK: { value: 0 },
      uGridK: { value: 0 },
      uRingK: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uPoolSize: { value: new THREE.Vector2(24.5, 19.5) },
      uRing: { value: 23 },
      uGlow: { value: new THREE.Vector3() },
      uGlowK: { value: 0 },
      uGlowDir: { value: GLOW_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFloor;
      uniform vec3 uHorizon;
      uniform vec3 uPool;
      uniform vec3 uGrid;
      uniform float uPoolK;
      uniform float uGridK;
      uniform float uRingK;
      uniform vec2 uCenter;
      uniform vec2 uPoolSize;
      uniform float uRing;
      uniform vec3 uGlow;
      uniform float uGlowK;
      uniform vec2 uGlowDir;
      varying vec3 vWorld;
      ${HASH}

      // One-pixel lines every "cell" metres, fading out before they crowd together in the distance.
      float lines(vec2 p, float cell) {
        vec2 c = p / cell;
        vec2 w = max(fwidth(c), vec2(1e-6));
        vec2 d = abs(fract(c - 0.5) - 0.5) / w;
        return (1.0 - min(min(d.x, d.y), 1.0)) * (1.0 - smoothstep(0.12, 0.5, max(w.x, w.y)));
      }

      void main() {
        vec2 p = vWorld.xz - uCenter;
        float r = length(p);

        // Pool of light under the aircraft (longer along the fuselage), with a wide soft halo.
        vec2 q = p / uPoolSize;
        float pool = exp(-dot(q, q)) + 0.22 * exp(-r * r / 5200.0);
        vec3 col = mix(uFloor, uPool, clamp(pool * uPoolK, 0.0, 1.0));

        // Measuring grid: 2 m squares, heavier lines every 10 m.
        float grid = max(lines(p, 2.0) * 0.4, lines(p, 10.0)) * (1.0 - smoothstep(30.0, 150.0, r));

        // Turntable ring with a tick every 5 degrees and a longer one every 30.
        float fr = max(fwidth(r), 1e-6);
        float ring = 1.0 - smoothstep(0.0, 1.6, abs(r - uRing) / fr);
        ring = max(ring, 0.55 * (1.0 - smoothstep(0.0, 1.4, abs(r - uRing - 2.4) / fr)));
        float u = atan(p.y, p.x) / 6.2831853 * 72.0;
        float tick = 1.0 - min(abs(fract(u - 0.5) - 0.5) / max(fwidth(u), 1e-6), 1.0);
        float major = step(mod(floor(u + 0.5), 6.0), 0.5);
        tick *= step(uRing, r) * step(r, uRing + mix(0.7, 1.5, major));

        col = mix(col, uGrid, clamp(grid * uGridK + max(ring, tick) * uRingK, 0.0, 1.0));

        // Haze: far away, the floor takes exactly the colour the sky has at the horizon in that
        // direction (glow included), so floor and sky meet without an edge.
        float toward = max(dot(normalize(p + vec2(1e-5)), uGlowDir), 0.0);
        vec3 haze = uHorizon + uGlow * uGlowK * (0.3 + 0.7 * toward * toward);
        col = mix(col, haze, 1.0 - exp(-r / 260.0));
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
  })
}

const DISPLAY_FONT = '"Outfit Variable", "Noto Sans Arabic Variable", system-ui, "Segoe UI", sans-serif'

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const paint = () => {
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, width, height)
    g.fillStyle = '#fff'
    draw(g)
    texture.needsUpdate = true
  }
  paint()
  // The display font may still be loading on the first paint; draw again once it is in.
  void document.fonts?.load(`700 64px ${DISPLAY_FONT}`).then(paint, () => {})
  return texture
}

function spaced(g: CanvasRenderingContext2D, px: number) {
  // Not every browser has canvas letter-spacing; the lettering still reads without it.
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
}

/** The stand marking: maker above, type name large below, like lettering painted on an apron. */
function nameTexture(designation: string, maker: string) {
  return canvasTexture(1400, 600, (g) => {
    g.textBaseline = 'alphabetic'
    g.font = `500 74px ${DISPLAY_FONT}`
    spaced(g, 34)
    g.fillText(maker.toUpperCase(), 44, 110)
    g.fillRect(44, 146, 520, 5)
    g.font = `700 440px ${DISPLAY_FONT}`
    spaced(g, 6)
    g.fillText(designation, 28, 548, 1340)
  })
}

function labelTexture(text: string, rtl: boolean) {
  return canvasTexture(768, 128, (g) => {
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.direction = rtl ? 'rtl' : 'ltr'
    g.font = `600 ${rtl ? 70 : 64}px ${DISPLAY_FONT}`
    spaced(g, rtl ? 0 : 10)
    g.fillText(text, 384, 68, 740)
  })
}

const lettering = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 })
const disposeLettering = (m: THREE.MeshBasicMaterial) => {
  m.map?.dispose()
  m.dispose()
}

export function Backdrop({ data }: { data: AircraftData }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const level = useStore((s) => s.level)
  const lang = useStore((s) => s.lang)
  const version = useStore((s) => s.sceneVersion)
  const backdrop = useUi((s) => s.backdrop)
  const intro = useUi((s) => s.phase === 'intro')
  const mood: MoodName = level === 'systems' ? 'xray' : backdrop

  // Reflections and soft fill light from three.js's built-in room: no HDR file to download.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    room.dispose()
    pmrem.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])

  const sky = useMemo(skyMaterial, [])
  const floor = useMemo(floorMaterial, [])
  const dome = useMemo(() => new THREE.SphereGeometry(1, 48, 24), [])
  const disc = useMemo(() => new THREE.CircleGeometry(2200, 96).rotateX(-Math.PI / 2), [])
  const quad = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useEffect(() => () => [sky, floor, dome, disc, quad].forEach((x) => x.dispose()), [sky, floor, dome, disc, quad])

  // The floor markings are sized from the aircraft as loaded, so another aircraft type fits without edits.
  const layout = useMemo(() => {
    void version
    const box = new THREE.Box3()
    for (const id of sceneRegistry.skin.keys()) {
      const b = sceneRegistry.bounds.get(id)
      if (b) box.union(b)
    }
    // Until the model is in: a typical single-aisle airliner.
    if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, -17.1), new THREE.Vector3(37.6, 12, 17.1))
    const len = box.max.x - box.min.x
    const span = box.max.z - box.min.z
    return { cx: (box.min.x + box.max.x) / 2, nose: box.min.x, len, span, ring: Math.max(len, span) / 2 + 4.2 }
  }, [version])
  useEffect(() => {
    floor.uniforms.uCenter.value.set(layout.cx, 0)
    floor.uniforms.uPoolSize.value.set(layout.len * 0.65, layout.span * 0.57)
    floor.uniforms.uRing.value = layout.ring
  }, [floor, layout])

  const designation = data.aircraft.designation ?? data.aircraft.name.en
  const maker = data.aircraft.manufacturer?.en ?? ''
  const name = useMemo(() => lettering(nameTexture(designation, maker)), [designation, maker])
  const labels = useMemo(() => {
    const t = strings[lang]
    return [t.floorFwd, t.floorAft, t.floorLh, t.floorRh].map((text) => lettering(labelTexture(text, lang === 'ar')))
  }, [lang])
  useEffect(() => () => disposeLettering(name), [name])
  useEffect(() => () => labels.forEach(disposeLettering), [labels])

  const domeRef = useRef<THREE.Mesh>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)

  // Blend state: where the look is coming from, where it is going, and how far along it is.
  const blend = useRef({ from: flatten(MOODS[mood]), to: flatten(MOODS[mood]), now: flatten(MOODS[mood]), t: 1, dirty: true })
  useEffect(() => {
    const b = blend.current
    b.from = [...b.now]
    b.to = flatten(MOODS[mood])
    // The opening screen shows the name itself, so the floor stays clear until Start is pressed.
    if (intro) b.to[at('nameStrength')] = b.to[at('labelStrength')] = 0
    b.t = 0
  }, [mood, intro])
  // Freshly made lettering starts from the current look rather than from invisible.
  useEffect(() => {
    blend.current.dirty = true
  }, [name, labels])

  useFrame(({ camera }, dt) => {
    domeRef.current?.position.copy(camera.position)
    const b = blend.current
    if (b.t >= 1 && !b.dirty) return
    b.t = Math.min(1, b.t + dt / 0.9)
    b.dirty = false
    const e = b.t * b.t * (3 - 2 * b.t)
    for (let i = 0; i < b.now.length; i++) b.now[i] = b.from[i] + (b.to[i] - b.from[i]) * e
    const v = b.now
    const num = (k: Parameters<typeof at>[0]) => v[at(k)]
    const vec = (u: { value: THREE.Vector3 }, k: ColorKey) => u.value.fromArray(v, at(k))
    const rgb = (c: THREE.Color, k: ColorKey) => c.setRGB(v[at(k)], v[at(k) + 1], v[at(k) + 2], THREE.SRGBColorSpace)

    vec(sky.uniforms.uZenith, 'zenith')
    vec(sky.uniforms.uHorizon, 'horizon')
    vec(sky.uniforms.uNadir, 'nadir')
    vec(sky.uniforms.uGlow, 'glow')
    sky.uniforms.uGlowK.value = num('glowStrength')
    vec(floor.uniforms.uFloor, 'floor')
    vec(floor.uniforms.uHorizon, 'horizon')
    vec(floor.uniforms.uPool, 'pool')
    vec(floor.uniforms.uGrid, 'grid')
    vec(floor.uniforms.uGlow, 'glow')
    floor.uniforms.uGlowK.value = num('glowStrength')
    floor.uniforms.uPoolK.value = num('poolStrength')
    floor.uniforms.uGridK.value = num('gridStrength')
    floor.uniforms.uRingK.value = num('ringStrength')

    rgb(name.color, 'ink')
    name.opacity = num('nameStrength')
    for (const m of labels) {
      rgb(m.color, 'ink')
      m.opacity = num('labelStrength')
    }
    if (hemi.current) {
      rgb(hemi.current.color, 'hemiSky')
      rgb(hemi.current.groundColor, 'hemiGround')
      hemi.current.intensity = num('hemi')
    }
    if (key.current) {
      rgb(key.current.color, 'key')
      key.current.intensity = num('keyStrength')
    }
    if (rim.current) {
      rgb(rim.current.color, 'rim')
      rim.current.intensity = num('rimStrength')
    }
    scene.environmentIntensity = num('env')
    liveMood.shadow = num('shadow')
  })

  const { cx, nose, len, span, ring } = layout
  const k = len / 37.6
  const out = ring + 3.6
  // Each label reads the right way up for someone standing outside the ring, looking in.
  const marks: [number, number, number][] = [
    [cx - out, 0, -Math.PI / 2],
    [cx + out, 0, Math.PI / 2],
    [cx, out, 0],
    [cx, -out, Math.PI],
  ]

  return (
    <group name="backdrop">
      <hemisphereLight ref={hemi} />
      {/* Key light from above and ahead, so the fuselage shades from top to belly; a cool rim light from behind. */}
      <directionalLight ref={key} position={[-12, 40, 14]} />
      <directionalLight ref={rim} position={[34, 14, -26]} />

      <mesh ref={domeRef} geometry={dome} material={sky} scale={1800} renderOrder={-20} frustumCulled={false} raycast={noRaycast} />
      <mesh geometry={disc} material={floor} position={[cx, -0.004, 0]} renderOrder={-19} raycast={noRaycast} />

      {/* Stand marking on the port side, aft of the wing: reads left to right from the opening view. */}
      <mesh
        geometry={quad}
        material={name}
        position={[nose + len * 0.81, 0.008, span * 0.31]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[10.5 * k, 4.5 * k, 1]}
        renderOrder={1}
        raycast={noRaycast}
      />
      {marks.map(([x, z, turn], i) => (
        <mesh key={i} geometry={quad} material={labels[i]} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, turn]} scale={[8.4, 1.4, 1]} renderOrder={1} raycast={noRaycast} />
      ))}
    </group>
  )
}
