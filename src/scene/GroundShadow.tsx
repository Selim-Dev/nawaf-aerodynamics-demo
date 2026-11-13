import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { liveMood } from './moods'
import { sceneRegistry } from './registry'

/**
 * The shadow under the aircraft. It is the aircraft's real underside, seen
 * from the floor and blurred: darkest under the wheels, engines and belly,
 * fainter under the high tail. It is drawn ONCE into a small texture when the
 * model arrives, so it costs nothing per frame, which matters on phones and
 * laptop graphics.
 *
 * Its strength follows the mood (see moods.ts): none in the Systems view.
 */
export function GroundShadow() {
  const version = useStore((s) => s.sceneVersion)
  const box = useMemo(() => {
    void version
    const b = new THREE.Box3()
    for (const id of sceneRegistry.skin.keys()) {
      const pb = sceneRegistry.bounds.get(id)
      if (pb) b.union(pb)
    }
    return b
  }, [version])
  if (box.isEmpty()) return null
  const len = box.max.x - box.min.x
  const span = box.max.z - box.min.z
  const cx = (box.max.x + box.min.x) / 2
  const cz = (box.max.z + box.min.z) / 2
  // Re-draw only if the outline itself changes (another model), not on every scene update.
  const key = [cx, cz, len, span, box.max.y].map((n) => n.toFixed(1)).join('|')
  return <Baked key={key} cx={cx} cz={cz} width={len * 1.3} depth={span * 1.3} height={box.max.y + 1} />
}

const SIZE = 512
const FLOOR = 0.02

/** What the floor "sees": each surface writes how close it is, and the closest one wins. */
function depthMaterial() {
  const m = new THREE.MeshDepthMaterial()
  m.side = THREE.DoubleSide
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( 0.0, 0.0, 0.0, pow( clamp( 1.0 - fragCoordZ, 0.0, 1.0 ), 1.6 ) );',
    )
  }
  return m
}

/** One direction of a soft blur; run across and then down. */
function blurMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec4 s = texture2D(tMap, vUv) * 0.1964825501511404;
        s += (texture2D(tMap, vUv + uStep * 1.411764705882353) + texture2D(tMap, vUv - uStep * 1.411764705882353)) * 0.2969069646728344;
        s += (texture2D(tMap, vUv + uStep * 3.2941176470588234) + texture2D(tMap, vUv - uStep * 3.2941176470588234)) * 0.09447039785044732;
        s += (texture2D(tMap, vUv + uStep * 5.176470588235294) + texture2D(tMap, vUv - uStep * 5.176470588235294)) * 0.010381362401148057;
        gl_FragColor = s;
      }
    `,
    depthTest: false,
    depthWrite: false,
  })
}

const Baked = memo(function Baked({ cx, cz, width, depth, height }: { cx: number; cz: number; width: number; depth: number; height: number }) {
  const baked = useRef(false)
  const res = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE)
    const temp = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false })
    // A camera lying on the floor, looking straight up: right is +X (aft), up is +Z (port).
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height)
    camera.position.set(cx, FLOOR, cz)
    camera.up.set(0, 0, 1)
    camera.lookAt(cx, FLOOR + 1, cz)
    camera.updateMatrixWorld()
    // The floor quad, with texture coordinates matching that camera.
    const quad = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2)
    const uv = quad.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    const material = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 })
    // A full-frame quad for the blur passes; its shader ignores the camera, so it must never be culled.
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    screen.frustumCulled = false
    return { target, temp, camera, quad, material, depth: depthMaterial(), blur: blurMaterial(), screen }
  }, [cx, cz, width, depth, height])
  useEffect(
    () => () => {
      res.target.dispose()
      res.temp.dispose()
      res.quad.dispose()
      res.material.dispose()
      res.depth.dispose()
      res.blur.dispose()
      res.screen.geometry.dispose()
      baked.current = false
    },
    [res],
  )

  const mesh = useRef<THREE.Mesh>(null)
  useFrame(({ gl, scene }) => {
    if (mesh.current) {
      mesh.current.visible = liveMood.shadow > 0.01
      res.material.opacity = liveMood.shadow
    }
    if (baked.current) return
    baked.current = true

    const before = {
      target: gl.getRenderTarget(),
      override: scene.overrideMaterial,
      background: scene.background,
      planes: gl.clippingPlanes,
      color: gl.getClearColor(new THREE.Color()),
      alpha: gl.getClearAlpha(),
    }
    if (mesh.current) mesh.current.visible = false
    gl.clippingPlanes = []
    scene.background = null
    scene.overrideMaterial = res.depth
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(res.target)
    gl.clear()
    gl.render(scene, res.camera)
    scene.overrideMaterial = before.override
    scene.background = before.background

    // Two rounds, wide then tight, give a soft edge without visible steps.
    res.screen.material = res.blur
    for (const spread of [2.2, 1.1]) {
      for (const [source, dest, x, y] of [
        [res.target, res.temp, spread, 0],
        [res.temp, res.target, 0, spread],
      ] as const) {
        res.blur.uniforms.tMap.value = source.texture
        res.blur.uniforms.uStep.value.set(x / SIZE, y / SIZE)
        gl.setRenderTarget(dest)
        gl.clear()
        gl.render(res.screen, res.camera)
      }
    }

    gl.setRenderTarget(before.target)
    gl.setClearColor(before.color, before.alpha)
    gl.clippingPlanes = before.planes
    if (mesh.current) mesh.current.visible = liveMood.shadow > 0.01
  })

  return <mesh ref={mesh} geometry={res.quad} material={res.material} position={[cx, FLOOR, cz]} renderOrder={2} raycast={() => null} />
})
