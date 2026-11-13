import { lazy, Suspense } from 'react'
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { AircraftData } from '../data/aircraft'
import { useStore } from '../store'
import { AircraftModel } from './AircraftModel'
import { Backdrop } from './Backdrop'
import { CameraRig } from './CameraRig'
import { GroundShadow } from './GroundShadow'
import { HotspotProjector } from './Hotspots'
import { CUT_PLANES } from './cutaway'
import { StructureContext } from './StructureContext'
import { SystemsLayer } from './SystemsLayer'

// Dev-only: the branch is a literal `false` in production builds, so the
// authoring tools are dropped from the bundle entirely.
const AuthoringScene = import.meta.env.DEV ? lazy(() => import('../authoring/AuthoringScene')) : null

/**
 * The top cutaway clips the whole scene, components included, so the cabin opens up from above.
 * The sky and floor are drawn by their own shaders, which ignore clipping, so they stay whole.
 */
function TopCut() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const on = useStore((s) => s.level === 'systems' && s.cutaway === 'top')
  useEffect(() => {
    gl.clippingPlanes = on ? CUT_PLANES.top : []
    invalidate()
    return () => {
      gl.clippingPlanes = []
    }
  }, [gl, on, invalidate])
  return null
}

export function Viewer({ data }: { data: AircraftData }) {
  const select = useStore((s) => s.select)
  const authorMode = useStore((s) => s.authorMode)
  const { fov, position } = data.aircraft.camera

  return (
    <Canvas
      className="canvas"
      dpr={[1, 1.75]}
      // The far plane reaches the horizon of the floor; depth precision depends on the near plane, which is unchanged.
      camera={{ fov, position, near: 0.1, far: 2600 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
      }}
      onPointerMissed={(e) => {
        if (e.type === 'click' && authorMode !== 'route') select(null)
      }}
    >
      {/* Sky, floor and lights are outside Suspense, so the studio is there while the aircraft downloads. */}
      <Backdrop data={data} />
      <Suspense fallback={null}>
        <AircraftModel data={data} />
        <StructureContext data={data} />
        <SystemsLayer data={data} />
        <HotspotProjector data={data} />
        {AuthoringScene && authorMode !== 'off' && <AuthoringScene data={data} />}
        <GroundShadow />
      </Suspense>
      <CameraRig aircraft={data.aircraft} />
      <TopCut />
    </Canvas>
  )
}
