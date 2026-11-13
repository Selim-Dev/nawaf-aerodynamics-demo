/**
 * Interface-only state: the opening screen, the chosen backdrop and which side
 * columns are open. Kept apart from src/store.ts, which holds what the learner
 * is looking at (aircraft, part, system).
 */
import { create } from 'zustand'
import { presentation } from '../presentation'

export type Backdrop = 'studio' | 'daylight'

interface UiState {
  /** 'intro' until the learner presses Start on the opening screen. */
  phase: 'intro' | 'explore'
  backdrop: Backdrop
  /** Desktop only: the parts column and the details column can be folded away to enlarge the 3D view. */
  sideOpen: boolean
  panelOpen: boolean
  /** Text typed in the sidebar's search box. */
  query: string
  enter: () => void
  setBackdrop: (b: Backdrop) => void
  toggleSide: () => void
  togglePanel: () => void
  setQuery: (q: string) => void
}

const KEY = 'aircraft-explorer.backdrop'

function initialBackdrop(): Backdrop {
  const q = new URLSearchParams(window.location.search).get('backdrop')
  if (q === 'studio' || q === 'daylight') return q
  try {
    const saved = window.localStorage.getItem(KEY)
    if (saved === 'studio' || saved === 'daylight') return saved
  } catch {
    // localStorage can throw inside third-party iframes; the default is fine.
  }
  return 'studio'
}

export const useUi = create<UiState>((set) => ({
  phase: presentation.showIntro ? 'intro' : 'explore',
  backdrop: initialBackdrop(),
  sideOpen: true,
  panelOpen: true,
  query: '',
  enter: () => set({ phase: 'explore' }),
  setBackdrop: (backdrop) => {
    try {
      window.localStorage.setItem(KEY, backdrop)
    } catch {
      /* see initialBackdrop */
    }
    set({ backdrop })
  },
  toggleSide: () => set((s) => ({ sideOpen: !s.sideOpen })),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setQuery: (query) => set({ query }),
}))
