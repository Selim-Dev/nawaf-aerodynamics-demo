/**
 * Non-reactive scene registry. Scene components write here after building
 * geometry; the camera rig, hotspots and authoring tools read from it.
 * Kept outside React state because it holds three.js objects.
 */
import * as THREE from 'three'

export const sceneRegistry = {
  /** Exterior (skin) part meshes by part id. */
  skin: new Map<string, THREE.Mesh[]>(),
  /** World-space bounds by part id, for skin parts and system components alike. */
  bounds: new Map<string, THREE.Box3>(),
  /** Hotspot positions by part id. */
  anchors: new Map<string, THREE.Vector3>(),
  /**
   * Bounds and anchors of what the active system draws. Kept apart from the
   * skin's, because a system can draw a part that also exists on the exterior
   * (the rudder in Flight controls, the APU in the cabin view).
   */
  sysBounds: new Map<string, THREE.Box3>(),
  sysAnchors: new Map<string, THREE.Vector3>(),
  /** Every skin mesh, flat, for raycasts that ignore interactivity (authoring, occlusion). */
  skinMeshes: [] as THREE.Mesh[],
  version: 0,
}

export function boundsFor(partId: string, systemsView: boolean) {
  return (systemsView && sceneRegistry.sysBounds.get(partId)) || sceneRegistry.bounds.get(partId)
}

export function anchorFor(partId: string, systemsView: boolean) {
  return systemsView ? sceneRegistry.sysAnchors.get(partId) : sceneRegistry.anchors.get(partId)
}
