import { create } from 'zustand'
import type { Lang } from './i18n/strings'
import type { Mapping } from './data/schema'

export type Level = 'exterior' | 'systems'
export type Cutaway = 'none' | 'top' | 'side'

export interface Hover {
  partId: string | null
  /** Shown instead of the part name when the hovered thing has no part record (e.g. an unnamed pipe). */
  label?: string
}

interface State {
  aircraftId: string
  lang: Lang
  level: Level
  activeSystem: string | null
  hovered: Hover | null
  selected: string | null
  cutaway: Cutaway
  showHotspots: boolean
  /** Faint frames and stringers in the Systems view. */
  showStructure: boolean
  flow: boolean
  debugColors: boolean
  /** Paint each object of the source model its own colour (?debug=meshes), to work out the mapping. */
  debugMeshes: boolean
  /** Bumped to ask the camera to frame a part, or to reset when partId is null. */
  focus: { partId: string | null; nonce: number }
  /** Authoring-only override of mapping.json, so volume edits re-classify live. */
  mappingOverride: Mapping | null
  authorMode: 'off' | 'inspect' | 'volumes' | 'route'
  /** Bumped whenever the scene registry (meshes, bounds, anchors) changes. */
  sceneVersion: number

  setLang: (lang: Lang) => void
  setLevel: (level: Level) => void
  setActiveSystem: (id: string | null) => void
  setHovered: (hover: Hover | null) => void
  select: (partId: string | null, opts?: { focus?: boolean }) => void
  setCutaway: (c: Cutaway) => void
  toggleHotspots: () => void
  toggleStructure: () => void
  toggleFlow: () => void
  resetView: () => void
  setMappingOverride: (m: Mapping | null) => void
  setAuthorMode: (m: State['authorMode']) => void
  bumpScene: () => void
}

const params = new URLSearchParams(window.location.search)

function initialLang(): Lang {
  const q = params.get('lang')
  if (q === 'ar' || q === 'en') return q
  try {
    const saved = window.localStorage.getItem('aircraft-explorer.lang')
    if (saved === 'ar' || saved === 'en') return saved
  } catch {
    // localStorage can throw inside third-party iframes; the default is fine.
  }
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

const isTouch = window.matchMedia?.('(hover: none)').matches ?? false

export const useStore = create<State>((set, get) => ({
  aircraftId: params.get('aircraft') ?? 'a320',
  lang: initialLang(),
  level: params.get('level') === 'systems' ? 'systems' : 'exterior',
  activeSystem: params.get('system'),
  hovered: null,
  selected: null,
  cutaway: 'none',
  showHotspots: isTouch,
  showStructure: true,
  flow: true,
  debugColors: params.get('debug') === 'parts',
  debugMeshes: params.get('debug') === 'meshes',
  focus: { partId: null, nonce: 0 },
  mappingOverride: null,
  authorMode: import.meta.env.DEV && params.has('author') ? 'inspect' : 'off',
  sceneVersion: 0,

  setLang: (lang) => {
    try {
      window.localStorage.setItem('aircraft-explorer.lang', lang)
    } catch {
      /* see initialLang */
    }
    set({ lang })
  },
  setLevel: (level) =>
    set((s) => (s.level === level ? s : { level, selected: null, hovered: null, cutaway: 'none' })),
  setActiveSystem: (activeSystem) => set({ activeSystem, selected: null, hovered: null }),
  setHovered: (hovered) => {
    const cur = get().hovered
    if (cur?.partId === hovered?.partId && cur?.label === hovered?.label) return
    set({ hovered })
  },
  select: (selected, opts) =>
    set((s) => ({
      selected,
      focus: opts?.focus && selected ? { partId: selected, nonce: s.focus.nonce + 1 } : s.focus,
    })),
  setCutaway: (cutaway) => set({ cutaway }),
  toggleHotspots: () => set((s) => ({ showHotspots: !s.showHotspots })),
  toggleStructure: () => set((s) => ({ showStructure: !s.showStructure })),
  toggleFlow: () => set((s) => ({ flow: !s.flow })),
  resetView: () => set((s) => ({ focus: { partId: null, nonce: s.focus.nonce + 1 } })),
  setMappingOverride: (mappingOverride) => set({ mappingOverride }),
  setAuthorMode: (authorMode) => set({ authorMode }),
  bumpScene: () => set((s) => ({ sceneVersion: s.sceneVersion + 1 })),
}))

export const deviceIsTouch = isTouch
