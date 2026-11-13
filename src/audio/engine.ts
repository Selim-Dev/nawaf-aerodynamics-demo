/**
 * Sound for the explorer, synthesised in the browser with the Web Audio API.
 *
 * Nothing is downloaded: the background music is generated as it plays (slow
 * pad chords with a few soft bell notes on top, so it never loops audibly) and
 * every interface sound is a few oscillators. That keeps the build small and
 * lets the page work offline, like the rest of the app.
 *
 * Everything is in C major so the interface sounds are always in tune with
 * the music underneath them.
 */
import { MUSIC_FILE } from '../presentation'

export type Sfx = 'hover' | 'select' | 'deselect' | 'toggle' | 'nav' | 'system' | 'xrayOn' | 'xrayOff' | 'whoosh' | 'start'

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

/** Small seeded random generator, so an offline render is repeatable. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Graph {
  ctx: BaseAudioContext
  /** On / off for everything. */
  master: GainNode
  /** Volume faders. Each bus has a dry and a reverb-send fader that move together. */
  musicFader: GainNode
  musicSendFader: GainNode
  sfxFader: GainNode
  sfxSendFader: GainNode
  /** Where sources connect. */
  music: GainNode
  musicSend: GainNode
  sfx: GainNode
  sfxSend: GainNode
  pad: BiquadFilterNode
  echo: GainNode
  noise: AudioBuffer
}

/** A smooth, dark reverb tail made from filtered noise. */
function impulse(ctx: BaseAudioContext, seconds: number, rng: () => number) {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const fadeIn = sr * 0.012
  const buf = ctx.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / n
      const env = (1 - t) ** 3.2 * (i < fadeIn ? i / fadeIn : 1)
      lp += (0.55 - 0.47 * t) * (rng() * 2 - 1 - lp) // the tail gets darker as it fades
      d[i] = lp * env
    }
  }
  return buf
}

function buildGraph(ctx: BaseAudioContext, rng: () => number): Graph {
  // A gentle limiter last in the chain: nothing can clip, whatever overlaps.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -9
  limiter.knee.value = 10
  limiter.ratio.value = 8
  limiter.attack.value = 0.004
  limiter.release.value = 0.22
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.connect(limiter)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 4.6, rng)
  const reverbOut = ctx.createGain()
  reverbOut.gain.value = 0.85
  // Only mids and highs go into the reverb: reverberated bass just turns to mud.
  const reverbIn = ctx.createBiquadFilter()
  reverbIn.type = 'highpass'
  reverbIn.frequency.value = 170
  reverbIn.connect(reverb)
  reverb.connect(reverbOut).connect(master)

  const bus = (lowCut: number) => {
    const input = ctx.createGain()
    const fader = ctx.createGain()
    const send = ctx.createGain()
    const sendFader = ctx.createGain()
    // Removes rumble that laptop and classroom speakers cannot play anyway.
    const clean = ctx.createBiquadFilter()
    clean.type = 'highpass'
    clean.frequency.value = lowCut
    clean.Q.value = 0.6
    input.connect(clean).connect(fader).connect(master)
    send.connect(sendFader).connect(reverbIn)
    return { input, fader, send, sendFader }
  }
  const m = bus(55)
  const s = bus(90)

  // Pad voices share one low-pass filter that opens and closes very slowly, like breathing.
  const pad = ctx.createBiquadFilter()
  pad.type = 'lowpass'
  pad.frequency.value = 1150
  pad.Q.value = 0.6
  const padDry = ctx.createGain()
  padDry.gain.value = 0.8
  const padWet = ctx.createGain()
  padWet.gain.value = 0.6
  pad.connect(padDry).connect(m.input)
  pad.connect(padWet).connect(m.send)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.021
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 330
  lfo.connect(lfoDepth).connect(pad.frequency)
  lfo.start()

  // Ping-pong echo for the bell notes.
  const echo = ctx.createGain()
  const left = ctx.createDelay(1.5)
  const right = ctx.createDelay(1.5)
  left.delayTime.value = 0.44
  right.delayTime.value = 0.66
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 2300
  const panL = ctx.createStereoPanner()
  const panR = ctx.createStereoPanner()
  panL.pan.value = -0.6
  panR.pan.value = 0.6
  echo.connect(left)
  left.connect(panL)
  left.connect(right)
  right.connect(panR)
  right.connect(damp).connect(feedback).connect(left)
  for (const p of [panL, panR]) {
    p.connect(m.input)
    p.connect(m.send)
  }

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1

  return {
    ctx,
    master,
    musicFader: m.fader,
    musicSendFader: m.sendFader,
    sfxFader: s.fader,
    sfxSendFader: s.sendFader,
    music: m.input,
    musicSend: m.send,
    sfx: s.input,
    sfxSend: s.send,
    pad,
    echo,
    noise,
  }
}

// ---------------------------------------------------------------- music

interface Chord {
  /** Bass note. */
  root: number
  /** Pad voicing, low to high. */
  notes: number[]
  /** Bell notes that sit well over this chord. */
  bells: number[]
}

/** I, vi, IV, V in C major, each with an added ninth or sixth: open and calm, with no tension to resolve. */
const CHORDS: Chord[] = [
  { root: 36, notes: [48, 55, 62, 64, 71], bells: [72, 74, 76, 79, 81, 83, 84, 86, 88] }, // Cmaj9
  { root: 33, notes: [45, 52, 60, 62, 67], bells: [72, 74, 76, 79, 81, 84, 86, 88] }, // Am11
  { root: 29, notes: [41, 48, 57, 64, 67], bells: [72, 74, 76, 79, 81, 84, 86, 88] }, // Fmaj9
  { root: 31, notes: [43, 50, 57, 59, 64], bells: [74, 76, 79, 81, 83, 86, 88] }, // G6/9
]

/**
 * One sustained pad note: two slightly detuned saws and a sine, fading in and
 * out over several seconds, so one chord dissolves into the next.
 *
 * Low notes are the exception. Two bass notes a tone apart sound muddy
 * together, so a low note leaves quickly and the next one waits for it.
 */
function padNote(g: Graph, note: number, from: number, to: number, level: number, pan: number, soft = false) {
  const { ctx } = g
  const low = note < 50
  const start = low ? from + 2.2 : from
  const attack = low ? 3.5 : 5.5
  const release = low ? 2.6 : 7.5
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(level, start + attack)
  amp.gain.setValueAtTime(level, to)
  amp.gain.linearRampToValueAtTime(0, to + release)
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  amp.connect(panner).connect(g.pad)
  const end = to + release + 0.1
  const f = midi(note)
  // A small detune gives a slow, gentle shimmer in the middle of the chord. Low notes get
  // no detune at all: beating in the bass is heard as a wobble.
  const voices: [OscillatorType, number, number][] = soft
    ? [['sine', 0, 1]]
    : low
      ? [
          ['sine', 0, 0.8],
          ['triangle', 0, 0.35],
        ]
      : [
          ['sawtooth', -4, 0.5],
          ['sawtooth', 4, 0.5],
          ['sine', 0, 0.9],
        ]
  for (const [type, detune, gain] of voices) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = f
    osc.detune.value = detune
    const og = ctx.createGain()
    og.gain.value = gain
    osc.connect(og).connect(amp)
    osc.start(start)
    osc.stop(end)
  }
}

/** A soft glass-like bell: a sine with two quiet overtones and a long decay, sent to the echo and reverb. */
function bell(g: Graph, note: number, at: number, velocity: number, pan: number) {
  const { ctx } = g
  const f = midi(note)
  const decay = 2.6 - (note - 72) * 0.05
  const out = ctx.createStereoPanner()
  out.pan.value = pan
  const partials: [number, number, number][] = [
    [1, 1, decay],
    [2, 0.26, decay * 0.6],
    [3.01, 0.07, decay * 0.3],
  ]
  for (const [ratio, gain, d] of partials) {
    const osc = ctx.createOscillator()
    osc.frequency.value = f * ratio
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0, at)
    amp.gain.linearRampToValueAtTime(velocity * gain, at + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + d)
    osc.connect(amp).connect(out)
    osc.start(at)
    osc.stop(at + d + 0.05)
  }
  const dry = ctx.createGain()
  dry.gain.value = 0.8
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  const toEcho = ctx.createGain()
  toEcho.gain.value = 0.4
  out.connect(dry).connect(g.music)
  out.connect(wet).connect(g.musicSend)
  out.connect(toEcho).connect(g.echo)
}

/** Writes the music ahead of time, a few seconds at a time. */
class Composer {
  private chordAt: number
  private chordIndex = 0
  private bellAt: number
  private last = 76
  private segments: { from: number; to: number; chord: Chord }[] = []

  constructor(
    private g: Graph,
    private rng: () => number,
    start: number,
  ) {
    this.chordAt = start + 0.05
    this.bellAt = start + 6.5
  }

  schedule(until: number) {
    const { g, rng } = this
    while (this.chordAt < until) {
      const chord = CHORDS[this.chordIndex++ % CHORDS.length]
      const from = this.chordAt
      const to = from + 17 + rng() * 6
      const n = chord.notes.length
      chord.notes.forEach((note, i) => {
        const pan = (i % 2 ? 1 : -1) * (0.15 + (0.55 * i) / n)
        padNote(g, note, from, to, 0.07 * (1 - 0.06 * i), pan)
      })
      // A quiet sine under the lowest chord note for warmth. There is no deeper sub-bass:
      // small speakers cannot play it, so the music must not depend on it.
      padNote(g, chord.root + 12, from, to, 0.026, 0, true)
      // Sometimes a high, airy note doubles the middle of the chord.
      if (rng() < 0.55) padNote(g, chord.notes[2] + 12, from + 2, to - 2, 0.016, rng() * 0.8 - 0.4, true)
      this.segments.push({ from, to, chord })
      this.chordAt = to
    }
    while (this.bellAt < until) {
      this.phrase(this.bellAt)
      this.bellAt += 3.4 + rng() * 5.8
    }
    this.segments = this.segments.filter((s) => s.to > until - 60)
  }

  private chordAtTime(t: number) {
    return (this.segments.find((s) => t >= s.from && t < s.to) ?? this.segments[this.segments.length - 1]).chord
  }

  /** One to three bell notes that wander up and down the scale by small steps. */
  private phrase(at: number) {
    const { g, rng } = this
    const r = rng()
    const count = r < 0.12 ? 3 : r < 0.42 ? 2 : 1
    let t = at
    for (let i = 0; i < count; i++) {
      const scale = this.chordAtTime(t).bells
      let ix = 0
      for (let k = 1; k < scale.length; k++) if (Math.abs(scale[k] - this.last) < Math.abs(scale[ix] - this.last)) ix = k
      const step = [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)]
      ix = Math.min(scale.length - 1, Math.max(0, ix + step))
      this.last = scale[ix]
      bell(g, this.last, t, 0.028 + rng() * 0.03, rng() * 1.2 - 0.6)
      t += 0.34 + rng() * 0.3
    }
  }
}

// ---------------------------------------------------------------- interface sounds

interface ToneOptions {
  type?: OscillatorType
  /** Start frequency, and an optional frequency to glide to. */
  f: number
  to?: number
  at: number
  dur: number
  gain: number
  attack?: number
  /** Reverb amount, 0 to 1. */
  wet?: number
}

function tone(g: Graph, o: ToneOptions) {
  const { ctx } = g
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.f, o.at)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur * 0.9)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, o.at)
  amp.gain.linearRampToValueAtTime(o.gain, o.at + (o.attack ?? 0.006))
  amp.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur)
  osc.connect(amp).connect(g.sfx)
  if (o.wet) {
    const send = ctx.createGain()
    send.gain.value = o.wet
    amp.connect(send).connect(g.sfxSend)
  }
  osc.start(o.at)
  osc.stop(o.at + o.dur + 0.05)
}

interface SweepOptions {
  at: number
  dur: number
  gain: number
  /** Band-pass centre frequency at the start, the middle and the end. */
  f: [number, number, number]
  q?: number
  wet?: number
}

/** A breath of filtered noise whose pitch moves: the "air" in the whoosh and scan sounds. */
function sweep(g: Graph, o: SweepOptions) {
  const { ctx } = g
  const src = ctx.createBufferSource()
  src.buffer = g.noise
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = o.q ?? 1
  filter.frequency.setValueAtTime(o.f[0], o.at)
  filter.frequency.exponentialRampToValueAtTime(o.f[1], o.at + o.dur * 0.5)
  filter.frequency.exponentialRampToValueAtTime(o.f[2], o.at + o.dur)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, o.at)
  amp.gain.linearRampToValueAtTime(o.gain, o.at + o.dur * 0.35)
  amp.gain.linearRampToValueAtTime(0, o.at + o.dur)
  src.connect(filter).connect(amp).connect(g.sfx)
  if (o.wet) {
    const send = ctx.createGain()
    send.gain.value = o.wet
    amp.connect(send).connect(g.sfxSend)
  }
  src.start(o.at)
  src.stop(o.at + o.dur + 0.05)
}

/** C major pentatonic: each system in the list gets its own note. */
const PENTATONIC = [72, 74, 76, 79, 81, 84, 86]

function playSfx(g: Graph, name: Sfx, at: number, arg = 0) {
  switch (name) {
    case 'hover':
      tone(g, { f: midi(91), at, dur: 0.07, gain: 0.03, attack: 0.004 })
      break
    case 'select':
      tone(g, { type: 'triangle', f: midi(76), at, dur: 0.5, gain: 0.085, wet: 0.5 })
      tone(g, { type: 'triangle', f: midi(83), at: at + 0.075, dur: 0.75, gain: 0.075, wet: 0.6 })
      tone(g, { f: midi(95), at: at + 0.075, dur: 0.4, gain: 0.014, wet: 0.6 })
      break
    case 'deselect':
      tone(g, { f: midi(79), to: midi(72), at, dur: 0.24, gain: 0.05, wet: 0.3 })
      break
    case 'toggle':
      tone(g, { type: 'triangle', f: midi(84), at, dur: 0.06, gain: 0.045, attack: 0.003 })
      break
    case 'nav':
      tone(g, { f: midi(88), at, dur: 0.1, gain: 0.04, attack: 0.004, wet: 0.2 })
      break
    case 'system': {
      const note = PENTATONIC[((arg % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]
      tone(g, { f: midi(note), at, dur: 0.55, gain: 0.08, wet: 0.5 })
      tone(g, { f: midi(note + 24), at, dur: 0.12, gain: 0.014 })
      break
    }
    case 'xrayOn':
      sweep(g, { at, dur: 0.8, gain: 0.06, f: [260, 1200, 3400], q: 1.3, wet: 0.5 })
      tone(g, { f: midi(48), to: midi(72), at, dur: 0.8, gain: 0.05, attack: 0.25, wet: 0.4 })
      tone(g, { f: midi(84), at: at + 0.55, dur: 0.9, gain: 0.04, wet: 0.7 })
      tone(g, { f: midi(91), at: at + 0.63, dur: 0.9, gain: 0.028, wet: 0.7 })
      break
    case 'xrayOff':
      sweep(g, { at, dur: 0.65, gain: 0.05, f: [3200, 1100, 300], q: 1.3, wet: 0.4 })
      tone(g, { f: midi(72), to: midi(55), at, dur: 0.6, gain: 0.045, attack: 0.1, wet: 0.4 })
      tone(g, { type: 'triangle', f: midi(67), at: at + 0.45, dur: 0.7, gain: 0.04, wet: 0.6 })
      break
    case 'whoosh':
      sweep(g, { at, dur: 0.6, gain: 0.04, f: [420, 1500, 640], q: 0.8, wet: 0.3 })
      break
    case 'start': {
      // A rising arpeggio over a low swell: the curtain going up.
      const notes = [60, 67, 72, 76, 79, 86]
      notes.forEach((n, i) => tone(g, { type: 'triangle', f: midi(n), at: at + i * 0.075, dur: 1.6, gain: 0.055 - i * 0.004, wet: 0.8 }))
      tone(g, { f: midi(48), at, dur: 2.4, gain: 0.07, attack: 0.5, wet: 0.5 })
      sweep(g, { at, dur: 1.5, gain: 0.03, f: [500, 1800, 4200], q: 0.7, wet: 0.6 })
      break
    }
  }
}

// ---------------------------------------------------------------- live engine

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

class AudioEngine {
  private ctx: AudioContext | null = null
  private g: Graph | null = null
  private composer: Composer | null = null
  private media: HTMLAudioElement | null = null
  private timer = 0
  private idle = 0
  private on = true
  private hidden = false
  private musicVolume = 0.6
  private sfxVolume = 0.7
  private lastHover = 0

  /** True once a user gesture has started the audio context. */
  get ready() {
    return !!this.ctx
  }

  /**
   * Starts audio. Browsers only allow this from a user gesture (a click or a
   * key press), so call it from one. Safe to call again.
   */
  unlock() {
    if (this.ctx) {
      this.apply()
      return
    }
    const AC = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
    if (!AC) return
    try {
      this.ctx = new AC({ latencyHint: 'interactive' })
    } catch {
      return
    }
    const g = (this.g = buildGraph(this.ctx, Math.random))
    const now = this.ctx.currentTime
    g.master.gain.value = 0
    g.sfxFader.gain.value = g.sfxSendFader.gain.value = this.sfxVolume
    // The music fades in over a few seconds instead of starting abruptly.
    for (const p of [g.musicFader.gain, g.musicSendFader.gain]) {
      p.setValueAtTime(0, now)
      p.linearRampToValueAtTime(this.musicVolume, now + 3.5)
    }
    if (MUSIC_FILE) {
      const el = (this.media = new Audio(import.meta.env.BASE_URL + MUSIC_FILE))
      el.loop = true
      el.preload = 'auto'
      this.ctx.createMediaElementSource(el).connect(g.music)
    } else {
      this.composer = new Composer(g, mulberry32(Date.now()), now)
    }
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden'
      this.apply()
    })
    this.apply()
  }

  setEnabled(on: boolean) {
    this.on = on
    this.apply()
  }

  setMusicVolume(v: number) {
    this.musicVolume = v
    const g = this.g
    if (!g) return
    const now = g.ctx.currentTime
    for (const p of [g.musicFader.gain, g.musicSendFader.gain]) {
      p.cancelScheduledValues(now)
      p.setTargetAtTime(v, now, 0.08)
    }
  }

  setSfxVolume(v: number) {
    this.sfxVolume = v
    const g = this.g
    if (!g) return
    for (const p of [g.sfxFader.gain, g.sfxSendFader.gain]) p.setTargetAtTime(v, g.ctx.currentTime, 0.05)
  }

  play(name: Sfx, arg?: number) {
    const { ctx, g } = this
    if (!ctx || !g || !this.on || this.hidden || ctx.state === 'closed') return
    if (name === 'hover') {
      // Moving across the aircraft crosses many parts quickly: keep the ticks sparse.
      const now = performance.now()
      if (now - this.lastHover < 90) return
      this.lastHover = now
    }
    playSfx(g, name, ctx.currentTime + 0.015, arg)
  }

  /** Brings the context, the music and the scheduler in line with on / off and tab visibility. */
  private apply() {
    const { ctx, g } = this
    if (!ctx || !g) return
    const active = this.on && !this.hidden
    window.clearTimeout(this.idle)
    window.clearInterval(this.timer)
    if (active) {
      void ctx.resume().then(() => {
        if (!(this.on && !this.hidden)) return
        g.master.gain.setTargetAtTime(1, ctx.currentTime, 0.18)
        this.composer?.schedule(ctx.currentTime + 8)
        void this.media?.play().catch(() => {})
      })
      this.timer = window.setInterval(() => this.composer?.schedule(ctx.currentTime + 8), 2000)
    } else {
      g.master.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
      // Once silent, stop the clock: the music picks up where it left off, and no CPU is used meanwhile.
      this.idle = window.setTimeout(() => {
        this.media?.pause()
        void ctx.suspend()
      }, 600)
    }
  }
}

export const engine = new AudioEngine()

/**
 * Renders the music (and a few interface sounds) to a buffer without playing
 * it. Used by the developer check that looks at loudness and clipping.
 */
export async function renderPreview(seconds: number, sfx: [Sfx, number][] = [], options: { music?: boolean; seed?: number } = {}) {
  const sampleRate = 44100
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * seconds), sampleRate)
  const rng = mulberry32(options.seed ?? 7)
  const g = buildGraph(ctx, rng)
  // The same levels as the default slider positions (see sound.ts).
  g.musicFader.gain.value = g.musicSendFader.gain.value = 0.6 * 0.6 * 1.6
  g.sfxFader.gain.value = g.sfxSendFader.gain.value = 0.7 * 0.7 * 2.4
  if (options.music !== false) new Composer(g, rng, 0).schedule(seconds)
  sfx.forEach(([name, at], i) => playSfx(g, name, at, i))
  return ctx.startRendering()
}
