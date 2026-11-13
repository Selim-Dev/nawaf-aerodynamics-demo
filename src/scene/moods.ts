/**
 * The look of the space around the aircraft: sky, floor and lights.
 *
 * "studio" and "daylight" are the two backdrops the learner can choose for the
 * exterior. "xray" is always used for the Systems view: the see-through skin
 * and the frames use additive blending, which only reads against a dark scene.
 *
 * Colours are ordinary sRGB hex values, as they appear on screen.
 */
export interface Mood {
  /** Sky, from straight up, to the horizon, to straight down (seen when looking up at the belly). */
  zenith: string
  horizon: string
  nadir: string
  /** A soft band of light along the horizon behind the aircraft. */
  glow: string
  glowStrength: number
  /** Floor colour, and the pool of light under the aircraft. */
  floor: string
  pool: string
  poolStrength: number
  /** Floor grid (2 m and 10 m squares) and the ring with its tick marks. */
  grid: string
  gridStrength: number
  ringStrength: number
  /** Lettering on the floor: the aircraft name, and the FWD / AFT / LH / RH labels. */
  ink: string
  nameStrength: number
  labelStrength: number
  /** Opacity of the shadow under the aircraft. */
  shadow: number
  hemiSky: string
  hemiGround: string
  hemi: number
  key: string
  keyStrength: number
  rim: string
  rimStrength: number
  /** Strength of the reflected studio environment. */
  env: number
}

export type MoodName = 'studio' | 'daylight' | 'xray'

export const MOODS: Record<MoodName, Mood> = {
  /** A dark showroom: the white aircraft stands in a pool of light. */
  studio: {
    zenith: '#04070e',
    horizon: '#16263f',
    nadir: '#05080f',
    glow: '#3a639f',
    glowStrength: 0.36,
    floor: '#111c2f',
    pool: '#3d587f',
    poolStrength: 0.92,
    grid: '#9cc1ff',
    gridStrength: 0.13,
    ringStrength: 0.26,
    ink: '#e6efff',
    nameStrength: 0.2,
    labelStrength: 0.3,
    shadow: 0.66,
    hemiSky: '#cfe0ff',
    hemiGround: '#141c2b',
    hemi: 0.3,
    key: '#fff6ea',
    keyStrength: 2.5,
    rim: '#8fbaff',
    rimStrength: 1.0,
    env: 0.22,
  },
  /** An apron under a clear sky. Sky and concrete stay mid-toned so the white aircraft still stands out. */
  daylight: {
    zenith: '#2c68bd',
    horizon: '#a9c4e3',
    nadir: '#7f8c9c',
    glow: '#ffffff',
    glowStrength: 0.14,
    floor: '#7d8a9b',
    pool: '#9fabba',
    poolStrength: 0.8,
    grid: '#2a3a52',
    gridStrength: 0.22,
    ringStrength: 0.36,
    ink: '#14233a',
    nameStrength: 0.26,
    labelStrength: 0.42,
    shadow: 0.46,
    hemiSky: '#eaf2ff',
    hemiGround: '#8f959c',
    hemi: 0.45,
    key: '#fff3df',
    keyStrength: 2.3,
    rim: '#cfe0ff',
    rimStrength: 0.45,
    env: 0.3,
  },
  /** The Systems view. Lighting matches what the system colours were tuned against. */
  xray: {
    zenith: '#03060c',
    horizon: '#0d1a2f',
    nadir: '#04070d',
    glow: '#1f4f96',
    glowStrength: 0.26,
    floor: '#070d18',
    pool: '#13233f',
    poolStrength: 0.75,
    grid: '#5a9bff',
    gridStrength: 0.07,
    ringStrength: 0.14,
    ink: '#cfe0ff',
    nameStrength: 0,
    labelStrength: 0.14,
    shadow: 0,
    hemiSky: '#f4f8ff',
    hemiGround: '#8a8f96',
    hemi: 1.35,
    key: '#ffffff',
    keyStrength: 2.1,
    rim: '#ffffff',
    rimStrength: 0.8,
    env: 0.1,
  },
}

const COLORS = ['zenith', 'horizon', 'nadir', 'glow', 'floor', 'pool', 'grid', 'ink', 'hemiSky', 'hemiGround', 'key', 'rim'] as const
const NUMBERS = ['glowStrength', 'poolStrength', 'gridStrength', 'ringStrength', 'nameStrength', 'labelStrength', 'shadow', 'hemi', 'keyStrength', 'rimStrength', 'env'] as const

export type ColorKey = (typeof COLORS)[number]
export type NumberKey = (typeof NUMBERS)[number]

/** Offset of a colour (three numbers) or a number in the flat array from flatten(). */
export const at = (key: ColorKey | NumberKey) => {
  const c = COLORS.indexOf(key as ColorKey)
  return c >= 0 ? c * 3 : COLORS.length * 3 + NUMBERS.indexOf(key as NumberKey)
}

/** A mood as one flat list of numbers, so two moods can be blended with a single loop. */
export function flatten(m: Mood): number[] {
  const out: number[] = []
  for (const k of COLORS) {
    const n = parseInt(m[k].slice(1), 16)
    out.push(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  }
  for (const k of NUMBERS) out.push(m[k])
  return out
}

/** Values other scene components read each frame (the shadow under the aircraft follows the mood). */
export const liveMood = { shadow: 0 }
