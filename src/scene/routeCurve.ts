import * as THREE from 'three'

/**
 * A polyline with rounded corners. Straight runs with small fillets look like
 * real pipe routing and, unlike a spline, never overshoot through the skin.
 */
export function filletedPath(points: THREE.Vector3[], maxFillet = 0.35): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>()
  const pts = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-6)
  if (pts.length < 2) {
    const p = pts[0] ?? new THREE.Vector3()
    path.add(new THREE.LineCurve3(p.clone(), p.clone().add(new THREE.Vector3(0.01, 0, 0))))
    return path
  }
  let start = pts[0].clone()
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]
    const corner = pts[i]
    const next = pts[i + 1]
    const inLen = corner.distanceTo(prev)
    const outLen = corner.distanceTo(next)
    const r = Math.min(maxFillet, inLen * 0.45, outLen * 0.45)
    const a = corner.clone().addScaledVector(prev.clone().sub(corner).normalize(), r)
    const b = corner.clone().addScaledVector(next.clone().sub(corner).normalize(), r)
    if (start.distanceToSquared(a) > 1e-8) path.add(new THREE.LineCurve3(start, a))
    path.add(new THREE.QuadraticBezierCurve3(a, corner.clone(), b))
    start = b
  }
  path.add(new THREE.LineCurve3(start, pts[pts.length - 1].clone()))
  return path
}

export function tubeFor(path: THREE.CurvePath<THREE.Vector3>, radius: number, radial = 8) {
  const length = path.getLength()
  const segments = Math.min(600, Math.max(8, Math.ceil(length * 5) + path.curves.length * 4))
  return new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, segments, radius, radial, false)
}

let stripes: THREE.CanvasTexture | null = null
/** Repeating light/dark bands; scrolling its offset makes fluid appear to move along a pipe. */
export function flowTexture() {
  if (stripes) return stripes
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 4
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 64, 0)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, '#ffffff')
  grad.addColorStop(0.6, '#8a8a8a')
  grad.addColorStop(1, '#ffffff')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 4)
  stripes = new THREE.CanvasTexture(c)
  stripes.wrapS = THREE.RepeatWrapping
  stripes.wrapT = THREE.RepeatWrapping
  stripes.colorSpace = THREE.SRGBColorSpace
  return stripes
}
