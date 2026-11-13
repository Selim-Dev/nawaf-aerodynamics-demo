/**
 * Sound settings (on / off, music and effects volume) and the wiring that
 * turns what the learner does into sounds. The settings are remembered.
 *
 * Interface sounds are driven from here by watching the two stores, so no
 * component needs to know that sound exists.
 */
import { create } from 'zustand'
import { getAircraft, internalSystems } from '../data/aircraft'
import { useStore } from '../store'
import { useUi } from '../ui/uiStore'
import { engine, renderPreview, type Sfx } from './engine'

interface SoundState {
  enabled: boolean
  /** 0 to 1. */
  music: number
  effects: number
  /** True once the browser has allowed audio to start (after the first click or key press). */
  started: boolean
  toggle: () => void
  setMusic: (v: number) => void
  setEffects: (v: number) => void
  /** Call from a click or key handler: browsers only start audio from a user gesture. */
  unlock: () => void
}

const KEY = 'aircraft-explorer.sound'

function load() {
  const base = { enabled: true, music: 0.6, effects: 0.7 }
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<typeof base> | null
    if (saved && typeof saved === 'object') {
      if (typeof saved.enabled === 'boolean') base.enabled = saved.enabled
      if (typeof saved.music === 'number') base.music = Math.min(1, Math.max(0, saved.music))
      if (typeof saved.effects === 'number') base.effects = Math.min(1, Math.max(0, saved.effects))
    }
  } catch {
    // Private mode or a third-party iframe: fall back to the defaults.
  }
  // ?sound=0 lets a host page start the viewer silent.
  if (new URLSearchParams(window.location.search).get('sound') === '0') base.enabled = false
  return base
}

function save(s: SoundState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, music: s.music, effects: s.effects }))
  } catch {
    /* see load */
  }
}

/** The faders feel even when the gain follows the square of the slider position. */
const curve = (v: number) => v * v

export const useSound = create<SoundState>((set, get) => ({
  ...load(),
  started: false,
  toggle: () => {
    const enabled = !get().enabled
    set({ enabled })
    engine.setEnabled(enabled)
    // On the opening screen the switch only records the choice; the music begins when Start is pressed.
    if (enabled && useUi.getState().phase === 'explore') get().unlock()
    save(get())
  },
  setMusic: (music) => {
    set({ music })
    engine.setMusicVolume(curve(music) * 1.6)
    save(get())
  },
  setEffects: (effects) => {
    set({ effects })
    engine.setSfxVolume(curve(effects) * 2.4)
    save(get())
  },
  unlock: () => {
    const s = get()
    if (!s.enabled) return
    engine.setMusicVolume(curve(s.music) * 1.6)
    engine.setSfxVolume(curve(s.effects) * 2.4)
    engine.setEnabled(true)
    engine.unlock()
    if (engine.ready && !s.started) set({ started: true })
  },
}))

export const playSound = (name: Sfx, arg?: number) => engine.play(name, arg)

let wired = false

/** Connects the stores to the sound engine. Call once at start-up. */
export function initSoundscape() {
  if (wired) return
  wired = true

  // Without the opening screen there is no Start button, so the first click or key press starts audio.
  const firstGesture = () => {
    if (useUi.getState().phase !== 'explore') return
    useSound.getState().unlock()
    if (engine.ready || !useSound.getState().enabled) {
      window.removeEventListener('pointerdown', firstGesture, true)
      window.removeEventListener('keydown', firstGesture, true)
    }
  }
  window.addEventListener('pointerdown', firstGesture, true)
  window.addEventListener('keydown', firstGesture, true)

  let levelChangedAt = 0
  useStore.subscribe((s, p) => {
    if (s.level !== p.level) {
      levelChangedAt = performance.now()
      playSound(s.level === 'systems' ? 'xrayOn' : 'xrayOff')
      return
    }
    if (s.activeSystem !== p.activeSystem) {
      // Entering the Systems view picks the first system automatically; the scan sound covers that.
      if (s.activeSystem && performance.now() - levelChangedAt > 400) {
        const index = internalSystems(getAircraft(s.aircraftId)).findIndex((x) => x.id === s.activeSystem)
        playSound('system', Math.max(0, index))
      }
      return
    }
    if (s.selected !== p.selected) playSound(s.selected ? 'select' : 'deselect')
    else if (s.hovered?.partId && s.hovered.partId !== p.hovered?.partId) playSound('hover')
    if (s.focus.nonce !== p.focus.nonce) playSound('whoosh')
    if (s.cutaway !== p.cutaway || s.showHotspots !== p.showHotspots || s.showStructure !== p.showStructure || s.flow !== p.flow || s.lang !== p.lang)
      playSound('toggle')
  })

  useUi.subscribe((s, p) => {
    if (s.phase !== p.phase && s.phase === 'explore') playSound('start')
    else if (s.backdrop !== p.backdrop) playSound('whoosh')
    else if (s.sideOpen !== p.sideOpen || s.panelOpen !== p.panelOpen) playSound('toggle')
  })

  // Developer check: render the music offline and report its loudness (see README, "Sound").
  if (import.meta.env.DEV) Object.assign(window, { __renderAudio: renderPreview })
}
