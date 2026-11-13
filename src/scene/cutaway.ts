import * as THREE from 'three'

/** Clipping planes for the see-through skin and frames in the Systems view. */
export const CUT_PLANES = {
  none: [] as THREE.Plane[],
  /**
   * Removes everything above 4.7 m: the crown, overhead bins and ceiling ducts,
   * so the cabin can be seen from above. Applied to the whole scene (see Viewer).
   */
  top: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 4.7)],
  /** Removes the port (left) half. */
  side: [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)],
}
