import { create } from 'zustand'
import type { V3 } from '../data/schema'

export interface Pick {
  point: V3
  partId: string
  sourceName: string
}

interface AuthoringState {
  pick: Pick | null
  routePoints: V3[]
  surfaceMode: boolean
  selectedVolume: { entry: number; volume: number } | null
  gizmo: 'translate' | 'rotate' | 'scale'
  viewRequest: { view: 'top' | 'side' | 'front' | 'rear'; nonce: number } | null
  toast: string | null
  setPick: (p: Pick | null) => void
  addPoint: (p: V3) => void
  undoPoint: () => void
  clearRoute: () => void
  setSurfaceMode: (v: boolean) => void
  selectVolume: (v: AuthoringState['selectedVolume']) => void
  setGizmo: (g: AuthoringState['gizmo']) => void
  requestView: (view: 'top' | 'side' | 'front' | 'rear') => void
  notify: (msg: string) => void
}

export const round = (n: number) => Math.round(n * 100) / 100
export const roundV = (v: { x: number; y: number; z: number }): V3 => [round(v.x), round(v.y), round(v.z)]

export const useAuthoring = create<AuthoringState>((set) => ({
  pick: null,
  routePoints: [],
  surfaceMode: false,
  selectedVolume: null,
  gizmo: 'translate',
  viewRequest: null,
  toast: null,
  setPick: (pick) => set({ pick }),
  addPoint: (p) => set((s) => ({ routePoints: [...s.routePoints, p] })),
  undoPoint: () => set((s) => ({ routePoints: s.routePoints.slice(0, -1) })),
  clearRoute: () => set({ routePoints: [] }),
  setSurfaceMode: (surfaceMode) => set({ surfaceMode }),
  selectVolume: (selectedVolume) => set({ selectedVolume }),
  setGizmo: (gizmo) => set({ gizmo }),
  requestView: (view) => set((s) => ({ viewRequest: { view, nonce: (s.viewRequest?.nonce ?? 0) + 1 } })),
  notify: (toast) => {
    set({ toast })
    window.setTimeout(() => set((s) => (s.toast === toast ? { toast: null } : s)), 2200)
  },
}))

export async function copyText(text: string, notify: (m: string) => void, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    notify(`${label} to clipboard`)
  } catch {
    console.log(text)
    notify('Clipboard blocked: printed to the console instead')
  }
}
