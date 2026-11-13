import * as THREE from 'three'

export type PartLook = 'base' | 'hover' | 'selected'

const HOVER = new THREE.Color('#2f8cff')
const SELECTED = new THREE.Color('#ff9a1f')

const cache = new WeakMap<THREE.Material, Partial<Record<PartLook, THREE.Material>>>()

/** Returns the material to use for a part in a given state, cloning and tinting once per base material. */
export function lookFor(base: THREE.Material, look: PartLook): THREE.Material {
  if (look === 'base') return base
  let entry = cache.get(base)
  if (!entry) cache.set(base, (entry = {}))
  const hit = entry[look]
  if (hit) return hit

  const m = base.clone()
  const tint = look === 'hover' ? HOVER : SELECTED
  const std = m as THREE.MeshStandardMaterial
  // Shift the surface colour towards the tint and add a little glow. Glow alone
  // is invisible on white paint, which is already as bright as the screen gets.
  if ('color' in std && std.color) std.color = std.color.clone().lerp(tint, look === 'hover' ? 0.6 : 0.85)
  if ('emissive' in std && std.emissive) {
    std.emissive = tint.clone()
    std.emissiveIntensity = look === 'hover' ? 0.16 : 0.24
  }
  entry[look] = m
  return m
}

/**
 * X-ray skin. Unlit, rim-weighted alpha with ADDITIVE blending: additive
 * blending is order-independent, so a merged, concave mesh cannot produce
 * sorting flicker. Depth writing is off so the systems inside stay visible.
 */
export function createGhostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#7fb4ff') },
      uBase: { value: 0.035 },
      uRim: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      uniform float uBase;
      uniform float uRim;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = uBase + uRim * pow(f, 2.2);
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    clipping: true,
  })
}

/**
 * Stands in for objects the model file gives no material. three.js would
 * otherwise draw them one-sided and fully metallic, which looks see-through
 * and near black; modelling tools show them as plain, two-sided light grey.
 */
export const unpaintedMaterial = new THREE.MeshStandardMaterial({ name: 'unpainted', color: '#e4e7ec', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide })

/** True for the material three.js's glTF loader gives a mesh that has none. */
export function isLoaderDefault(m: THREE.Material) {
  const s = m as THREE.MeshStandardMaterial
  return !m.name && s.isMeshStandardMaterial && s.metalness === 1 && s.roughness === 1 && !s.map
}

const debugCache = new Map<string, THREE.Material>()
/** Flat colour per part id, for checking how a model was split (?debug=parts). */
export function debugMaterial(partId: string) {
  let m = debugCache.get(partId)
  if (!m) {
    let h = 0
    for (const ch of partId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const color = new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55)
    debugCache.set(partId, (m = new THREE.MeshLambertMaterial({ color })))
  }
  return m
}
