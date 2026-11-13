import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import type { AircraftData } from '../data/aircraft'
import { useL, useT } from '../i18n/useT'
import { presentation } from '../presentation'
import { deviceIsTouch, useStore } from '../store'
import { Icon } from './icons'
import { useUi } from './uiStore'

/** Loading indicator for the model download (the opening screen has its own). */
export function LoadingOverlay() {
  const t = useT()
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="loading" role="status">
      <div className="loading-bar">
        <span style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <p>{t('loading')}</p>
    </div>
  )
}

const embedded = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

/**
 * Inside an iframe on a phone, a full-size 3D canvas would swallow every
 * swipe and trap page scrolling. Until the learner taps, the canvas ignores
 * touch. The opening screen does the same job when it is shown, so this gate
 * is only needed when it is skipped (?intro=0).
 */
export function EmbedGate() {
  const t = useT()
  const [open, setOpen] = useState(!(embedded && deviceIsTouch) || presentation.showIntro)
  if (open) return null
  return (
    <button className="embed-gate" onClick={() => setOpen(true)}>
      <span>{t('tapToInteract')}</span>
    </button>
  )
}

/** Credits (always visible: the model's licence requires it) and the "schematic" note for the Systems view. */
export function StageNotes({ data }: { data: AircraftData }) {
  const t = useT()
  const L = useL()
  const level = useStore((s) => s.level)
  const [open, setOpen] = useState(false)
  const credits = data.aircraft.credits
  return (
    <div className="stage-notes">
      <div className="credits">
        <button className="note-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {t('credits')}
        </button>
        {open && (
          <div className="popover credits-pop">
            {data.aircraft.disclaimer && <p dir="auto">{L(data.aircraft.disclaimer)}</p>}
            <ul>
              {credits.map((c, i) => (
                <li key={i} dir="ltr">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}{' '}
                  by {c.author} ({c.license})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {level === 'systems' && <span className="note">{t('schematicNote')}</span>}
    </div>
  )
}

/** A short reminder of how to move the camera. It fades once the learner starts, or after a few seconds. */
export function ControlsHint() {
  const t = useT()
  const exploring = useUi((s) => s.phase === 'explore')
  const [state, setState] = useState<'waiting' | 'shown' | 'done'>('waiting')

  useEffect(() => {
    if (!exploring || state !== 'waiting') return
    // Let the opening camera move finish before asking for attention.
    const id = window.setTimeout(() => setState('shown'), presentation.showIntro ? 1500 : 600)
    return () => window.clearTimeout(id)
  }, [exploring, state])

  useEffect(() => {
    if (state !== 'shown') return
    const done = () => setState('done')
    const used = (e: Event) => (e.target as Element | null)?.tagName === 'CANVAS' && done()
    const id = window.setTimeout(done, 9000)
    window.addEventListener('pointerdown', used)
    window.addEventListener('wheel', used, { passive: true })
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', used)
      window.removeEventListener('wheel', used)
    }
  }, [state])

  if (state === 'done') return null
  return (
    <div className="controls-hint" data-shown={state === 'shown'} aria-hidden={state !== 'shown'}>
      <span>
        <Icon name="rotate" size={16} />
        {t('hintRotate')}
      </span>
      <span>
        <Icon name="zoom" size={16} />
        {deviceIsTouch ? t('hintZoomTouch') : t('hintZoom')}
      </span>
      <span>
        <Icon name="move" size={16} />
        {deviceIsTouch ? t('hintPanTouch') : t('hintPan')}
      </span>
    </div>
  )
}

/** Desktop: small tabs on the edges of the 3D view that fold the side columns away, for a bigger view when presenting. */
export function PanelHandles() {
  const t = useT()
  const sideOpen = useUi((s) => s.sideOpen)
  const panelOpen = useUi((s) => s.panelOpen)
  const toggleSide = useUi((s) => s.toggleSide)
  const togglePanel = useUi((s) => s.togglePanel)
  return (
    <>
      <button className="handle start desktop-only" onClick={toggleSide} aria-expanded={sideOpen} aria-label={sideOpen ? t('hideList') : t('showList')} title={sideOpen ? t('hideList') : t('showList')}>
        <Icon name={sideOpen ? 'chevronLeft' : 'chevronRight'} size={14} className="flip-rtl" />
      </button>
      <button className="handle end desktop-only" onClick={togglePanel} aria-expanded={panelOpen} aria-label={panelOpen ? t('hideDetails') : t('showDetails')} title={panelOpen ? t('hideDetails') : t('showDetails')}>
        <Icon name={panelOpen ? 'chevronRight' : 'chevronLeft'} size={14} className="flip-rtl" />
      </button>
    </>
  )
}
